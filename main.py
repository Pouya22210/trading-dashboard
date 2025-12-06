"""
Trading Bot Web Dashboard - FastAPI Backend
Provides REST API and WebSocket endpoints for real-time dashboard updates
Deploy on Railway with: railway up
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Any
from enum import Enum

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import uvicorn

# Import database utilities
from database import (
    DatabaseManager, BotConfig, Instrument, FinalTPPolicy, RiskFreePolicy,
    CancelPolicy, CommandRouterConfig, CircuitBreaker, TrendFilterConfig,
    DeclineReasonCategory, TradeStatus, TradeOutcome
)

# ============================================================================
# Logging Setup
# ============================================================================

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)-8s | %(name)s | %(message)s'
)
logger = logging.getLogger(__name__)

# ============================================================================
# Pydantic Models for API
# ============================================================================

class InstrumentModel(BaseModel):
    logical_symbol: str = Field(..., alias='logical')
    broker_symbol: str
    pip_tolerance_pips: float = 1.5

    class Config:
        populate_by_name = True

class FinalTPPolicyModel(BaseModel):
    kind: str = "rr"
    tp_index: Optional[int] = 1
    rr_ratio: Optional[float] = 1.0

class RiskFreePolicyModel(BaseModel):
    enabled: bool = False
    kind: str = "%path"
    tp_index: Optional[int] = 1
    pips: Optional[float] = 10.0
    percent: Optional[float] = 50.0

class CancelPolicyModel(BaseModel):
    enabled: bool = True
    kind: str = "final_tp"
    tp_index: Optional[int] = 1
    percent: Optional[float] = 50.0
    enable_for_now: bool = True
    enable_for_limit: bool = True
    enable_for_auto: bool = True

class CommandsConfigModel(BaseModel):
    enable_close: bool = True
    enable_cancel_limit: bool = True
    enable_riskfree: bool = False
    close_phrases: List[str] = [r"\bclose (?:this|order)\b", r"\bremove for now\b"]
    cancel_limit_phrases: List[str] = [r"\bcancel (?:this|order)\b", r"\bcancel for now\b"]
    riskfree_phrases: List[str] = [r"\brisk\s*free now\b", r"\bmove to be\b"]

class CircuitBreakerModel(BaseModel):
    enabled: bool = True
    max_daily_trades: int = 100
    max_daily_loss_pct: float = 10.0

class TrendFilterModel(BaseModel):
    enabled: bool = False
    swing_strength: int = 2
    min_swings_required: int = 2
    ema_period: int = 50
    candles_to_fetch: int = 100
    require_all_three: bool = False
    log_details: bool = True

class ChannelConfigModel(BaseModel):
    """Full channel configuration for API"""
    channel_key: str
    display_name: Optional[str] = None
    is_active: bool = True
    risk_per_trade: float = 0.02
    risk_tolerance: float = 0.10
    magic_number: int = 123456
    max_slippage_points: int = 20
    trade_monitor_interval_sec: float = 0.5
    
    instruments: List[InstrumentModel] = [InstrumentModel(logical='XAUUSD', broker_symbol='XAUUSD')]
    final_tp_policy: FinalTPPolicyModel = FinalTPPolicyModel()
    riskfree_policy: RiskFreePolicyModel = RiskFreePolicyModel()
    cancel_policy: CancelPolicyModel = CancelPolicyModel()
    commands: CommandsConfigModel = CommandsConfigModel()
    circuit_breaker: CircuitBreakerModel = CircuitBreakerModel()
    trend_filter: TrendFilterModel = TrendFilterModel()

class ChannelResponse(ChannelConfigModel):
    """Channel response with database fields"""
    id: str
    telegram_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class TradeModel(BaseModel):
    """Trade/Signal model for API responses"""
    id: str
    trade_id: str
    channel_name: str
    symbol: str
    side: str
    status: str
    signal_time: datetime
    order_type: Optional[str] = None
    entry_price: Optional[float] = None
    sl_price: float
    final_tp_price: Optional[float] = None
    lot_size: Optional[float] = None
    ticket: Optional[int] = None
    trade_outcome: Optional[str] = None
    profit_loss: Optional[float] = None
    profit_loss_pips: Optional[float] = None
    duration: Optional[str] = None
    close_time: Optional[datetime] = None
    be_moved_at: Optional[datetime] = None
    time_to_be: Optional[str] = None
    decline_reasons: List[dict] = []

class DailyStatsModel(BaseModel):
    """Daily statistics model"""
    date: str
    total_signals: int = 0
    executed_trades: int = 0
    declined_trades: int = 0
    winning_trades: int = 0
    losing_trades: int = 0
    breakeven_trades: int = 0
    total_profit_loss: float = 0
    total_pips: float = 0
    win_rate: float = 0

# ============================================================================
# WebSocket Connection Manager
# ============================================================================

class ConnectionManager:
    """Manages WebSocket connections for real-time updates"""
    
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self._lock = asyncio.Lock()
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        async with self._lock:
            self.active_connections.append(websocket)
        logger.info(f"WebSocket connected. Total connections: {len(self.active_connections)}")
    
    async def disconnect(self, websocket: WebSocket):
        async with self._lock:
            if websocket in self.active_connections:
                self.active_connections.remove(websocket)
        logger.info(f"WebSocket disconnected. Total connections: {len(self.active_connections)}")
    
    async def broadcast(self, message: dict):
        """Send message to all connected clients"""
        if not self.active_connections:
            return
        
        message_json = json.dumps(message, default=str)
        disconnected = []
        
        for connection in self.active_connections:
            try:
                await connection.send_text(message_json)
            except Exception as e:
                logger.warning(f"Failed to send to websocket: {e}")
                disconnected.append(connection)
        
        # Clean up disconnected
        for conn in disconnected:
            await self.disconnect(conn)
    
    async def send_channel_update(self, operation: str, channel_data: dict):
        """Send channel configuration update"""
        await self.broadcast({
            "type": "channel_update",
            "operation": operation,
            "data": channel_data
        })
    
    async def send_trade_update(self, trade_data: dict):
        """Send trade/signal update"""
        await self.broadcast({
            "type": "trade_update",
            "data": trade_data
        })

# ============================================================================
# Application Lifespan & Dependencies
# ============================================================================

# Global instances
db_manager: Optional[DatabaseManager] = None
ws_manager = ConnectionManager()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler"""
    global db_manager
    
    # Startup
    logger.info("Starting Trading Bot Dashboard API...")
    
    try:
        db_manager = DatabaseManager()
        
        # Test connection
        if not db_manager.test_connection():
            raise Exception("Database connection failed")
        
        # Start LISTEN/NOTIFY listener with callbacks
        db_manager.start_listener({
            'channel_changes': lambda p: asyncio.create_task(
                ws_manager.send_channel_update(p.get('operation', 'UPDATE'), p)
            ),
            'trade_changes': lambda p: asyncio.create_task(
                ws_manager.send_trade_update(p)
            ),
            'config_changes': lambda p: asyncio.create_task(
                ws_manager.send_channel_update('CONFIG_UPDATE', p)
            )
        })
        
        logger.info("Database connected and listener started")
        
    except Exception as e:
        logger.error(f"Startup error: {e}")
        raise
    
    yield
    
    # Shutdown
    logger.info("Shutting down...")
    if db_manager:
        db_manager.stop_listener()

