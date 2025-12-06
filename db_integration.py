"""
Database Integration Module for App.py
======================================

This module provides the integration layer between App.py and the Supabase database.
It replaces the hardcoded BOTS configuration with database-backed configuration
and adds real-time sync via PostgreSQL LISTEN/NOTIFY.

USAGE:
------
1. Add to your App.py imports:
   from db_integration import DatabaseIntegration, get_db_manager

2. In your Orchestrator class, replace the static BOTS loading:
   
   # OLD:
   # self.bots_cfg = BOTS
   
   # NEW:
   self.db_integration = DatabaseIntegration()
   self.bots_cfg = self.db_integration.load_channel_configs()
   self.db_integration.start_sync(self._on_config_change)

3. Add the callback handler:
   
   def _on_config_change(self, payload: dict):
       '''Handle real-time config changes from dashboard'''
       operation = payload.get('operation')
       channel_id = payload.get('id') or payload.get('channel_id')
       
       if operation == 'INSERT':
           # Load and add new channel
           new_config = self.db_integration.get_channel_config(channel_id)
           if new_config:
               self._add_channel_bot(new_config)
               
       elif operation == 'DELETE':
           # Remove channel bot
           channel_key = payload.get('channel_key')
           self._remove_channel_bot(channel_key)
           
       elif operation in ('UPDATE', 'CONFIG_UPDATE'):
           # Reload channel configuration
           updated_config = self.db_integration.get_channel_config(channel_id)
           if updated_config:
               self._update_channel_bot(updated_config)

ENVIRONMENT VARIABLES:
----------------------
Required (set one of these):
- DATABASE_URL: Full PostgreSQL connection string
  Example: postgresql://user:pass@host:5432/dbname

Or Supabase-specific:
- SUPABASE_URL: Your Supabase project URL
- SUPABASE_KEY: Your Supabase anon key
- SUPABASE_SERVICE_KEY: Your Supabase service role key (for admin operations)

Or individual components:
- DB_HOST: Database host
- DB_PORT: Database port (default: 5432)
- DB_NAME: Database name
- DB_USER: Database user
- DB_PASSWORD: Database password
"""

from __future__ import annotations

import asyncio
import logging
import os
import threading
from typing import Dict, List, Optional, Callable, Any
from dataclasses import dataclass, field

# Import from the database module
from database import (
    DatabaseManager,
    PostgresNotifyListener,
    ChannelRepository,
    TradeRepository,
    BotConfig,
    Instrument,
    FinalTPPolicy,
    RiskFreePolicy,
    CancelPolicy,
    CommandRouterConfig,
    CircuitBreaker,
    TrendFilterConfig,
    DeclineReasonCategory
)

logger = logging.getLogger(__name__)

# ============================================================================
# Global Database Manager Instance
# ============================================================================

_db_manager: Optional[DatabaseManager] = None

def get_db_manager() -> DatabaseManager:
    """Get or create the global database manager instance"""
    global _db_manager
    if _db_manager is None:
        _db_manager = DatabaseManager()
    return _db_manager

# ============================================================================
# Database Integration Class
# ============================================================================

