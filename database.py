"""
Database Models and Utilities for Trading Bot
Supabase/PostgreSQL Integration with LISTEN/NOTIFY support
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import select
import threading
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Dict, List, Optional, Any, Callable, Union
from enum import Enum

import psycopg2
import psycopg2.extensions
from psycopg2.extras import RealDictCursor, Json

# Try async drivers
try:
    import asyncpg
    ASYNCPG_AVAILABLE = True
except ImportError:
    ASYNCPG_AVAILABLE = False

try:
    from supabase import create_client, Client
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False

logger = logging.getLogger(__name__)

# ============================================================================
# Enums matching database types
# ============================================================================

class OrderType(str, Enum):
    MARKET = 'market'
    LIMIT = 'limit'

class TradeSide(str, Enum):
    BUY = 'buy'
    SELL = 'sell'

class TradeStatus(str, Enum):
    PARSED = 'parsed'
    PENDING = 'pending'
    ACTIVE = 'active'
    CLOSED = 'closed'
    CANCELED = 'canceled'
    BLOCKED = 'blocked'
    DECLINED = 'declined'

class TradeOutcome(str, Enum):
    PROFIT = 'profit'
    LOSS = 'loss'
    BREAKEVEN = 'breakeven'
    CANCELED = 'canceled'
    BLOCKED = 'blocked'

class DeclineReasonCategory(str, Enum):
    TREND_FILTER = 'trend_filter'
    RISK_EXCEEDED = 'risk_exceeded'
    CIRCUIT_BREAKER = 'circuit_breaker'
    INVALID_SIGNAL = 'invalid_signal'
    INVALID_SL = 'invalid_sl'
    INVALID_ENTRY = 'invalid_entry'
    INSTRUMENT_NOT_FOUND = 'instrument_not_found'
    MT5_ERROR = 'mt5_error'
    MARKET_CLOSED = 'market_closed'
    SPREAD_TOO_WIDE = 'spread_too_wide'
    DUPLICATE_SIGNAL = 'duplicate_signal'
    MANUAL_SKIP = 'manual_skip'
    OTHER = 'other'

# ============================================================================
# Data Classes for Configuration
# ============================================================================

@dataclass
class Instrument:
    logical: str
    broker_symbol: str
    pip_tolerance_pips: float = 1.5

@dataclass
class FinalTPPolicy:
    kind: str = "rr"  # 'tp_index' or 'rr'
    tp_index: Optional[int] = 1
    rr_ratio: Optional[float] = 1.0

@dataclass
class RiskFreePolicy:
    kind: str = "%path"  # 'tp_index', 'pips', '%path'
    tp_index: Optional[int] = 1
    pips: Optional[float] = 10.0
    percent: Optional[float] = 50.0
    enabled: bool = False

@dataclass
class CancelPolicy:
    kind: str = "final_tp"  # 'tp_index', 'final_tp', '%path'
    tp_index: Optional[int] = 1
    percent: Optional[float] = 50.0
    enable_for_hint: Dict[str, bool] = field(default_factory=lambda: {"now": True, "limit": True, "auto": True})
    enabled: bool = True

@dataclass
class CommandRouterConfig:
    close_phrases: List[str] = field(default_factory=lambda: [r"\bclose (?:this|order)\b", r"\bremove for now\b"])
    cancel_limit_phrases: List[str] = field(default_factory=lambda: [r"\bcancel (?:this|order)\b", r"\bcancel for now\b"])
    riskfree_phrases: List[str] = field(default_factory=list)
    enable_close: bool = True
    enable_cancel_limit: bool = True
    enable_riskfree: bool = False

@dataclass
class CircuitBreaker:
    max_daily_trades: int = 100
    max_daily_loss_pct: float = 10.0
    enabled: bool = True

@dataclass
class TrendFilterConfig:
    enabled: bool = False
    swing_strength: int = 2
    min_swings_required: int = 2
    ema_period: int = 50
    candles_to_fetch: int = 100
    require_all_three: bool = False
    log_details: bool = True

@dataclass
class BotConfig:
    """Full channel configuration - matches App.py BotConfig"""
    channel_key: str
    instruments: List[Instrument] = field(default_factory=list)
    risk_per_trade: float = 0.02
    risk_tolerance: float = 0.10
    final_tp_policy: FinalTPPolicy = field(default_factory=FinalTPPolicy)
    riskfree_policy: Optional[RiskFreePolicy] = None
    cancel_policy: Optional[CancelPolicy] = None
    commands: CommandRouterConfig = field(default_factory=CommandRouterConfig)
    circuit_breaker: CircuitBreaker = field(default_factory=CircuitBreaker)
    trend_filter: TrendFilterConfig = field(default_factory=TrendFilterConfig)
    magic: int = 123456
    max_slippage_points: int = 20
    trade_monitor_interval_sec: float = 0.5
    
    # Database fields
    id: Optional[str] = None
    telegram_id: Optional[int] = None
    is_active: bool = True
    
    def logical_to_broker(self, logical_symbol: str) -> Optional[str]:
        t = logical_symbol.upper().replace("/", "")
        for ins in self.instruments:
            if ins.logical.upper().replace("/", "") == t:
                return ins.broker_symbol
        return None

    def get_instrument(self, broker_symbol: str) -> Optional[Instrument]:
        b = broker_symbol.upper().replace("/", "")
        for ins in self.instruments:
            if ins.broker_symbol.upper().replace("/", "") == b:
                return ins
        return None

# ============================================================================
# Database Connection Manager
# ============================================================================

class DatabaseConfig:
    """Database configuration from environment variables"""
    
    def __init__(self):
        self.supabase_url = os.getenv('SUPABASE_URL')
        self.supabase_key = os.getenv('SUPABASE_KEY')
        self.supabase_service_key = os.getenv('SUPABASE_SERVICE_KEY')
        self.database_url = os.getenv('DATABASE_URL')
        
        # Parse DATABASE_URL or construct from individual vars
        if not self.database_url:
            self.database_url = self._construct_database_url()
    
    def _construct_database_url(self) -> Optional[str]:
        """Construct DATABASE_URL from individual components"""
        host = os.getenv('DB_HOST')
        port = os.getenv('DB_PORT', '5432')
        database = os.getenv('DB_NAME')
        user = os.getenv('DB_USER')
        password = os.getenv('DB_PASSWORD')
        
        if all([host, database, user, password]):
            return f"postgresql://{user}:{password}@{host}:{port}/{database}"
        return None
    
    @property
    def is_configured(self) -> bool:
        return bool(self.database_url or (self.supabase_url and self.supabase_key))

# ============================================================================
# LISTEN/NOTIFY Handler for Real-time Sync
# ============================================================================

class PostgresNotifyListener:
    """
    Listens for PostgreSQL NOTIFY events on specified channels.
    Used by App.py to receive real-time config updates from the dashboard.
    """
    
    def __init__(self, database_url: str):
        self.database_url = database_url
        self.conn: Optional[psycopg2.extensions.connection] = None
        self.running = False
        self._thread: Optional[threading.Thread] = None
        self._callbacks: Dict[str, List[Callable]] = {
            'channel_changes': [],
            'config_changes': [],
            'trade_changes': []
        }
    
    def add_callback(self, channel: str, callback: Callable[[dict], None]):
        """Register a callback for a notification channel"""
        if channel not in self._callbacks:
            self._callbacks[channel] = []
        self._callbacks[channel].append(callback)
    
    def _connect(self):
        """Establish connection and listen on channels"""
        self.conn = psycopg2.connect(self.database_url)
        self.conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
        
        cursor = self.conn.cursor()
        for channel in self._callbacks.keys():
            cursor.execute(f"LISTEN {channel};")
        cursor.close()
        
        logger.info(f"PostgreSQL NOTIFY listener connected, listening on: {list(self._callbacks.keys())}")
    
    def _listen_loop(self):
        """Main listening loop running in a thread"""
        while self.running:
            try:
                if self.conn is None or self.conn.closed:
                    self._connect()
                
                # Wait for notification with timeout
                if select.select([self.conn], [], [], 5.0)[0]:
                    self.conn.poll()
                    while self.conn.notifies:
                        notify = self.conn.notifies.pop(0)
                        self._handle_notification(notify)
                        
            except psycopg2.OperationalError as e:
                logger.error(f"Database connection error: {e}")
                self.conn = None
                if self.running:
                    import time
                    time.sleep(5)  # Wait before reconnecting
                    
            except Exception as e:
                logger.error(f"Listener error: {e}", exc_info=True)
    
    def _handle_notification(self, notify):
        """Process received notification"""
        channel = notify.channel
        try:
            payload = json.loads(notify.payload) if notify.payload else {}
        except json.JSONDecodeError:
            payload = {'raw': notify.payload}
        
        logger.debug(f"Received notification on {channel}: {payload}")
        
        for callback in self._callbacks.get(channel, []):
            try:
                callback(payload)
            except Exception as e:
                logger.error(f"Callback error for {channel}: {e}")
    
    def start(self):
        """Start the listener thread"""
        if self.running:
            return
        
        self.running = True
        self._thread = threading.Thread(target=self._listen_loop, daemon=True)
        self._thread.start()
        logger.info("PostgreSQL NOTIFY listener started")
    
    def stop(self):
        """Stop the listener"""
        self.running = False
        if self._thread:
            self._thread.join(timeout=2.0)
        if self.conn:
            self.conn.close()
        logger.info("PostgreSQL NOTIFY listener stopped")

# ============================================================================
# Database Repository for Channels
# ============================================================================

class ChannelRepository:
    """
    Repository for channel configuration CRUD operations.
    Provides methods to load/save channel configs to/from the database.
    """
    
    def __init__(self, database_url: str):
        self.database_url = database_url
    
    def _get_connection(self):
        return psycopg2.connect(self.database_url, cursor_factory=RealDictCursor)
    
    def get_all_active_channels(self) -> List[BotConfig]:
        """Load all active channels with full configuration"""
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM channel_full_config WHERE is_active = true")
                rows = cur.fetchall()
                return [self._row_to_bot_config(row) for row in rows]
    
    def get_channel_by_key(self, channel_key: str) -> Optional[BotConfig]:
        """Get a single channel by its key"""
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT * FROM channel_full_config WHERE channel_key = %s",
                    (channel_key,)
                )
                row = cur.fetchone()
                return self._row_to_bot_config(row) if row else None
    
    def get_channel_by_id(self, channel_id: str) -> Optional[BotConfig]:
        """Get a single channel by its UUID"""
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT * FROM channel_full_config WHERE id = %s",
                    (channel_id,)
                )
                row = cur.fetchone()
                return self._row_to_bot_config(row) if row else None
    
    def create_channel(self, config: BotConfig) -> str:
        """Create a new channel with all its policies"""
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                # Use the helper function that creates all related records
                cur.execute(
                    "SELECT create_channel_with_defaults(%s, %s, %s, %s)",
                    (config.channel_key, config.channel_key, config.risk_per_trade, config.magic)
                )
                channel_id = cur.fetchone()[0]
                
                # Update with full config
                self._update_channel_config(cur, channel_id, config)
                
                conn.commit()
                return str(channel_id)
    
    def update_channel(self, channel_id: str, config: BotConfig) -> bool:
        """Update an existing channel configuration"""
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                self._update_channel_config(cur, channel_id, config)
                conn.commit()
                return True
    
    def delete_channel(self, channel_id: str) -> bool:
        """Delete a channel (cascades to all related records)"""
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM channels WHERE id = %s", (channel_id,))
                conn.commit()
                return cur.rowcount > 0
    
    def set_channel_active(self, channel_id: str, is_active: bool) -> bool:
        """Enable or disable a channel"""
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE channels SET is_active = %s WHERE id = %s",
                    (is_active, channel_id)
                )
                conn.commit()
                return cur.rowcount > 0
    
    def update_telegram_id(self, channel_id: str, telegram_id: int) -> bool:
        """Update the resolved Telegram channel ID"""
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE channels SET telegram_id = %s WHERE id = %s",
                    (telegram_id, channel_id)
                )
                conn.commit()
                return cur.rowcount > 0
    
    def _update_channel_config(self, cur, channel_id: str, config: BotConfig):
        """Update all configuration tables for a channel"""
        # Update main channel record
        cur.execute("""
            UPDATE channels SET
                channel_key = %s,
                risk_per_trade = %s,
                risk_tolerance = %s,
                magic_number = %s,
                max_slippage_points = %s,
                trade_monitor_interval_sec = %s
            WHERE id = %s
        """, (
            config.channel_key,
            config.risk_per_trade,
            config.risk_tolerance,
            config.magic,
            config.max_slippage_points,
            config.trade_monitor_interval_sec,
            channel_id
        ))
        
        # Update Final TP Policy
        cur.execute("""
            UPDATE final_tp_policies SET
                kind = %s,
                tp_index = %s,
                rr_ratio = %s
            WHERE channel_id = %s
        """, (
            config.final_tp_policy.kind,
            config.final_tp_policy.tp_index,
            config.final_tp_policy.rr_ratio,
            channel_id
        ))
        
        # Update Risk-Free Policy
        if config.riskfree_policy:
            cur.execute("""
                UPDATE riskfree_policies SET
                    is_enabled = %s,
                    kind = %s,
                    tp_index = %s,
                    pips = %s,
                    percent = %s
                WHERE channel_id = %s
            """, (
                config.riskfree_policy.enabled if hasattr(config.riskfree_policy, 'enabled') else True,
                config.riskfree_policy.kind,
                config.riskfree_policy.tp_index,
                config.riskfree_policy.pips,
                config.riskfree_policy.percent,
                channel_id
            ))
        
        # Update Cancel Policy
        if config.cancel_policy:
            enable_for = config.cancel_policy.enable_for_hint
            cur.execute("""
                UPDATE cancel_policies SET
                    is_enabled = %s,
                    kind = %s,
                    tp_index = %s,
                    percent = %s,
                    enable_for_now = %s,
                    enable_for_limit = %s,
                    enable_for_auto = %s
                WHERE channel_id = %s
            """, (
                config.cancel_policy.enabled if hasattr(config.cancel_policy, 'enabled') else True,
                config.cancel_policy.kind,
                config.cancel_policy.tp_index,
                config.cancel_policy.percent,
                enable_for.get('now', True),
                enable_for.get('limit', True),
                enable_for.get('auto', True),
                channel_id
            ))
        
        # Update Command Config
        cur.execute("""
            UPDATE command_configs SET
                enable_close = %s,
                enable_cancel_limit = %s,
                enable_riskfree = %s,
                close_phrases = %s,
                cancel_limit_phrases = %s,
                riskfree_phrases = %s
            WHERE channel_id = %s
        """, (
            config.commands.enable_close,
            config.commands.enable_cancel_limit,
            config.commands.enable_riskfree,
            config.commands.close_phrases,
            config.commands.cancel_limit_phrases,
            config.commands.riskfree_phrases,
            channel_id
        ))
        
        # Update Circuit Breaker
        cur.execute("""
            UPDATE circuit_breaker_configs SET
                is_enabled = %s,
                max_daily_trades = %s,
                max_daily_loss_pct = %s
            WHERE channel_id = %s
        """, (
            config.circuit_breaker.enabled,
            config.circuit_breaker.max_daily_trades,
            config.circuit_breaker.max_daily_loss_pct,
            channel_id
        ))
        
        # Update Trend Filter
        cur.execute("""
            UPDATE trend_filter_configs SET
                is_enabled = %s,
                swing_strength = %s,
                min_swings_required = %s,
                ema_period = %s,
                candles_to_fetch = %s,
                require_all_three = %s,
                log_details = %s
            WHERE channel_id = %s
        """, (
            config.trend_filter.enabled,
            config.trend_filter.swing_strength,
            config.trend_filter.min_swings_required,
            config.trend_filter.ema_period,
            config.trend_filter.candles_to_fetch,
            config.trend_filter.require_all_three,
            config.trend_filter.log_details,
            channel_id
        ))
        
        # Update instruments
        cur.execute("DELETE FROM instruments WHERE channel_id = %s", (channel_id,))
        for inst in config.instruments:
            cur.execute("""
                INSERT INTO instruments (channel_id, logical_symbol, broker_symbol, pip_tolerance_pips)
                VALUES (%s, %s, %s, %s)
            """, (channel_id, inst.logical, inst.broker_symbol, inst.pip_tolerance_pips))
    
    def _row_to_bot_config(self, row: dict) -> BotConfig:
        """Convert a database row to BotConfig dataclass"""
        # Parse instruments
        instruments = []
        if row.get('instruments'):
            for inst in row['instruments']:
                instruments.append(Instrument(
                    logical=inst['logical_symbol'],
                    broker_symbol=inst['broker_symbol'],
                    pip_tolerance_pips=float(inst.get('pip_tolerance_pips', 1.5))
                ))
        
        # Parse Final TP Policy
        ftp_data = row.get('final_tp_policy', {})
        final_tp = FinalTPPolicy(
            kind=ftp_data.get('kind', 'rr'),
            tp_index=ftp_data.get('tp_index'),
            rr_ratio=float(ftp_data.get('rr_ratio', 1.0)) if ftp_data.get('rr_ratio') else None
        )
        
        # Parse Risk-Free Policy
        rfp_data = row.get('riskfree_policy', {})
        riskfree = None
        if rfp_data.get('enabled'):
            riskfree = RiskFreePolicy(
                kind=rfp_data.get('kind', '%path'),
                tp_index=rfp_data.get('tp_index'),
                pips=float(rfp_data.get('pips', 10)) if rfp_data.get('pips') else None,
                percent=float(rfp_data.get('percent', 50)) if rfp_data.get('percent') else None,
                enabled=True
            )
        
        # Parse Cancel Policy
        cp_data = row.get('cancel_policy', {})
        cancel = None
        if cp_data.get('enabled'):
            cancel = CancelPolicy(
                kind=cp_data.get('kind', 'final_tp'),
                tp_index=cp_data.get('tp_index'),
                percent=float(cp_data.get('percent', 50)) if cp_data.get('percent') else None,
                enable_for_hint={
                    'now': cp_data.get('enable_for_now', True),
                    'limit': cp_data.get('enable_for_limit', True),
                    'auto': cp_data.get('enable_for_auto', True)
                },
                enabled=True
            )
        
        # Parse Commands
        cmd_data = row.get('commands', {})
        commands = CommandRouterConfig(
            enable_close=cmd_data.get('enable_close', True),
            enable_cancel_limit=cmd_data.get('enable_cancel_limit', True),
            enable_riskfree=cmd_data.get('enable_riskfree', False),
            close_phrases=cmd_data.get('close_phrases', []),
            cancel_limit_phrases=cmd_data.get('cancel_limit_phrases', []),
            riskfree_phrases=cmd_data.get('riskfree_phrases', [])
        )
        
        # Parse Circuit Breaker
        cb_data = row.get('circuit_breaker', {})
        circuit_breaker = CircuitBreaker(
            enabled=cb_data.get('enabled', True),
            max_daily_trades=cb_data.get('max_daily_trades', 100),
            max_daily_loss_pct=float(cb_data.get('max_daily_loss_pct', 10))
        )
        
        # Parse Trend Filter
        tf_data = row.get('trend_filter', {})
        trend_filter = TrendFilterConfig(
            enabled=tf_data.get('enabled', False),
            swing_strength=tf_data.get('swing_strength', 2),
            min_swings_required=tf_data.get('min_swings_required', 2),
            ema_period=tf_data.get('ema_period', 50),
            candles_to_fetch=tf_data.get('candles_to_fetch', 100),
            require_all_three=tf_data.get('require_all_three', False),
            log_details=tf_data.get('log_details', True)
        )
        
        return BotConfig(
            id=str(row['id']),
            channel_key=row['channel_key'],
            telegram_id=row.get('telegram_id'),
            is_active=row.get('is_active', True),
            instruments=instruments,
            risk_per_trade=float(row.get('risk_per_trade', 0.02)),
            risk_tolerance=float(row.get('risk_tolerance', 0.10)),
            final_tp_policy=final_tp,
            riskfree_policy=riskfree,
            cancel_policy=cancel,
            commands=commands,
            circuit_breaker=circuit_breaker,
            trend_filter=trend_filter,
            magic=row.get('magic_number', 123456),
            max_slippage_points=row.get('max_slippage_points', 20),
            trade_monitor_interval_sec=float(row.get('trade_monitor_interval_sec', 0.5))
        )

# ============================================================================
# Database Repository for Trades
# ============================================================================

class TradeRepository:
    """Repository for trade/signal CRUD operations"""
    
    def __init__(self, database_url: str):
        self.database_url = database_url
    
    def _get_connection(self):
        return psycopg2.connect(self.database_url, cursor_factory=RealDictCursor)
    
    def log_signal_parsed(
        self,
        channel_id: Optional[str],
        channel_name: str,
        msg_id: int,
        symbol: str,
        side: str,
        entry: Optional[float],
        sl: float,
        tp: Optional[float],
        tp_prices: Optional[List[float]],
        rf_price: Optional[float],
        cancel_price: Optional[float],
        order_hint: str,
        raw_signal: Optional[str] = None
    ) -> str:
        """Log a newly parsed signal"""
        trade_id = self._generate_trade_id(channel_name, msg_id)
        
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO trades (
                        trade_id, channel_id, channel_name, msg_id, symbol,
                        signal_time, order_hint, side, entry_price, sl_price,
                        final_tp_price, tp_prices, risk_free_price, cancel_price,
                        status, raw_signal_text
                    ) VALUES (
                        %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s,
                        %s, %s, %s, %s,
                        'parsed', %s
                    )
                    RETURNING id
                """, (
                    trade_id, channel_id, channel_name, msg_id, symbol,
                    datetime.now(timezone.utc), order_hint.lower(), side.lower(),
                    entry, sl, tp, tp_prices, rf_price, cancel_price, raw_signal
                ))
                conn.commit()
                return trade_id
    
    def log_order_placed(
        self,
        trade_id: str,
        order_type: str,
        ticket: int,
        lot_size: float,
        risk_amount: float,
        risk_percent: float,
        actual_entry: Optional[float] = None
    ):
        """Log when an order is placed in MT5"""
        status = 'pending' if order_type.lower() == 'limit' else 'active'
        
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE trades SET
                        execution_time = %s,
                        order_type = %s,
                        ticket = %s,
                        lot_size = %s,
                        risk_amount = %s,
                        risk_percent = %s,
                        actual_entry_price = %s,
                        status = %s
                    WHERE trade_id = %s
                """, (
                    datetime.now(timezone.utc),
                    order_type.lower(),
                    ticket,
                    lot_size,
                    risk_amount,
                    risk_percent,
                    actual_entry,
                    status,
                    trade_id
                ))
                conn.commit()
    
    def log_pending_to_active(self, trade_id: str, fill_price: float, fill_time: datetime):
        """Log when a pending order is filled"""
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE trades SET
                        execution_time = %s,
                        actual_entry_price = %s,
                        status = 'active'
                    WHERE trade_id = %s
                """, (fill_time, fill_price, trade_id))
                conn.commit()
    
    def log_risk_free_moved(self, trade_id: str):
        """Log when stop loss is moved to breakeven"""
        be_time = datetime.now(timezone.utc)
        
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                # Get execution time to calculate time_to_be
                cur.execute(
                    "SELECT execution_time FROM trades WHERE trade_id = %s",
                    (trade_id,)
                )
                row = cur.fetchone()
                time_to_be = None
                if row and row['execution_time']:
                    time_to_be = be_time - row['execution_time']
                
                cur.execute("""
                    UPDATE trades SET
                        be_moved_at = %s,
                        time_to_be = %s
                    WHERE trade_id = %s
                """, (be_time, time_to_be, trade_id))
                conn.commit()
    
    def log_pending_canceled(self, trade_id: str, reason: str = "Cancel condition met"):
        """Log when a pending order is canceled"""
        cancel_time = datetime.now(timezone.utc)
        
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE trades SET
                        canceled_at = %s,
                        close_time = %s,
                        status = 'canceled',
                        trade_outcome = 'canceled',
                        profit_loss = 0,
                        notes = %s
                    WHERE trade_id = %s
                """, (cancel_time, cancel_time, f'Pending canceled - {reason}', trade_id))
                conn.commit()
    
    def log_trade_blocked(self, trade_id: str, reason: str, category: DeclineReasonCategory,
                          details: Optional[dict] = None):
        """Log when a trade is blocked (risk/trend filter)"""
        block_time = datetime.now(timezone.utc)
        
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                # Update trade status
                cur.execute("""
                    UPDATE trades SET
                        status = 'blocked',
                        trade_outcome = 'blocked',
                        close_time = %s,
                        notes = %s
                    WHERE trade_id = %s
                    RETURNING id
                """, (block_time, f'Trade blocked - {reason}', trade_id))
                
                row = cur.fetchone()
                if row:
                    # Add decline reason
                    cur.execute("""
                        INSERT INTO trade_decline_reasons (
                            trade_id, category, reason_code, reason_detail,
                            trend_filter_details, risk_details
                        ) VALUES (%s, %s, %s, %s, %s, %s)
                    """, (
                        row['id'],
                        category.value,
                        category.value,
                        reason,
                        Json(details) if category == DeclineReasonCategory.TREND_FILTER and details else None,
                        Json(details) if category == DeclineReasonCategory.RISK_EXCEEDED and details else None
                    ))
                
                conn.commit()
    
    def log_position_closed(
        self,
        trade_id: str,
        close_price: float,
        profit_loss: float,
        entry_price: float,
        side: str,
        pip_size: float,
        open_time: Optional[datetime],
        commission: float = 0.0,
        swap: float = 0.0
    ):
        """Log when a position is closed"""
        close_time = datetime.now(timezone.utc)
        duration = (close_time - open_time) if open_time else None
        
        # Calculate pips
        price_diff = abs(close_price - entry_price)
        pips = price_diff / pip_size if pip_size > 0 else 0
        if side.lower() == "buy":
            pips = pips if close_price > entry_price else -pips
        else:
            pips = pips if close_price < entry_price else -pips
        
        # Determine outcome
        if profit_loss > 0.01:
            outcome = 'profit'
        elif profit_loss < -0.01:
            outcome = 'loss'
        else:
            outcome = 'breakeven'
        
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE trades SET
                        close_time = %s,
                        close_price = %s,
                        status = 'closed',
                        trade_outcome = %s,
                        profit_loss = %s,
                        profit_loss_pips = %s,
                        commission = %s,
                        swap = %s,
                        duration = %s
                    WHERE trade_id = %s
                """, (
                    close_time, close_price, outcome, profit_loss, pips,
                    commission, swap, duration, trade_id
                ))
                conn.commit()
    
    def get_trade_by_ticket(self, ticket: int) -> Optional[dict]:
        """Get trade by MT5 ticket number"""
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT * FROM trades WHERE ticket = %s ORDER BY created_at DESC LIMIT 1",
                    (ticket,)
                )
                return cur.fetchone()
    
    def get_trade_by_msg_id(self, msg_id: int) -> Optional[dict]:
        """Get trade by Telegram message ID"""
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT * FROM trades WHERE msg_id = %s ORDER BY created_at DESC LIMIT 1",
                    (msg_id,)
                )
                return cur.fetchone()
    
    def get_trades_by_date_range(
        self,
        start_date: datetime,
        end_date: datetime,
        channel_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 1000
    ) -> List[dict]:
        """Get trades within a date range with optional filters"""
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                query = """
                    SELECT * FROM trades_with_details
                    WHERE signal_time >= %s AND signal_time <= %s
                """
                params = [start_date, end_date]
                
                if channel_id:
                    query += " AND channel_id = %s"
                    params.append(channel_id)
                
                if status:
                    query += " AND status = %s"
                    params.append(status)
                
                query += " ORDER BY signal_time DESC LIMIT %s"
                params.append(limit)
                
                cur.execute(query, params)
                return cur.fetchall()
    
    def get_daily_stats(self, date: datetime.date, channel_id: Optional[str] = None) -> dict:
        """Get aggregated statistics for a day"""
        with self._get_connection() as conn:
            with conn.cursor() as cur:
                query = """
                    SELECT 
                        COUNT(*) as total_signals,
                        COUNT(*) FILTER (WHERE status IN ('active', 'closed')) as executed_trades,
                        COUNT(*) FILTER (WHERE status IN ('blocked', 'declined')) as declined_trades,
                        COUNT(*) FILTER (WHERE trade_outcome = 'profit') as winning_trades,
                        COUNT(*) FILTER (WHERE trade_outcome = 'loss') as losing_trades,
                        COUNT(*) FILTER (WHERE trade_outcome = 'breakeven') as breakeven_trades,
                        COALESCE(SUM(profit_loss), 0) as total_profit_loss,
                        COALESCE(SUM(profit_loss_pips), 0) as total_pips,
                        CASE 
                            WHEN COUNT(*) FILTER (WHERE status = 'closed') > 0 
                            THEN COUNT(*) FILTER (WHERE trade_outcome = 'profit')::float / 
                                 COUNT(*) FILTER (WHERE status = 'closed') * 100
                            ELSE 0 
                        END as win_rate
                    FROM trades
                    WHERE DATE(signal_time) = %s
                """
                params = [date]
                
                if channel_id:
                    query += " AND channel_id = %s"
                    params.append(channel_id)
                
                cur.execute(query, params)
                return cur.fetchone()
    
    @staticmethod
    def _generate_trade_id(channel: str, msg_id: int) -> str:
        """Generate a unique trade ID"""
        import time
        import re
        timestamp = int(time.time() * 1000)
        # Normalize channel name
        channel_short = re.sub(r'[^\w]', '', channel)[:10].lower()
        return f"{channel_short}_{msg_id}_{timestamp}"