def get_db() -> DatabaseManager:
    """Dependency to get database manager"""
    if not db_manager:
        raise HTTPException(status_code=503, detail="Database not available")
    return db_manager

# ============================================================================
# FastAPI Application
# ============================================================================

app = FastAPI(
    title="Trading Bot Dashboard API",
    description="REST API and WebSocket endpoints for the Telegram→MT5 Trading Bot Dashboard",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "https://*.railway.app",
        "https://*.vercel.app",
        os.getenv("FRONTEND_URL", "*")
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# Health Check Endpoints
# ============================================================================

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    db_ok = db_manager.test_connection() if db_manager else False
    return {
        "status": "healthy" if db_ok else "degraded",
        "database": "connected" if db_ok else "disconnected",
        "websocket_connections": len(ws_manager.active_connections),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "Trading Bot Dashboard API",
        "version": "1.0.0",
        "docs": "/docs"
    }

# ============================================================================
# Channel Configuration Endpoints
# ============================================================================

@app.get("/api/channels", response_model=List[ChannelResponse])
async def get_channels(
    active_only: bool = Query(True, description="Only return active channels"),
    db: DatabaseManager = Depends(get_db)
):
    """Get all channel configurations"""
    try:
        channels = db.channels.get_all_active_channels() if active_only else db.channels.get_all_channels()
        return [_bot_config_to_response(c) for c in channels]
    except Exception as e:
        logger.error(f"Error fetching channels: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/channels/{channel_id}", response_model=ChannelResponse)
async def get_channel(
    channel_id: str,
    db: DatabaseManager = Depends(get_db)
):
    """Get a single channel configuration"""
    try:
        channel = db.channels.get_channel_by_id(channel_id)
        if not channel:
            raise HTTPException(status_code=404, detail="Channel not found")
        return _bot_config_to_response(channel)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching channel: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/channels", response_model=ChannelResponse)
async def create_channel(
    config: ChannelConfigModel,
    db: DatabaseManager = Depends(get_db)
):
    """Create a new channel configuration"""
    try:
        bot_config = _model_to_bot_config(config)
        channel_id = db.channels.create_channel(bot_config)
        
        # Fetch and return the created channel
        channel = db.channels.get_channel_by_id(channel_id)
        
        # Notify connected clients
        await ws_manager.send_channel_update("INSERT", {"id": channel_id, "channel_key": config.channel_key})
        
        return _bot_config_to_response(channel)
    except Exception as e:
        logger.error(f"Error creating channel: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/channels/{channel_id}", response_model=ChannelResponse)
async def update_channel(
    channel_id: str,
    config: ChannelConfigModel,
    db: DatabaseManager = Depends(get_db)
):
    """Update an existing channel configuration"""
    try:
        existing = db.channels.get_channel_by_id(channel_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Channel not found")
        
        bot_config = _model_to_bot_config(config)
        db.channels.update_channel(channel_id, bot_config)
        
        # Fetch and return the updated channel
        channel = db.channels.get_channel_by_id(channel_id)
        
        # Notify connected clients
        await ws_manager.send_channel_update("UPDATE", {"id": channel_id, "channel_key": config.channel_key})
        
        return _bot_config_to_response(channel)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating channel: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/channels/{channel_id}")
async def delete_channel(
    channel_id: str,
    db: DatabaseManager = Depends(get_db)
):
    """Delete a channel configuration"""
    try:
        existing = db.channels.get_channel_by_id(channel_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Channel not found")
        
        channel_key = existing.channel_key
        db.channels.delete_channel(channel_id)
        
        # Notify connected clients
        await ws_manager.send_channel_update("DELETE", {"id": channel_id, "channel_key": channel_key})
        
        return {"message": "Channel deleted", "id": channel_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting channel: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.patch("/api/channels/{channel_id}/toggle")
async def toggle_channel(
    channel_id: str,
    is_active: bool = Query(..., description="Set channel active status"),
    db: DatabaseManager = Depends(get_db)
):
    """Enable or disable a channel"""
    try:
        success = db.channels.set_channel_active(channel_id, is_active)
        if not success:
            raise HTTPException(status_code=404, detail="Channel not found")
        
        # Notify connected clients
        await ws_manager.send_channel_update("UPDATE", {"id": channel_id, "is_active": is_active})
        
        return {"message": f"Channel {'enabled' if is_active else 'disabled'}", "id": channel_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error toggling channel: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# Trade/Signal Endpoints
# ============================================================================

@app.get("/api/trades")
async def get_trades(
    start_date: Optional[datetime] = Query(None, description="Start date filter"),
    end_date: Optional[datetime] = Query(None, description="End date filter"),
    channel_id: Optional[str] = Query(None, description="Filter by channel"),
    status: Optional[str] = Query(None, description="Filter by status"),
    limit: int = Query(100, ge=1, le=1000),
    db: DatabaseManager = Depends(get_db)
):
    """Get trades with optional filters"""
    try:
        # Default to last 7 days if no date range specified
        if not end_date:
            end_date = datetime.now(timezone.utc)
        if not start_date:
            start_date = end_date - timedelta(days=7)
        
        trades = db.trades.get_trades_by_date_range(
            start_date=start_date,
            end_date=end_date,
            channel_id=channel_id,
            status=status,
            limit=limit
        )
        
        return {"trades": trades, "count": len(trades)}
    except Exception as e:
        logger.error(f"Error fetching trades: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/trades/{trade_id}")
async def get_trade(
    trade_id: str,
    db: DatabaseManager = Depends(get_db)
):
    """Get a single trade by ID"""
    try:
        # Try by trade_id first, then by ticket
        trade = None
        if trade_id.isdigit():
            trade = db.trades.get_trade_by_ticket(int(trade_id))
        
        if not trade:
            # Implement get_trade_by_id if needed
            pass
        
        if not trade:
            raise HTTPException(status_code=404, detail="Trade not found")
        
        return trade
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching trade: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/statistics/daily")
async def get_daily_statistics(
    date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format"),
    channel_id: Optional[str] = Query(None, description="Filter by channel"),
    db: DatabaseManager = Depends(get_db)
):
    """Get daily trading statistics"""
    try:
        if date:
            target_date = datetime.strptime(date, "%Y-%m-%d").date()
        else:
            target_date = datetime.now(timezone.utc).date()
        
        stats = db.trades.get_daily_stats(target_date, channel_id)
        
        result = {"date": str(target_date)}
        if stats:
            result.update(dict(stats))
        return result
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    except Exception as e:
        logger.error(f"Error fetching statistics: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/statistics/summary")
async def get_summary_statistics(
    days: int = Query(30, ge=1, le=365, description="Number of days to include"),
    channel_id: Optional[str] = Query(None, description="Filter by channel"),
    db: DatabaseManager = Depends(get_db)
):
    """Get summary statistics for a period"""
    try:
        end_date = datetime.now(timezone.utc)
        start_date = end_date - timedelta(days=days)
        
        trades = db.trades.get_trades_by_date_range(
            start_date=start_date,
            end_date=end_date,
            channel_id=channel_id,
            limit=10000
        )
        
        if not trades:
            return {
                "period_days": days,
                "total_signals": 0,
                "executed_trades": 0,
                "winning_trades": 0,
                "losing_trades": 0,
                "win_rate": 0,
                "total_profit_loss": 0,
                "total_pips": 0,
                "avg_trade_duration": None
            }
        
        closed_trades = [t for t in trades if t.get('status') == 'closed']
        winning = [t for t in closed_trades if t.get('trade_outcome') == 'profit']
        losing = [t for t in closed_trades if t.get('trade_outcome') == 'loss']
        
        total_pnl = sum(t.get('profit_loss', 0) or 0 for t in closed_trades)
        total_pips = sum(t.get('profit_loss_pips', 0) or 0 for t in closed_trades)
        
        win_rate = (len(winning) / len(closed_trades) * 100) if closed_trades else 0
        
        return {
            "period_days": days,
            "total_signals": len(trades),
            "executed_trades": len([t for t in trades if t.get('status') in ['active', 'closed']]),
            "winning_trades": len(winning),
            "losing_trades": len(losing),
            "breakeven_trades": len([t for t in closed_trades if t.get('trade_outcome') == 'breakeven']),
            "blocked_trades": len([t for t in trades if t.get('status') == 'blocked']),
            "win_rate": round(win_rate, 2),
            "total_profit_loss": round(total_pnl, 2),
            "total_pips": round(total_pips, 2),
            "avg_profit_per_trade": round(total_pnl / len(closed_trades), 2) if closed_trades else 0
        }
    except Exception as e:
        logger.error(f"Error fetching summary statistics: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# WebSocket Endpoint
# ============================================================================

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time updates.
    
    Clients receive messages in format:
    {
        "type": "channel_update" | "trade_update" | "stats_update",
        "operation": "INSERT" | "UPDATE" | "DELETE" (for channel updates),
        "data": { ... }
    }
    """
    await ws_manager.connect(websocket)
    
    try:
        # Send initial connection confirmation
        await websocket.send_json({
            "type": "connected",
            "message": "WebSocket connection established",
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        
        # Keep connection alive and handle client messages
        while True:
            try:
                data = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=30.0  # Ping every 30 seconds
                )
                
                # Handle client messages (e.g., subscribe to specific channels)
                try:
                    message = json.loads(data)
                    if message.get("type") == "ping":
                        await websocket.send_json({"type": "pong"})
                except json.JSONDecodeError:
                    pass
                    
            except asyncio.TimeoutError:
                # Send ping to keep connection alive
                await websocket.send_json({"type": "ping"})
                
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        await ws_manager.disconnect(websocket)

# ============================================================================
# Helper Functions
# ============================================================================

def _bot_config_to_response(config: BotConfig) -> dict:
    """Convert BotConfig to API response format"""
    # Convert enable_for_hint dict to individual fields for cancel policy
    cancel_policy = None
    if config.cancel_policy:
        enable_for = config.cancel_policy.enable_for_hint or {}
        cancel_policy = {
            "enabled": getattr(config.cancel_policy, 'enabled', True),
            "kind": config.cancel_policy.kind,
            "tp_index": config.cancel_policy.tp_index,
            "percent": config.cancel_policy.percent,
            "enable_for_now": enable_for.get('now', True),
            "enable_for_limit": enable_for.get('limit', True),
            "enable_for_auto": enable_for.get('auto', True)
        }
    
    riskfree_policy = None
    if config.riskfree_policy:
        riskfree_policy = {
            "enabled": getattr(config.riskfree_policy, 'enabled', True),
            "kind": config.riskfree_policy.kind,
            "tp_index": config.riskfree_policy.tp_index,
            "pips": config.riskfree_policy.pips,
            "percent": config.riskfree_policy.percent
        }
    
    return {
        "id": config.id,
        "channel_key": config.channel_key,
        "display_name": config.channel_key,
        "telegram_id": config.telegram_id,
        "is_active": config.is_active,
        "risk_per_trade": config.risk_per_trade,
        "risk_tolerance": config.risk_tolerance,
        "magic_number": config.magic,
        "max_slippage_points": config.max_slippage_points,
        "trade_monitor_interval_sec": config.trade_monitor_interval_sec,
        "instruments": [
            {
                "logical": inst.logical,
                "broker_symbol": inst.broker_symbol,
                "pip_tolerance_pips": inst.pip_tolerance_pips
            }
            for inst in config.instruments
        ],
        "final_tp_policy": {
            "kind": config.final_tp_policy.kind,
            "tp_index": config.final_tp_policy.tp_index,
            "rr_ratio": config.final_tp_policy.rr_ratio
        },
        "riskfree_policy": riskfree_policy or {
            "enabled": False,
            "kind": "%path",
            "tp_index": 1,
            "pips": 10.0,
            "percent": 50.0
        },
        "cancel_policy": cancel_policy or {
            "enabled": True,
            "kind": "final_tp",
            "tp_index": 1,
            "percent": 50.0,
            "enable_for_now": True,
            "enable_for_limit": True,
            "enable_for_auto": True
        },
        "commands": {
            "enable_close": config.commands.enable_close,
            "enable_cancel_limit": config.commands.enable_cancel_limit,
            "enable_riskfree": config.commands.enable_riskfree,
            "close_phrases": config.commands.close_phrases,
            "cancel_limit_phrases": config.commands.cancel_limit_phrases,
            "riskfree_phrases": config.commands.riskfree_phrases
        },
        "circuit_breaker": {
            "enabled": config.circuit_breaker.enabled,
            "max_daily_trades": config.circuit_breaker.max_daily_trades,
            "max_daily_loss_pct": config.circuit_breaker.max_daily_loss_pct
        },
        "trend_filter": {
            "enabled": config.trend_filter.enabled,
            "swing_strength": config.trend_filter.swing_strength,
            "min_swings_required": config.trend_filter.min_swings_required,
            "ema_period": config.trend_filter.ema_period,
            "candles_to_fetch": config.trend_filter.candles_to_fetch,
            "require_all_three": config.trend_filter.require_all_three,
            "log_details": config.trend_filter.log_details
        }
    }

def _model_to_bot_config(model: ChannelConfigModel) -> BotConfig:
    """Convert API model to BotConfig"""
    return BotConfig(
        channel_key=model.channel_key,
        instruments=[
            Instrument(
                logical=inst.logical_symbol,
                broker_symbol=inst.broker_symbol,
                pip_tolerance_pips=inst.pip_tolerance_pips
            )
            for inst in model.instruments
        ],
        risk_per_trade=model.risk_per_trade,
        risk_tolerance=model.risk_tolerance,
        final_tp_policy=FinalTPPolicy(
            kind=model.final_tp_policy.kind,
            tp_index=model.final_tp_policy.tp_index,
            rr_ratio=model.final_tp_policy.rr_ratio
        ),
        riskfree_policy=RiskFreePolicy(
            kind=model.riskfree_policy.kind,
            tp_index=model.riskfree_policy.tp_index,
            pips=model.riskfree_policy.pips,
            percent=model.riskfree_policy.percent,
            enabled=model.riskfree_policy.enabled
        ) if model.riskfree_policy.enabled else None,
        cancel_policy=CancelPolicy(
            kind=model.cancel_policy.kind,
            tp_index=model.cancel_policy.tp_index,
            percent=model.cancel_policy.percent,
            enable_for_hint={
                'now': model.cancel_policy.enable_for_now,
                'limit': model.cancel_policy.enable_for_limit,
                'auto': model.cancel_policy.enable_for_auto
            },
            enabled=model.cancel_policy.enabled
        ) if model.cancel_policy.enabled else None,
        commands=CommandRouterConfig(
            enable_close=model.commands.enable_close,
            enable_cancel_limit=model.commands.enable_cancel_limit,
            enable_riskfree=model.commands.enable_riskfree,
            close_phrases=model.commands.close_phrases,
            cancel_limit_phrases=model.commands.cancel_limit_phrases,
            riskfree_phrases=model.commands.riskfree_phrases
        ),
        circuit_breaker=CircuitBreaker(
            enabled=model.circuit_breaker.enabled,
            max_daily_trades=model.circuit_breaker.max_daily_trades,
            max_daily_loss_pct=model.circuit_breaker.max_daily_loss_pct
        ),
        trend_filter=TrendFilterConfig(
            enabled=model.trend_filter.enabled,
            swing_strength=model.trend_filter.swing_strength,
            min_swings_required=model.trend_filter.min_swings_required,
            ema_period=model.trend_filter.ema_period,
            candles_to_fetch=model.trend_filter.candles_to_fetch,
            require_all_three=model.trend_filter.require_all_three,
            log_details=model.trend_filter.log_details
        ),
        magic=model.magic_number,
        max_slippage_points=model.max_slippage_points,
        trade_monitor_interval_sec=model.trade_monitor_interval_sec
    )

# ============================================================================
# Main Entry Point
# ============================================================================

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=os.getenv("ENV", "production") == "development"
    )