class DatabaseIntegration:
    """
    Integration layer between App.py and the Supabase database.
    
    Provides:
    - Channel configuration loading from database
    - Trade logging to database
    - Real-time sync via LISTEN/NOTIFY
    """
    
    def __init__(self, database_url: Optional[str] = None):
        """
        Initialize database integration.
        
        Args:
            database_url: Optional database URL. If not provided, will use
                         environment variables.
        """
        self.db = DatabaseManager(database_url)
        self._config_callbacks: List[Callable[[dict], None]] = []
        self._trade_callbacks: List[Callable[[dict], None]] = []
        self._channel_id_map: Dict[str, str] = {}  # channel_key -> db_id
        self._running = False
        
        logger.info("Database integration initialized")
    
    def load_channel_configs(self) -> List[BotConfig]:
        """
        Load all active channel configurations from the database.
        Returns list of BotConfig objects compatible with App.py.
        """
        try:
            configs = self.db.channels.get_all_active_channels()
            
            # Build channel_key -> id map for later lookups
            self._channel_id_map = {c.channel_key: c.id for c in configs}
            
            logger.info(f"Loaded {len(configs)} channel configurations from database")
            return configs
            
        except Exception as e:
            logger.error(f"Failed to load channel configs: {e}")
            raise
    
    def get_channel_config(self, channel_id: str) -> Optional[BotConfig]:
        """Get a single channel configuration by ID"""
        try:
            config = self.db.channels.get_channel_by_id(channel_id)
            if config:
                self._channel_id_map[config.channel_key] = config.id
            return config
        except Exception as e:
            logger.error(f"Failed to get channel config {channel_id}: {e}")
            return None
    
    def get_channel_id(self, channel_key: str) -> Optional[str]:
        """Get database ID for a channel key"""
        return self._channel_id_map.get(channel_key)
    
    def update_telegram_id(self, channel_key: str, telegram_id: int) -> bool:
        """Update the resolved Telegram channel ID for a channel"""
        channel_id = self._channel_id_map.get(channel_key)
        if channel_id:
            return self.db.channels.update_telegram_id(channel_id, telegram_id)
        return False
    
    # ========================================================================
    # Real-time Sync
    # ========================================================================
    
    def start_sync(
        self,
        on_config_change: Optional[Callable[[dict], None]] = None,
        on_trade_change: Optional[Callable[[dict], None]] = None
    ):
        """
        Start real-time synchronization with the database.
        
        Args:
            on_config_change: Callback for channel configuration changes.
                             Receives payload dict with 'operation', 'id', etc.
            on_trade_change: Callback for trade updates.
        """
        if self._running:
            logger.warning("Sync already running")
            return
        
        if on_config_change:
            self._config_callbacks.append(on_config_change)
        if on_trade_change:
            self._trade_callbacks.append(on_trade_change)
        
        # Start the LISTEN/NOTIFY listener
        self.db.start_listener({
            'channel_changes': self._handle_channel_change,
            'config_changes': self._handle_config_change,
            'trade_changes': self._handle_trade_change
        })
        
        self._running = True
        logger.info("Real-time database sync started")
    
    def stop_sync(self):
        """Stop real-time synchronization"""
        if not self._running:
            return
        
        self.db.stop_listener()
        self._running = False
        logger.info("Real-time database sync stopped")
    
    def _handle_channel_change(self, payload: dict):
        """Handle channel_changes notifications"""
        logger.debug(f"Channel change notification: {payload}")
        for callback in self._config_callbacks:
            try:
                callback(payload)
            except Exception as e:
                logger.error(f"Config callback error: {e}")
    
    def _handle_config_change(self, payload: dict):
        """Handle config_changes notifications (policy updates)"""
        logger.debug(f"Config change notification: {payload}")
        for callback in self._config_callbacks:
            try:
                callback(payload)
            except Exception as e:
                logger.error(f"Config callback error: {e}")
    
    def _handle_trade_change(self, payload: dict):
        """Handle trade_changes notifications"""
        logger.debug(f"Trade change notification: {payload}")
        for callback in self._trade_callbacks:
            try:
                callback(payload)
            except Exception as e:
                logger.error(f"Trade callback error: {e}")
    
    # ========================================================================
    # Trade Logging (Replaces CSV/SQLite TradeJournal)
    # ========================================================================
    
    def log_signal_parsed(
        self,
        channel_name: str,
        msg_id: int,
        symbol: str,
        side: str,
        entry: Optional[float],
        sl: float,
        tp: Optional[float],
        tp_prices: Optional[List[float]] = None,
        rf_price: Optional[float] = None,
        cancel_price: Optional[float] = None,
        order_hint: str = "auto",
        raw_signal: Optional[str] = None
    ) -> str:
        """Log a newly parsed signal to the database"""
        channel_id = self._channel_id_map.get(channel_name)
        
        return self.db.trades.log_signal_parsed(
            channel_id=channel_id,
            channel_name=channel_name,
            msg_id=msg_id,
            symbol=symbol,
            side=side,
            entry=entry,
            sl=sl,
            tp=tp,
            tp_prices=tp_prices,
            rf_price=rf_price,
            cancel_price=cancel_price,
            order_hint=order_hint,
            raw_signal=raw_signal
        )
    
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
        self.db.trades.log_order_placed(
            trade_id=trade_id,
            order_type=order_type,
            ticket=ticket,
            lot_size=lot_size,
            risk_amount=risk_amount,
            risk_percent=risk_percent,
            actual_entry=actual_entry
        )
    
    def log_pending_to_active(self, trade_id: str, fill_price: float, fill_time):
        """Log when a pending order is filled"""
        self.db.trades.log_pending_to_active(trade_id, fill_price, fill_time)
    
    def log_risk_free_moved(self, trade_id: str):
        """Log when stop loss is moved to breakeven"""
        self.db.trades.log_risk_free_moved(trade_id)
    
    def log_pending_canceled(self, trade_id: str, reason: str = "Cancel condition met"):
        """Log when a pending order is canceled"""
        self.db.trades.log_pending_canceled(trade_id, reason)
    
    def log_trade_blocked(
        self,
        trade_id: str,
        reason: str,
        category: DeclineReasonCategory,
        details: Optional[dict] = None
    ):
        """Log when a trade is blocked due to risk validation or trend filter"""
        self.db.trades.log_trade_blocked(trade_id, reason, category, details)
    
    def log_position_closed(
        self,
        trade_id: str,
        close_price: float,
        profit_loss: float,
        entry_price: float,
        side: str,
        pip_size: float,
        open_time,
        commission: float = 0.0,
        swap: float = 0.0
    ):
        """Log when a position is closed"""
        self.db.trades.log_position_closed(
            trade_id=trade_id,
            close_price=close_price,
            profit_loss=profit_loss,
            entry_price=entry_price,
            side=side,
            pip_size=pip_size,
            open_time=open_time,
            commission=commission,
            swap=swap
        )
    
    def get_trade_id_by_ticket(self, ticket: int) -> Optional[str]:
        """Get trade_id by MT5 ticket number"""
        trade = self.db.trades.get_trade_by_ticket(ticket)
        return trade.get('trade_id') if trade else None
    
    def get_trade_id_by_msg_id(self, msg_id: int) -> Optional[str]:
        """Get trade_id by Telegram message ID"""
        trade = self.db.trades.get_trade_by_msg_id(msg_id)
        return trade.get('trade_id') if trade else None

