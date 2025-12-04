"""
Trading Dashboard - Cloud Edition v2
With debug logging to diagnose connection issues
"""
import os
from datetime import datetime, timedelta, timezone
from typing import Dict, List
import threading

import dash
from dash import dcc, html, dash_table, Input, Output, State
import dash_bootstrap_components as dbc
from dash.exceptions import PreventUpdate
import plotly.graph_objects as go
import pandas as pd
import numpy as np

# ============ DEBUG LOGGING ============
import sys
DEBUG_LOG = []

def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    entry = f"[{ts}] {msg}"
    DEBUG_LOG.append(entry)
    print(entry, file=sys.stderr)

log("App starting...")

# ============ DATABASE ============
try:
    import psycopg2
    from psycopg2 import pool
    from psycopg2.extras import RealDictCursor
    PG_OK = True
    log("psycopg2 imported OK")
except Exception as e:
    PG_OK = False
    log(f"psycopg2 import failed: {e}")

DATABASE_URL = os.getenv('DATABASE_URL', '')
log(f"DATABASE_URL set: {bool(DATABASE_URL)}")
if DATABASE_URL:
    parts = DATABASE_URL.split('@')
    if len(parts) > 1:
        log(f"DB Host: ...@{parts[-1][:50]}...")

REFRESH = 10000

C = {
    'bg': '#0a0e12', 'bg2': '#12171d', 'card': '#161c24', 'border': '#2a3441',
    'text': '#f0f4f8', 'text2': '#94a3b8', 'accent': '#3b82f6',
    'green': '#10b981', 'red': '#ef4444', 'yellow': '#f59e0b',
    'green_bg': 'rgba(16,185,129,0.12)', 'red_bg': 'rgba(239,68,68,0.12)',
}

class DB:
    _inst = None
    _lock = threading.Lock()
    
    def __new__(cls):
        if cls._inst is None:
            with cls._lock:
                if cls._inst is None:
                    cls._inst = super().__new__(cls)
                    cls._inst._pool = None
                    cls._inst._error = None
                    cls._inst._connect()
        return cls._inst
    
    def _connect(self):
        if not PG_OK:
            self._error = "psycopg2 not available"
            log(f"DB Error: {self._error}")
            return
        if not DATABASE_URL:
            self._error = "DATABASE_URL environment variable not set"
            log(f"DB Error: {self._error}")
            return
        try:
            log("Connecting to PostgreSQL...")
            self._pool = pool.ThreadedConnectionPool(2, 10, DATABASE_URL, cursor_factory=RealDictCursor)
            log("PostgreSQL connected!")
            self._error = None
            
            # Test query
            conn = self._pool.getconn()
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) as cnt FROM channels")
                result = cur.fetchone()
                log(f"Test: {result['cnt']} channels in DB")
            self._pool.putconn(conn)
            
        except Exception as e:
            self._error = str(e)
            log(f"DB connection error: {e}")
    
    @property
    def ok(self): 
        return self._pool is not None
    
    @property
    def error(self):
        return self._error
    
    def q(self, sql, p=None):
        if not self._pool: 
            return []
        c = None
        try:
            c = self._pool.getconn()
            with c.cursor() as cur:
                cur.execute(sql, p)
                result = cur.fetchall()
                return result
        except Exception as e:
            log(f"Query error: {e}")
            return []
        finally:
            if c: self._pool.putconn(c)
    
    def x(self, sql, p=None):
        if not self._pool: return False
        c = None
        try:
            c = self._pool.getconn()
            with c.cursor() as cur: cur.execute(sql, p)
            c.commit()
            return True
        except Exception as e:
            log(f"Execute error: {e}")
            if c: c.rollback()
            return False
        finally:
            if c: self._pool.putconn(c)

db = DB()

# ============ DATA LOADING ============