# ============================================================================
# Main Database Manager
# ============================================================================

class DatabaseManager:
    """
    Main database manager that provides access to all repositories
    and the LISTEN/NOTIFY listener.
    """
    
    def __init__(self, database_url: Optional[str] = None):
        config = DatabaseConfig()
        self.database_url = database_url or config.database_url
        
        if not self.database_url:
            raise ValueError(
                "Database URL not configured. Set DATABASE_URL environment variable "
                "or provide Supabase credentials (SUPABASE_URL, SUPABASE_KEY)"
            )
        
        self.channels = ChannelRepository(self.database_url)
        self.trades = TradeRepository(self.database_url)
        self._listener: Optional[PostgresNotifyListener] = None
    
    def start_listener(self, callbacks: Optional[Dict[str, Callable]] = None):
        """Start the LISTEN/NOTIFY listener with optional callbacks"""
        self._listener = PostgresNotifyListener(self.database_url)
        
        if callbacks:
            for channel, callback in callbacks.items():
                self._listener.add_callback(channel, callback)
        
        self._listener.start()
    
    def stop_listener(self):
        """Stop the LISTEN/NOTIFY listener"""
        if self._listener:
            self._listener.stop()
    
    def add_listener_callback(self, channel: str, callback: Callable):
        """Add a callback to the listener"""
        if self._listener:
            self._listener.add_callback(channel, callback)
    
    def test_connection(self) -> bool:
        """Test the database connection"""
        try:
            with psycopg2.connect(self.database_url) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
                    return True
        except Exception as e:
            logger.error(f"Database connection test failed: {e}")
            return False

# ============================================================================
# Utility Functions
# ============================================================================

def migrate_csv_to_database(csv_dir: str, db_manager: DatabaseManager):
    """
    Utility to migrate existing CSV trade data to the database.
    Call this once to import historical data.
    """
    import glob
    import pandas as pd
    
    csv_files = glob.glob(f"{csv_dir}/trades_*.csv")
    
    for csv_file in csv_files:
        logger.info(f"Migrating {csv_file}...")
        try:
            df = pd.read_csv(csv_file)
            
            for _, row in df.iterrows():
                # This would need to be adapted based on your CSV structure
                pass
                
        except Exception as e:
            logger.error(f"Error migrating {csv_file}: {e}")
    
    logger.info("Migration complete")