# ============================================================================
# Example: Modified Orchestrator Startup
# ============================================================================

EXAMPLE_ORCHESTRATOR_MODIFICATIONS = '''
# Add these modifications to your Orchestrator class in App.py:

class Orchestrator:
    def __init__(self, api_id, api_hash, session, bots_cfg=None, log_channel_id=None):
        # ... existing init code ...
        
        # NEW: Initialize database integration
        self.db_integration = DatabaseIntegration()
        
        # Load configs from database instead of hardcoded BOTS list
        if bots_cfg is None:
            self.bots_cfg = self.db_integration.load_channel_configs()
        else:
            self.bots_cfg = bots_cfg
        
        # ... rest of existing init ...
    
    async def start(self):
        # ... existing startup code ...
        
        # NEW: Start real-time sync after client is ready
        self.db_integration.start_sync(
            on_config_change=self._on_config_change,
            on_trade_change=self._on_trade_change
        )
        
        # ... rest of existing start ...
    
    def _on_config_change(self, payload: dict):
        """Handle real-time config changes from dashboard"""
        operation = payload.get('operation')
        channel_id = payload.get('id') or payload.get('channel_id')
        channel_key = payload.get('channel_key')
        
        logger.info(f"Config change received: {operation} for {channel_key or channel_id}")
        
        if operation == 'INSERT':
            # Load and add new channel
            new_config = self.db_integration.get_channel_config(channel_id)
            if new_config:
                asyncio.create_task(self._add_channel_bot(new_config))
                
        elif operation == 'DELETE':
            # Remove channel bot
            if channel_key:
                self._remove_channel_bot(channel_key)
                
        elif operation in ('UPDATE', 'CONFIG_UPDATE'):
            # Reload channel configuration
            if channel_id:
                updated_config = self.db_integration.get_channel_config(channel_id)
                if updated_config:
                    self._update_channel_bot(updated_config)
    
    def _on_trade_change(self, payload: dict):
        """Handle trade updates (optional - for dashboard sync)"""
        pass  # Dashboard uses its own listener
    
    async def _add_channel_bot(self, config: BotConfig):
        """Add a new channel bot at runtime"""
        try:
            # Resolve the Telegram channel
            entity = await self.client.get_entity(config.channel_key)
            channel_id = entity.id
            
            # Update the database with resolved ID
            self.db_integration.update_telegram_id(config.channel_key, channel_id)
            
            # Create the bot instance
            bot = ChannelBot(config, self.mt5x, self.db_integration)
            self.bots[channel_id] = bot
            self.title_map[channel_id] = config.channel_key
            
            logger.info(f"Added new channel bot: {config.channel_key}")
            print_block("CHANNEL ADDED", [f"Channel: {config.channel_key}"])
            
        except Exception as e:
            logger.error(f"Failed to add channel {config.channel_key}: {e}")
    
    def _remove_channel_bot(self, channel_key: str):
        """Remove a channel bot at runtime"""
        # Find and remove the bot
        for channel_id, name in list(self.title_map.items()):
            if name == channel_key:
                del self.bots[channel_id]
                del self.title_map[channel_id]
                logger.info(f"Removed channel bot: {channel_key}")
                print_block("CHANNEL REMOVED", [f"Channel: {channel_key}"])
                break
    
    def _update_channel_bot(self, config: BotConfig):
        """Update a channel bot configuration at runtime"""
        # Find the bot and update its config
        for channel_id, name in self.title_map.items():
            if name == config.channel_key:
                if channel_id in self.bots:
                    self.bots[channel_id].cfg = config
                    logger.info(f"Updated channel bot config: {config.channel_key}")
                    print_block("CHANNEL UPDATED", [f"Channel: {config.channel_key}"])
                break
'''