def load_trades(days=30):
    if not db.ok: 
        return sample()
    r = db.q("""
        SELECT s.id, c.channel_name, s.broker_symbol as symbol, s.side, s.order_type,
               s.effective_entry_price as entry_price, s.adjusted_sl_price as sl_price,
               s.final_tp_price as tp_price, s.lot_size, s.actual_risk_pct as risk_percent,
               s.status, s.trade_outcome, s.fill_price, s.fill_time, s.close_price,
               s.close_time, s.profit_loss, s.profit_loss_pips, s.riskfree_moved,
               s.block_reason, s.signal_received_at
        FROM signals s LEFT JOIN channels c ON s.channel_id = c.id
        WHERE s.signal_received_at >= NOW() - INTERVAL '%s days'
        ORDER BY s.signal_received_at DESC
    """, (days,))
    if not r: 
        return sample()
    df = pd.DataFrame(r)
    for col in ['fill_time', 'close_time', 'signal_received_at']:
        if col in df.columns: df[col] = pd.to_datetime(df[col], errors='coerce')
    return df

def load_active():
    if not db.ok: return pd.DataFrame()
    r = db.q("""
        SELECT c.channel_name, s.broker_symbol as symbol, s.side,
               s.fill_price as entry, s.adjusted_sl_price as sl, s.final_tp_price as tp,
               s.lot_size as lots, s.riskfree_moved as be, s.fill_time,
               EXTRACT(EPOCH FROM (NOW() - s.fill_time)) as dur
        FROM signals s LEFT JOIN channels c ON s.channel_id = c.id
        WHERE s.status = 'active' ORDER BY s.fill_time DESC
    """)
    return pd.DataFrame(r) if r else pd.DataFrame()

def load_pending():
    if not db.ok: return pd.DataFrame()
    r = db.q("""
        SELECT c.channel_name, s.broker_symbol as symbol, s.side,
               s.effective_entry_price as entry, s.adjusted_sl_price as sl,
               s.final_tp_price as tp, s.lot_size as lots, s.order_placed_at,
               EXTRACT(EPOCH FROM (NOW() - s.order_placed_at)) as wait
        FROM signals s LEFT JOIN channels c ON s.channel_id = c.id
        WHERE s.status = 'pending' ORDER BY s.order_placed_at DESC
    """)
    return pd.DataFrame(r) if r else pd.DataFrame()

def load_channels():
    if not db.ok: 
        return []
    result = db.q("SELECT id, channel_key, channel_name, is_active FROM channels ORDER BY channel_name")
    return result

def load_config(cid):
    if not db.ok: return {}
    r = db.q("""
        SELECT bc.*, tp.policy_kind as tp_kind, tp.rr_ratio, tp.tp_index,
               rf.is_enabled as rf_on, rf.policy_kind as rf_kind, rf.percent_value as rf_pct,
               cb.is_enabled as cb_on, cb.max_daily_trades as cb_trades, cb.max_daily_loss_pct as cb_loss,
               tf.is_enabled as tf_on, tf.swing_strength as tf_swing, tf.ema_period as tf_ema
        FROM bot_configs bc
        LEFT JOIN tp_policies tp ON bc.id = tp.bot_config_id
        LEFT JOIN riskfree_policies rf ON bc.id = rf.bot_config_id
        LEFT JOIN circuit_breaker_configs cb ON bc.id = cb.bot_config_id
        LEFT JOIN trend_filter_configs tf ON bc.id = tf.bot_config_id
        WHERE bc.channel_id = %s
    """, (cid,))
    return dict(r[0]) if r else {}

def sample():
    np.random.seed(42)
    d = []
    base = datetime.now(timezone.utc) - timedelta(days=30)
    for i in range(60):
        t = base + timedelta(hours=np.random.randint(0, 720))
        side = np.random.choice(['buy', 'sell'])
        out = np.random.choice(['profit', 'loss', 'breakeven'], p=[0.5, 0.4, 0.1])
        entry = 2650 + np.random.uniform(-50, 50)
        pnl = np.random.uniform(50, 250) if out == 'profit' else (np.random.uniform(-120, -30) if out == 'loss' else np.random.uniform(-5, 5))
        d.append({
            'id': f'd{i}', 'channel_name': np.random.choice(['FOREX MASTER', 'Gold Signals']),
            'symbol': 'XAUUSD', 'side': side, 'entry_price': entry,
            'sl_price': entry - 10 if side == 'buy' else entry + 10,
            'tp_price': entry + 20 if side == 'buy' else entry - 20,
            'lot_size': 0.1, 'status': 'closed', 'trade_outcome': out,
            'profit_loss': pnl, 'profit_loss_pips': pnl / 2,
            'fill_time': t, 'close_time': t + timedelta(hours=np.random.randint(1, 24)),
            'signal_received_at': t, 'riskfree_moved': np.random.choice([True, False]),
        })
    return pd.DataFrame(d)

def kpis(df):
    if df.empty: return {'trades': 0, 'wr': 0, 'pnl': 0, 'pf': 0, 'pips': 0, 'act': 0, 'pend': 0, 'block': 0}
    cl = df[df['status'] == 'closed']
    t, w = len(cl), len(cl[cl['trade_outcome'] == 'profit'])
    gp = cl[cl['profit_loss'] > 0]['profit_loss'].sum()
    gl = abs(cl[cl['profit_loss'] < 0]['profit_loss'].sum())
    return {
        'trades': t, 'wins': w, 'losses': len(cl[cl['trade_outcome'] == 'loss']),
        'wr': (w / t * 100) if t > 0 else 0, 'pnl': cl['profit_loss'].sum(),
        'pf': (gp / gl) if gl > 0 else 0,
        'pips': cl['profit_loss_pips'].sum() if 'profit_loss_pips' in cl else 0,
        'act': len(df[df['status'] == 'active']),
        'pend': len(df[df['status'] == 'pending']),
        'block': len(df[df['status'] == 'blocked']),
    }

# ============ CHARTS ============

def layout(h=300):
    return dict(template='plotly_dark', height=h, margin=dict(l=40, r=20, t=20, b=40),
                plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)',
                font=dict(family='Inter', size=11, color=C['text2']),
                xaxis=dict(gridcolor=C['border']), yaxis=dict(gridcolor=C['border']))

def equity(df):
    fig = go.Figure()
    cl = df[df['status'] == 'closed'].dropna(subset=['close_time']).sort_values('close_time')
    if not cl.empty:
        cl = cl.copy()
        cl['cum'] = cl['profit_loss'].cumsum()
        fig.add_trace(go.Scatter(x=cl['close_time'], y=cl['cum'], mode='lines', fill='tozeroy',
                                line=dict(color=C['accent'], width=2), fillcolor='rgba(59,130,246,0.2)'))
    fig.update_layout(**layout())
    return fig

def daily(df):
    fig = go.Figure()
    cl = df[df['status'] == 'closed'].dropna(subset=['close_time'])
    if not cl.empty:
        cl = cl.copy()
        cl['date'] = pd.to_datetime(cl['close_time']).dt.date
        d = cl.groupby('date')['profit_loss'].sum()
        colors = [C['green'] if v >= 0 else C['red'] for v in d.values]
        fig.add_trace(go.Bar(x=d.index, y=d.values, marker_color=colors))
    fig.update_layout(**layout())
    return fig

def gauge(k):
    wr = k.get('wr', 0)
    fig = go.Figure(go.Indicator(mode="gauge+number", value=wr,
        number={'suffix': '%', 'font': {'size': 28, 'color': C['text']}},
        gauge={'axis': {'range': [0, 100]}, 'bar': {'color': C['green'] if wr >= 50 else C['red']},
               'bgcolor': C['card'], 'borderwidth': 0,
               'steps': [{'range': [0, 40], 'color': C['red_bg']}, {'range': [40, 60], 'color': 'rgba(245,158,11,0.12)'}, {'range': [60, 100], 'color': C['green_bg']}]}))
    fig.update_layout(**layout(h=180), margin=dict(l=20, r=20, t=20, b=10))
    return fig

def by_channel(df):
    fig = go.Figure()
    cl = df[df['status'] == 'closed']
    if not cl.empty and 'channel_name' in cl:
        ch = cl.groupby('channel_name')['profit_loss'].sum().sort_values()
        colors = [C['green'] if v >= 0 else C['red'] for v in ch.values]
        fig.add_trace(go.Bar(x=ch.values, y=ch.index, orientation='h', marker_color=colors))
    fig.update_layout(**layout())
    return fig

# ============ DASH APP ============