# ============================================================================
# Example: Using DatabaseIntegration as TradeJournal Replacement
# ============================================================================

EXAMPLE_TRADE_JOURNAL_REPLACEMENT = '''
# In your ChannelBot class, replace TradeJournal with DatabaseIntegration:

class ChannelBot:
    def __init__(self, cfg: BotConfig, mt5x: MT5Executor, db_integration: DatabaseIntegration):
        self.cfg = cfg
        self.mt5x = mt5x
        self.db = db_integration  # Replaces self.journal = TradeJournal()
        
    def _log_signal(self, signal: ParsedSignal, order_hint: str) -> str:
        """Log a parsed signal"""
        return self.db.log_signal_parsed(
            channel_name=self.cfg.channel_key,
            msg_id=signal.msg_id,
            symbol=signal.symbol,
            side=signal.side,
            entry=signal.entry,
            sl=signal.sl,
            tp=signal.final_tp,
            tp_prices=signal.tps,
            rf_price=getattr(signal, 'risk_free_price', None),
            cancel_price=getattr(signal, 'cancel_price', None),
            order_hint=order_hint,
            raw_signal=signal.raw_text if hasattr(signal, 'raw_text') else None
        )
    
    def _log_order(self, trade_id: str, order_type: str, ticket: int, 
                   lot_size: float, risk_amount: float, risk_percent: float):
        """Log an executed order"""
        self.db.log_order_placed(
            trade_id=trade_id,
            order_type=order_type,
            ticket=ticket,
            lot_size=lot_size,
            risk_amount=risk_amount,
            risk_percent=risk_percent
        )
    
    def _log_blocked(self, trade_id: str, reason: str, 
                     category: DeclineReasonCategory, details: dict = None):
        """Log a blocked trade with reason"""
        self.db.log_trade_blocked(
            trade_id=trade_id,
            reason=reason,
            category=category,
            details=details
        )
'''

if __name__ == "__main__":
    # Test the database integration
    import sys
    
    print("Testing Database Integration...")
    print("=" * 60)
    
    try:
        db = DatabaseIntegration()
        
        # Test loading configs
        configs = db.load_channel_configs()
        print(f"✅ Loaded {len(configs)} channels from database")
        
        for cfg in configs:
            print(f"   - {cfg.channel_key} (magic: {cfg.magic})")
        
        # Test connection
        if db.db.test_connection():
            print("✅ Database connection successful")
        else:
            print("❌ Database connection failed")
            sys.exit(1)
        
        print("=" * 60)
        print("Database integration test passed!")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)