app = dash.Dash(__name__, external_stylesheets=[dbc.themes.DARKLY,
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400&display=swap'],
    suppress_callback_exceptions=True, title="Trading Dashboard",
    meta_tags=[{'name': 'viewport', 'content': 'width=device-width, initial-scale=1'}])
server = app.server

CSS = f"""
<style>
body {{ background: linear-gradient(135deg, {C['bg']} 0%, #060810 100%); font-family: 'Inter', sans-serif; color: {C['text']}; }}
.kpi {{ background: {C['card']}; border: 1px solid {C['border']}; border-radius: 14px; padding: 18px; }}
.kpi:hover {{ border-color: {C['accent']}; }}
.kpi-val {{ font-family: 'JetBrains Mono'; font-size: 26px; font-weight: 700; }}
.kpi-val.pos {{ color: {C['green']}; }}
.kpi-val.neg {{ color: {C['red']}; }}
.kpi-lbl {{ font-size: 11px; color: {C['text2']}; text-transform: uppercase; margin-top: 6px; }}
.crd {{ background: {C['card']}; border: 1px solid {C['border']}; border-radius: 14px; overflow: hidden; margin-bottom: 16px; }}
.crd-h {{ padding: 12px 16px; border-bottom: 1px solid {C['border']}; font-weight: 600; font-size: 13px; color: {C['text2']}; }}
.crd-b {{ padding: 10px; }}
.nav-pills {{ background: {C['bg2']}; border-radius: 10px; padding: 5px; gap: 4px; display: flex; flex-wrap: wrap; }}
.nav-pills .nav-link {{ color: {C['text2']}; border-radius: 8px; padding: 8px 14px; font-size: 13px; font-weight: 500; }}
.nav-pills .nav-link:hover {{ background: {C['card']}; color: {C['text']}; }}
.nav-pills .nav-link.active {{ background: {C['accent']}; color: white; }}
.cfg {{ background: {C['card']}; border: 1px solid {C['border']}; border-radius: 10px; padding: 16px; margin-bottom: 14px; }}
.cfg h6 {{ color: {C['accent']}; margin-bottom: 14px; font-weight: 600; font-size: 14px; }}
.live {{ display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; background: {C['green_bg']}; border-radius: 16px; font-size: 11px; font-weight: 600; color: {C['green']}; }}
.live::before {{ content: ''; width: 6px; height: 6px; background: {C['green']}; border-radius: 50%; animation: p 2s infinite; }}
.demo {{ background: rgba(245,158,11,0.12); color: {C['yellow']}; }}
.demo::before {{ background: {C['yellow']}; }}
.err {{ background: {C['red_bg']}; color: {C['red']}; }}
.err::before {{ background: {C['red']}; }}
@keyframes p {{ 0%,100% {{ opacity: 1; }} 50% {{ opacity: 0.4; }} }}
.sc {{ text-align: center; padding: 16px; }}
.sc .n {{ font-size: 36px; font-weight: 700; font-family: 'JetBrains Mono'; }}
.sc .l {{ color: {C['text2']}; font-size: 12px; margin-top: 4px; }}
.hdr {{ padding: 14px 20px; background: {C['bg2']}; border-bottom: 1px solid {C['border']}; margin-bottom: 16px; }}
.pg {{ padding: 0 20px; }}
.dbg {{ background: #1a1a2e; border: 1px solid {C['border']}; border-radius: 8px; padding: 12px; font-family: 'JetBrains Mono'; font-size: 11px; white-space: pre-wrap; max-height: 300px; overflow-y: auto; }}
@media (max-width: 768px) {{ .kpi-val {{ font-size: 20px; }} .sc .n {{ font-size: 28px; }} .hdr {{ padding: 12px 14px; }} .pg {{ padding: 0 14px; }} }}
</style>
"""

def kpi_c(v, l, cls=""): return html.Div([html.Div(v, className=f"kpi-val {cls}"), html.Div(l, className="kpi-lbl")], className="kpi")
def card(t, cid): return html.Div([html.Div(t, className="crd-h"), html.Div(dcc.Graph(id=cid, config={'displayModeBar': False}), className="crd-b")], className="crd")

def hdr():
    if db.ok:
        st_class, st_text = "live", "LIVE"
    elif db.error:
        st_class, st_text = "live err", "ERROR"
    else:
        st_class, st_text = "live demo", "DEMO"
    
    return html.Div([dbc.Row([
        dbc.Col([html.Div([html.H5("📊 Trading Dashboard", style={'margin': 0, 'fontWeight': 700}),
                          html.Span(st_text, className=st_class, style={'marginLeft': '10px'})],
                         className="d-flex align-items-center flex-wrap gap-2")], xs=12, md=6, className="mb-2 mb-md-0"),
        dbc.Col([dbc.Nav([dbc.NavItem(dbc.NavLink("Dashboard", href="/", active="exact")),
                         dbc.NavItem(dbc.NavLink("Live", href="/live", active="exact")),
                         dbc.NavItem(dbc.NavLink("History", href="/history", active="exact")),
                         dbc.NavItem(dbc.NavLink("Config", href="/config", active="exact")),
                         dbc.NavItem(dbc.NavLink("Debug", href="/debug", active="exact"))], pills=True, className="justify-content-md-end")], xs=12, md=6),
    ], className="align-items-center")], className="hdr")

def pg_dash():
    return html.Div([
        dbc.Row([dbc.Col(html.Div(id='k1'), xs=6, lg=3, className="mb-3"), dbc.Col(html.Div(id='k2'), xs=6, lg=3, className="mb-3"),
                 dbc.Col(html.Div(id='k3'), xs=6, lg=3, className="mb-3"), dbc.Col(html.Div(id='k4'), xs=6, lg=3, className="mb-3")]),
        dbc.Row([dbc.Col(card("📈 Equity Curve", "ch1"), lg=8), dbc.Col(card("🎯 Win Rate", "ch2"), lg=4)]),
        dbc.Row([dbc.Col(card("📊 Daily P&L", "ch3"), lg=6), dbc.Col(card("📡 By Channel", "ch4"), lg=6)]),
        dbc.Row([dbc.Col(html.Div([html.Div("🟢 Active", className="crd-h"), html.Div(id='s1', className="sc")], className="crd"), xs=4),
                 dbc.Col(html.Div([html.Div("⏳ Pending", className="crd-h"), html.Div(id='s2', className="sc")], className="crd"), xs=4),
                 dbc.Col(html.Div([html.Div("🚫 Blocked", className="crd-h"), html.Div(id='s3', className="sc")], className="crd"), xs=4)]),
    ], className="pg")

def pg_live():
    return html.Div([html.H5("🔴 Active Positions", className="mb-3"), html.Div(id='t1', className="mb-4"),
                    html.H5("⏳ Pending Orders", className="mb-3"), html.Div(id='t2')], className="pg")

def pg_hist():
    return html.Div([
        dbc.Row([dbc.Col(html.H5("📜 Trade History"), xs=12, md=6),
                dbc.Col(dbc.Select(id='days', options=[{'label': '7d', 'value': 7}, {'label': '30d', 'value': 30}, {'label': '90d', 'value': 90}],
                                   value=30, style={'width': '80px', 'background': C['card']}), xs=12, md=6, className="d-flex justify-content-md-end mt-2 mt-md-0")],
                className="align-items-center mb-3"),
        html.Div(id='t3'),
    ], className="pg")

def pg_cfg():
    chs = load_channels()
    if not chs:
        err_msg = db.error if db.error else "No channels found in database"
        return html.Div([
            html.H5("⚙️ Configuration", className="mb-4"),
            dbc.Alert([
                html.H6("📡 Database Connection Issue"),
                html.P(f"Error: {err_msg}"),
                html.Hr(),
                html.P("Please check:", className="mb-2"),
                html.Ul([
                    html.Li("DATABASE_URL is set in Railway Variables tab"),
                    html.Li("Format: postgresql://user:password@host:5432/postgres"),
                    html.Li("Your bot has sent at least one signal"),
                ]),
                html.P([html.Strong("Go to Debug tab"), " for more details."], className="mt-3"),
            ], color="warning"),
        ], className="pg")
    
    opts = [{'label': c['channel_name'] or c['channel_key'], 'value': c['id']} for c in chs]
    return html.Div([
        html.H5("⚙️ Configuration", className="mb-4"),
        dbc.Row([dbc.Col([dbc.Label("Channel"), dbc.Select(id='cfg-ch', options=opts, value=opts[0]['value'], style={'background': C['card']})], xs=12, md=4, className="mb-3")]),
        html.Div(id='cfg-form'),
        dbc.Button("💾 Save", id='cfg-save', color="primary", className="mt-3"),
        html.Div(id='cfg-msg', className="mt-3"),
    ], className="pg")

def pg_debug():
    """Debug page showing connection status"""
    return html.Div([
        html.H5("🔧 Debug Information", className="mb-4"),
        
        html.Div([
            html.H6("Connection Status", className="mb-3"),
            html.Div([
                html.Div([html.Strong("psycopg2: "), html.Span("✅ OK" if PG_OK else "❌ Not installed", style={'color': C['green'] if PG_OK else C['red']})]),
                html.Div([html.Strong("DATABASE_URL: "), html.Span("✅ Set" if DATABASE_URL else "❌ NOT SET", style={'color': C['green'] if DATABASE_URL else C['red']})]),
                html.Div([html.Strong("DB Connected: "), html.Span("✅ Yes" if db.ok else "❌ No", style={'color': C['green'] if db.ok else C['red']})]),
                html.Div([html.Strong("Error: "), html.Span(db.error or "None", style={'color': C['red'] if db.error else C['text2']})]) if db.error else None,
            ])
        ], className="cfg mb-4"),
        
        html.Div([
            html.H6("DATABASE_URL (masked)", className="mb-3"),
            html.Code(f"...{DATABASE_URL[-50:]}" if len(DATABASE_URL) > 50 else (DATABASE_URL[:20] + "..." if DATABASE_URL else "NOT SET")),
        ], className="cfg mb-4"),
        
        html.Div([
            html.H6("Debug Log", className="mb-3"),
            html.Div(id='debug-log', className="dbg"),
            dbc.Button("🔄 Refresh", id='refresh-log', color="secondary", size="sm", className="mt-2"),
        ], className="cfg"),
        
        html.Div([
            html.H6("Test Database", className="mb-3"),
            dbc.Button("🧪 Run Test Query", id='test-query', color="primary", size="sm"),
            html.Div(id='test-result', className="mt-3"),
        ], className="cfg mt-4"),
        
    ], className="pg")

def cfg_form(c):
    if not c: return dbc.Alert("No config found for this channel.", color="warning")
    return html.Div([dbc.Row([
        dbc.Col([
            html.Div([html.H6("💰 Risk"), dbc.Row([
                dbc.Col([dbc.Label("Risk %", className="small"), dbc.Input(id='c-risk', type='number', value=round((c.get('risk_per_trade') or 0.02)*100, 2), step=0.1)], xs=6),
                dbc.Col([dbc.Label("Tolerance %", className="small"), dbc.Input(id='c-tol', type='number', value=round((c.get('risk_tolerance') or 0.1)*100, 1))], xs=6)]),
                dbc.Row([dbc.Col([dbc.Label("Magic", className="small mt-2"), dbc.Input(id='c-mag', type='number', value=c.get('magic_number', 123456))], xs=6),
                        dbc.Col([dbc.Label("Slippage", className="small mt-2"), dbc.Input(id='c-slip', type='number', value=c.get('max_slippage_points', 20))], xs=6)])], className="cfg"),
            html.Div([html.H6("🎯 TP Policy"), dbc.Row([
                dbc.Col([dbc.Label("Type", className="small"), dbc.Select(id='c-tp', options=[{'label': 'R:R', 'value': 'rr'}, {'label': 'TP Index', 'value': 'tp_index'}], value=c.get('tp_kind', 'rr'))], xs=6),
                dbc.Col([dbc.Label("Value", className="small"), dbc.Input(id='c-tpv', type='number', value=c.get('rr_ratio') or c.get('tp_index') or 1, step=0.1)], xs=6)])], className="cfg"),
            html.Div([html.H6("🛡️ Risk-Free"), dbc.Checkbox(id='c-rf', label="Enable BE", value=c.get('rf_on', False), className="mb-2"),
                dbc.Row([dbc.Col([dbc.Label("Trigger", className="small"), dbc.Select(id='c-rfk', options=[{'label': '% Path', 'value': '%path'}, {'label': 'Pips', 'value': 'pips'}], value=c.get('rf_kind', '%path'))], xs=6),
                        dbc.Col([dbc.Label("Value", className="small"), dbc.Input(id='c-rfv', type='number', value=c.get('rf_pct') or 50)], xs=6)])], className="cfg"),
        ], xs=12, lg=6),
        dbc.Col([
            html.Div([html.H6("⚡ Circuit Breaker"), dbc.Checkbox(id='c-cb', label="Enable", value=c.get('cb_on', True), className="mb-2"),
                dbc.Row([dbc.Col([dbc.Label("Max Trades", className="small"), dbc.Input(id='c-cbt', type='number', value=c.get('cb_trades', 5))], xs=6),
                        dbc.Col([dbc.Label("Max Loss %", className="small"), dbc.Input(id='c-cbl', type='number', value=c.get('cb_loss', 5))], xs=6)])], className="cfg"),
            html.Div([html.H6("📊 Trend Filter"), dbc.Checkbox(id='c-tf', label="Enable", value=c.get('tf_on', False), className="mb-2"),
                dbc.Row([dbc.Col([dbc.Label("Swing", className="small"), dbc.Input(id='c-tfs', type='number', value=c.get('tf_swing', 2))], xs=6),
                        dbc.Col([dbc.Label("EMA", className="small"), dbc.Input(id='c-tfe', type='number', value=c.get('tf_ema', 50))], xs=6)]),
                html.Small("Blocks when M1 & M5 against signal", className="text-muted mt-2 d-block")], className="cfg"),
        ], xs=12, lg=6),
    ])])

# ============ LAYOUT ============

app.index_string = f'<!DOCTYPE html><html><head>{{%metas%}}<title>{{%title%}}</title>{{%favicon%}}{{%css%}}{CSS}</head><body>{{%app_entry%}}<footer>{{%config%}}{{%scripts%}}{{%renderer%}}</footer></body></html>'
app.layout = html.Div([dcc.Location(id='url', refresh=False), dcc.Interval(id='tick', interval=REFRESH, n_intervals=0), dcc.Store(id='data'), hdr(), html.Div(id='page')])

# ============ CALLBACKS ============

@app.callback(Output('page', 'children'), Input('url', 'pathname'))
def route(p):
    if p == '/live': return pg_live()
    if p == '/history': return pg_hist()
    if p == '/config': return pg_cfg()
    if p == '/debug': return pg_debug()
    return pg_dash()

@app.callback(Output('data', 'data'), Input('tick', 'n_intervals'))
def refresh(n): 
    df = load_trades(30)
    return df.to_json(date_format='iso', orient='split')

@app.callback([Output('k1', 'children'), Output('k2', 'children'), Output('k3', 'children'), Output('k4', 'children'),
               Output('ch1', 'figure'), Output('ch2', 'figure'), Output('ch3', 'figure'), Output('ch4', 'figure'),
               Output('s1', 'children'), Output('s2', 'children'), Output('s3', 'children')], Input('data', 'data'))
def upd_dash(j):
    if not j: raise PreventUpdate
    df = pd.read_json(j, orient='split')
    k = kpis(df)
    pc = 'pos' if k['pnl'] >= 0 else 'neg'
    return (kpi_c(f"${k['pnl']:,.2f}", "Net Profit", pc), kpi_c(f"{k['wr']:.1f}%", "Win Rate"),
            kpi_c(f"{k['trades']}", "Trades"), kpi_c(f"{k['pips']:,.0f}", "Pips"),
            equity(df), gauge(k), daily(df), by_channel(df),
            html.Div([html.Div(f"{k['act']}", className="n", style={'color': C['green']}), html.Div("positions", className="l")]),
            html.Div([html.Div(f"{k['pend']}", className="n", style={'color': C['yellow']}), html.Div("orders", className="l")]),
            html.Div([html.Div(f"{k['block']}", className="n", style={'color': C['red']}), html.Div("signals", className="l")]))

@app.callback([Output('t1', 'children'), Output('t2', 'children')], Input('tick', 'n_intervals'))
def upd_live(n):
    a = load_active()
    if a.empty: at = dbc.Alert("No active positions", color="secondary")
    else:
        a['dur'] = a['dur'].apply(lambda x: f"{int(x//3600)}h {int((x%3600)//60)}m" if pd.notna(x) else "-")
        at = dash_table.DataTable(data=a.to_dict('records'), columns=[{'name': c, 'id': c} for c in a.columns],
            style_header={'backgroundColor': C['bg2'], 'color': C['text2'], 'fontWeight': 600},
            style_cell={'backgroundColor': C['card'], 'color': C['text'], 'border': f'1px solid {C["border"]}', 'padding': '10px', 'fontSize': '13px'})
    p = load_pending()
    if p.empty: pt = dbc.Alert("No pending orders", color="secondary")
    else:
        p['wait'] = p['wait'].apply(lambda x: f"{int(x//3600)}h {int((x%3600)//60)}m" if pd.notna(x) else "-")
        pt = dash_table.DataTable(data=p.to_dict('records'), columns=[{'name': c, 'id': c} for c in p.columns],
            style_header={'backgroundColor': C['bg2'], 'color': C['text2'], 'fontWeight': 600},
            style_cell={'backgroundColor': C['card'], 'color': C['text'], 'border': f'1px solid {C["border"]}', 'padding': '10px', 'fontSize': '13px'})
    return at, pt

@app.callback(Output('t3', 'children'), [Input('days', 'value'), Input('tick', 'n_intervals')])
def upd_hist(d, n):
    df = load_trades(int(d) if d else 30)
    cl = df[df['status'] == 'closed'].head(100)
    if cl.empty: return dbc.Alert("No closed trades found", color="secondary")
    cols = ['channel_name', 'symbol', 'side', 'entry_price', 'close_price', 'profit_loss', 'profit_loss_pips', 'trade_outcome']
    cols = [c for c in cols if c in cl.columns]
    return dash_table.DataTable(data=cl[cols].to_dict('records'),
        columns=[{'name': c.replace('_', ' ').title(), 'id': c} for c in cols],
        style_header={'backgroundColor': C['bg2'], 'color': C['text2'], 'fontWeight': 600},
        style_cell={'backgroundColor': C['card'], 'color': C['text'], 'border': f'1px solid {C["border"]}', 'padding': '10px', 'fontSize': '13px'},
        style_data_conditional=[{'if': {'filter_query': '{trade_outcome} = profit'}, 'backgroundColor': C['green_bg'], 'color': C['green']},
                               {'if': {'filter_query': '{trade_outcome} = loss'}, 'backgroundColor': C['red_bg'], 'color': C['red']}],
        page_size=15, page_action='native', sort_action='native')

@app.callback(Output('cfg-form', 'children'), Input('cfg-ch', 'value'))
def load_cfg(cid):
    if not cid: return html.Div()
    return cfg_form(load_config(cid))

@app.callback(Output('cfg-msg', 'children'), Input('cfg-save', 'n_clicks'),
    [State('cfg-ch', 'value'), State('c-risk', 'value'), State('c-tol', 'value'), State('c-mag', 'value'), State('c-slip', 'value'),
     State('c-cb', 'value'), State('c-cbt', 'value'), State('c-cbl', 'value'), State('c-tf', 'value')], prevent_initial_call=True)
def save_cfg(n, cid, risk, tol, mag, slip, cb, cbt, cbl, tf):
    if not n or not cid: raise PreventUpdate
    ok = db.x("""
        UPDATE bot_configs SET risk_per_trade=%s, risk_tolerance=%s, magic_number=%s, max_slippage_points=%s, updated_at=NOW()
        WHERE channel_id=%s
    """, (risk/100 if risk else 0.02, tol/100 if tol else 0.1, mag or 123456, slip or 20, cid))
    if ok:
        return dbc.Alert([html.Strong("✅ Saved!"), html.Span(" Restart bot to apply.", className="ms-2")], color="success", dismissable=True)
    return dbc.Alert("❌ Save failed", color="danger", dismissable=True)

@app.callback(Output('debug-log', 'children'), [Input('refresh-log', 'n_clicks'), Input('url', 'pathname')])
def update_debug_log(n, path):
    return '\n'.join(DEBUG_LOG[-50:])

@app.callback(Output('test-result', 'children'), Input('test-query', 'n_clicks'), prevent_initial_call=True)
def run_test_query(n):
    if not db.ok:
        return dbc.Alert(f"Cannot test - DB not connected: {db.error}", color="danger")
    try:
        channels = db.q("SELECT COUNT(*) as cnt FROM channels")
        signals = db.q("SELECT COUNT(*) as cnt FROM signals")
        configs = db.q("SELECT COUNT(*) as cnt FROM bot_configs")
        
        return dbc.Alert([
            html.Strong("✅ Database OK!"), html.Br(),
            f"Channels: {channels[0]['cnt'] if channels else 0}", html.Br(),
            f"Signals: {signals[0]['cnt'] if signals else 0}", html.Br(),
            f"Bot Configs: {configs[0]['cnt'] if configs else 0}",
        ], color="success")
    except Exception as e:
        return dbc.Alert(f"Test failed: {e}", color="danger")

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8050))
    log(f"Starting on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
