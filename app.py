"""
Trading Dashboard - Cloud Edition (Full Version)
Matches original dashboard design + full GUI configuration
"""
import os
from datetime import datetime, timedelta, timezone
import threading
import sys

import dash
from dash import dcc, html, dash_table, Input, Output, State, callback, ctx
import dash_bootstrap_components as dbc
from dash.exceptions import PreventUpdate
import plotly.graph_objects as go
import plotly.express as px
import pandas as pd
import numpy as np

# ============ LOGGING ============
DEBUG_LOG = []
def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    DEBUG_LOG.append(f"[{ts}] {msg}")
    print(f"[{ts}] {msg}", file=sys.stderr)

log("Starting...")

# ============ DATABASE ============
try:
    import psycopg2
    from psycopg2 import pool
    from psycopg2.extras import RealDictCursor
    PG_OK = True
    log("psycopg2 OK")
except:
    PG_OK = False
    log("psycopg2 MISSING")

DATABASE_URL = os.getenv('DATABASE_URL', '')
log(f"DATABASE_URL: {'SET' if DATABASE_URL else 'NOT SET'}")

# ============ COLORS (matching original) ============
COLORS = {
    'bg_primary': '#0d1117', 'bg_secondary': '#161b22', 'bg_tertiary': '#21262d',
    'bg_card': '#1c2128', 'border': '#30363d', 'border_light': '#3d444d',
    'text_primary': '#e6edf3', 'text_secondary': '#8b949e', 'text_muted': '#6e7681',
    'accent_blue': '#58a6ff', 'accent_purple': '#a371f7', 'accent_cyan': '#39d5ff',
    'success': '#3fb950', 'success_bg': 'rgba(63, 185, 80, 0.15)',
    'danger': '#f85149', 'danger_bg': 'rgba(248, 81, 73, 0.15)',
    'warning': '#d29922', 'warning_bg': 'rgba(210, 153, 34, 0.15)',
    'chart_green': '#3fb950', 'chart_red': '#f85149', 'chart_blue': '#58a6ff',
    'chart_purple': '#a371f7', 'chart_cyan': '#39d5ff', 'chart_orange': '#db6d28',
}

REFRESH = 5000

# ============ DATABASE CLASS ============
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
            self._error = "psycopg2 not installed"
            return
        if not DATABASE_URL:
            self._error = "DATABASE_URL not set"
            return
        try:
            self._pool = pool.ThreadedConnectionPool(2, 10, DATABASE_URL, cursor_factory=RealDictCursor)
            log("DB Connected!")
            self._error = None
        except Exception as e:
            self._error = str(e)
            log(f"DB Error: {e}")
    
    @property
    def ok(self): return self._pool is not None
    @property 
    def error(self): return self._error
    
    def q(self, sql, p=None):
        if not self._pool: return []
        c = None
        try:
            c = self._pool.getconn()
            with c.cursor() as cur:
                cur.execute(sql, p)
                return cur.fetchall()
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

# ============ DATA FUNCTIONS ============
def load_trades(days=90):
    if not db.ok: return sample_data()
    r = db.q("""
        SELECT s.id as trade_id, c.channel_name, s.broker_symbol as symbol, s.side, s.order_type,
               s.effective_entry_price as entry_price, s.adjusted_sl_price as sl_price,
               s.final_tp_price as tp_price, s.lot_size, s.actual_risk_pct as risk_percent,
               s.actual_risk_amount as risk_amount, s.status, s.trade_outcome,
               s.fill_price, s.fill_time as execution_time, s.close_price, s.close_time,
               s.profit_loss, s.profit_loss_pips, s.riskfree_moved,
               s.block_reason, s.signal_received_at as signal_time
        FROM signals s LEFT JOIN channels c ON s.channel_id = c.id
        WHERE s.signal_received_at >= NOW() - INTERVAL '%s days'
        ORDER BY s.signal_received_at DESC
    """, (days,))
    if not r: return sample_data()
    df = pd.DataFrame(r)
    for col in ['execution_time', 'close_time', 'signal_time']:
        if col in df.columns: df[col] = pd.to_datetime(df[col], errors='coerce')
    return df

def load_channels():
    if not db.ok: return []
    return db.q("SELECT id, channel_key, channel_name, is_active FROM channels ORDER BY channel_name")

def load_config(cid):
    if not db.ok: return {}
    r = db.q("""
        SELECT bc.*, 
               tp.policy_kind as tp_kind, tp.rr_ratio, tp.tp_index as tp_tp_index,
               rf.is_enabled as rf_enabled, rf.policy_kind as rf_kind, 
               rf.percent_value as rf_percent, rf.pips_value as rf_pips, rf.tp_index as rf_tp_index,
               cn.is_enabled as cn_enabled, cn.policy_kind as cn_kind,
               cn.percent_value as cn_percent, cn.tp_index as cn_tp_index,
               cn.for_now_orders as cn_for_now, cn.for_limit_orders as cn_for_limit, cn.for_auto_orders as cn_for_auto,
               cb.is_enabled as cb_enabled, cb.max_daily_trades, cb.max_daily_loss_pct,
               tf.is_enabled as tf_enabled, tf.swing_strength, tf.min_swings_required,
               tf.ema_period, tf.candles_to_fetch, tf.require_all_three, tf.log_details,
               i.logical_symbol, i.broker_symbol as inst_broker, i.pip_tolerance
        FROM bot_configs bc
        LEFT JOIN tp_policies tp ON bc.id = tp.bot_config_id
        LEFT JOIN riskfree_policies rf ON bc.id = rf.bot_config_id
        LEFT JOIN cancel_policies cn ON bc.id = cn.bot_config_id
        LEFT JOIN circuit_breaker_configs cb ON bc.id = cb.bot_config_id
        LEFT JOIN trend_filter_configs tf ON bc.id = tf.bot_config_id
        LEFT JOIN instruments i ON bc.id = i.bot_config_id
        WHERE bc.channel_id = %s
    """, (cid,))
    return dict(r[0]) if r else {}

def sample_data():
    np.random.seed(42)
    data = []
    channels = ['FOREX MASTER', 'Gold Signals', 'XAUUSD Pro', 'TradeAlerts']
    base = datetime.now(timezone.utc) - timedelta(days=30)
    for i in range(80):
        t = base + timedelta(hours=np.random.randint(0, 720))
        side = np.random.choice(['BUY', 'SELL'])
        outcome = np.random.choice(['profit', 'loss', 'breakeven'], p=[0.5, 0.4, 0.1])
        entry = 2650 + np.random.uniform(-50, 50)
        pnl = np.random.uniform(50, 300) if outcome == 'profit' else (np.random.uniform(-150, -30) if outcome == 'loss' else np.random.uniform(-5, 5))
        data.append({
            'trade_id': f'demo_{i}', 'channel_name': np.random.choice(channels),
            'symbol': 'XAUUSD', 'side': side, 'order_type': np.random.choice(['MARKET', 'LIMIT']),
            'entry_price': entry, 'sl_price': entry - 10 if side == 'BUY' else entry + 10,
            'tp_price': entry + 20 if side == 'BUY' else entry - 20, 'lot_size': 0.1,
            'risk_percent': 0.02, 'risk_amount': 100, 'status': 'closed', 'trade_outcome': outcome,
            'profit_loss': pnl, 'profit_loss_pips': pnl / 2, 'signal_time': t,
            'execution_time': t + timedelta(minutes=np.random.randint(1, 30)),
            'close_time': t + timedelta(hours=np.random.randint(1, 24)),
            'riskfree_moved': np.random.choice([True, False]),
        })
    return pd.DataFrame(data)

def calculate_kpis(df):
    if df.empty:
        return {k: 0 for k in ['total_trades', 'win_trades', 'loss_trades', 'breakeven_trades',
                               'total_profit', 'total_loss', 'net_profit', 'win_rate', 'avg_win',
                               'avg_loss', 'profit_factor', 'total_pips', 'max_win', 'max_loss']}
    closed = df[df['status'] == 'closed'].copy()
    total = len(closed)
    wins = len(closed[closed['trade_outcome'] == 'profit'])
    losses = len(closed[closed['trade_outcome'] == 'loss'])
    be = len(closed[closed['trade_outcome'] == 'breakeven'])
    gp = closed[closed['profit_loss'] > 0]['profit_loss'].sum()
    gl = abs(closed[closed['profit_loss'] < 0]['profit_loss'].sum())
    return {
        'total_trades': total, 'win_trades': wins, 'loss_trades': losses, 'breakeven_trades': be,
        'total_profit': gp, 'total_loss': gl, 'net_profit': closed['profit_loss'].sum(),
        'win_rate': (wins / total * 100) if total > 0 else 0,
        'avg_win': gp / wins if wins > 0 else 0, 'avg_loss': gl / losses if losses > 0 else 0,
        'profit_factor': gp / gl if gl > 0 else 0,
        'total_pips': closed['profit_loss_pips'].sum() if 'profit_loss_pips' in closed else 0,
        'max_win': closed['profit_loss'].max() if total > 0 else 0,
        'max_loss': closed['profit_loss'].min() if total > 0 else 0,
    }

def apply_filters(df, start, end, channels, order_types, sides, statuses):
    if df.empty: return df
    f = df.copy()
    if start:
        f['signal_time'] = pd.to_datetime(f['signal_time'], errors='coerce')
        f = f[f['signal_time'] >= pd.to_datetime(start)]
    if end:
        f = f[f['signal_time'] <= pd.to_datetime(end) + timedelta(days=1)]
    if channels: f = f[f['channel_name'].isin(channels)]
    if order_types: f = f[f['order_type'].isin(order_types)]
    if sides: f = f[f['side'].isin(sides)]
    if statuses: f = f[f['status'].isin(statuses)]
    return f

# ============ CHART HELPERS ============
def chart_layout(h=380):
    return dict(
        template='plotly_dark', height=h, margin=dict(l=50, r=20, t=30, b=40),
        plot_bgcolor='rgba(0,0,0,0)', paper_bgcolor='rgba(0,0,0,0)',
        font=dict(family='JetBrains Mono, monospace', size=11, color=COLORS['text_secondary']),
        xaxis=dict(showgrid=True, gridcolor=COLORS['border'], zeroline=False),
        yaxis=dict(showgrid=True, gridcolor=COLORS['border'], zeroline=False),
        showlegend=False
    )

# ============ DASH APP ============
app = dash.Dash(__name__, 
    external_stylesheets=[
        dbc.themes.DARKLY,
        'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css',
        'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap'
    ],
    suppress_callback_exceptions=True,
    title="Trading Analytics Dashboard",
    meta_tags=[{'name': 'viewport', 'content': 'width=device-width, initial-scale=1'}]
)
server = app.server

# ============ CSS ============
CSS = f'''
<style>
:root {{
    --bg-primary: {COLORS['bg_primary']}; --bg-secondary: {COLORS['bg_secondary']};
    --bg-card: {COLORS['bg_card']}; --border: {COLORS['border']};
    --text-primary: {COLORS['text_primary']}; --text-secondary: {COLORS['text_secondary']};
    --accent-blue: {COLORS['accent_blue']}; --accent-cyan: {COLORS['accent_cyan']};
    --success: {COLORS['success']}; --danger: {COLORS['danger']};
}}
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{ font-family: 'Space Grotesk', sans-serif; background: linear-gradient(135deg, var(--bg-primary) 0%, #0a0f14 100%); color: var(--text-primary); min-height: 100vh; }}
::-webkit-scrollbar {{ width: 8px; height: 8px; }}
::-webkit-scrollbar-track {{ background: var(--bg-secondary); }}
::-webkit-scrollbar-thumb {{ background: var(--border); border-radius: 4px; }}

.kpi-card {{
    background: linear-gradient(145deg, var(--bg-card) 0%, var(--bg-secondary) 100%);
    border: 1px solid var(--border); border-radius: 12px; padding: 20px;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); position: relative; overflow: hidden;
}}
.kpi-card::before {{ content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
    background: linear-gradient(90deg, var(--accent-blue), var(--accent-cyan)); opacity: 0; transition: opacity 0.3s; }}
.kpi-card:hover {{ border-color: var(--accent-blue); transform: translateY(-4px); box-shadow: 0 12px 40px rgba(88, 166, 255, 0.15); }}
.kpi-card:hover::before {{ opacity: 1; }}
.kpi-value {{ font-family: 'JetBrains Mono', monospace; font-size: 28px; font-weight: 700;
    background: linear-gradient(135deg, var(--text-primary) 0%, var(--accent-cyan) 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }}
.kpi-value.positive {{ background: linear-gradient(135deg, var(--success) 0%, #2ea043 100%); -webkit-background-clip: text; background-clip: text; }}
.kpi-value.negative {{ background: linear-gradient(135deg, var(--danger) 0%, #da3633 100%); -webkit-background-clip: text; background-clip: text; }}
.kpi-label {{ font-size: 11px; color: {COLORS['text_muted']}; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }}
.kpi-subtitle {{ font-size: 11px; color: {COLORS['text_muted']}; margin-top: 8px; font-family: 'JetBrains Mono', monospace; }}

.chart-card {{ background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; transition: all 0.3s; }}
.chart-card:hover {{ box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3); }}
.chart-header {{ background: linear-gradient(90deg, {COLORS['bg_tertiary']} 0%, var(--bg-secondary) 100%);
    padding: 14px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 10px; }}
.chart-header i {{ color: var(--accent-cyan); font-size: 16px; }}
.chart-header span {{ font-weight: 600; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-secondary); }}

.nav-tabs {{ border: none !important; background: var(--bg-secondary); border-radius: 10px; padding: 6px; display: inline-flex !important; gap: 4px; }}
.nav-tabs .nav-link {{ border: none !important; border-radius: 8px; padding: 10px 24px; font-weight: 500; font-size: 13px;
    color: var(--text-secondary); background: transparent; transition: all 0.2s; white-space: nowrap; }}
.nav-tabs .nav-link:hover {{ color: var(--text-primary); background: {COLORS['bg_tertiary']}; }}
.nav-tabs .nav-link.active {{ background: linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-cyan) 100%) !important;
    color: var(--bg-primary) !important; font-weight: 600; }}

.filter-card {{ background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }}
.filter-label {{ font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;
    color: var(--text-secondary); margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }}
.filter-label i {{ color: var(--accent-cyan); }}

.config-group {{ background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; padding: 20px; margin-bottom: 16px; }}
.config-group h6 {{ color: var(--accent-cyan); font-weight: 600; margin-bottom: 16px; font-size: 14px; }}
.config-tabs {{ background: {COLORS['bg_tertiary']}; border-radius: 8px; padding: 4px; margin-bottom: 20px; }}
.config-tabs .nav-link {{ padding: 8px 16px; font-size: 12px; }}

.status-live {{ display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 20px; font-size: 11px;
    font-weight: 600; text-transform: uppercase; background: rgba(63, 185, 80, 0.15); color: var(--success); animation: pulse 2s infinite; }}
@keyframes pulse {{ 0%, 100% {{ opacity: 1; }} 50% {{ opacity: 0.7; }} }}
.status-demo {{ background: {COLORS['warning_bg']}; color: {COLORS['warning']}; }}

.btn-pro {{ background: linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-cyan) 100%);
    border: none; border-radius: 8px; padding: 10px 20px; font-weight: 600; font-size: 13px; color: var(--bg-primary); transition: all 0.2s; }}
.btn-pro:hover {{ transform: translateY(-2px); box-shadow: 0 6px 20px rgba(88, 166, 255, 0.3); }}

.dbg {{ background: #1a1a2e; border: 1px solid var(--border); border-radius: 8px; padding: 12px;
    font-family: 'JetBrains Mono', monospace; font-size: 11px; white-space: pre-wrap; max-height: 200px; overflow-y: auto; }}
</style>
'''

# ============ COMPONENTS ============
def kpi_card(title, value, subtitle="", icon="", value_class=""):
    return html.Div([
        html.Div([html.I(className=f"bi {icon}", style={'fontSize': '18px', 'color': COLORS['accent_cyan']})], style={'marginBottom': '12px'}),
        html.Div(title, className="kpi-label"),
        html.Div(value, className=f"kpi-value {value_class}"),
        html.Div(subtitle, className="kpi-subtitle") if subtitle else None
    ], className="kpi-card")

def chart_card(title, icon, chart_id):
    return html.Div([
        html.Div([html.I(className=f"bi {icon}"), html.Span(title)], className="chart-header"),
        html.Div([dcc.Graph(id=chart_id, config={'displayModeBar': False})], style={'padding': '16px'})
    ], className="chart-card")

# ============ NAVBAR ============
def navbar():
    status_cls = "status-live" if db.ok else "status-live status-demo"
    status_txt = "LIVE" if db.ok else "DEMO"
    return html.Div([
        dbc.Container([
            html.Div([
                html.Div([
                    html.Div([html.I(className="bi bi-lightning-charge-fill", style={'fontSize': '24px', 'color': COLORS['accent_cyan']})],
                        style={'width': '44px', 'height': '44px', 'borderRadius': '10px', 'background': f'linear-gradient(135deg, {COLORS["bg_tertiary"]} 0%, {COLORS["bg_secondary"]} 100%)',
                               'display': 'flex', 'alignItems': 'center', 'justifyContent': 'center', 'border': f'1px solid {COLORS["border"]}'}),
                    html.Div([
                        html.Div("Trading Analytics", style={'fontSize': '18px', 'fontWeight': '700', 'letterSpacing': '-0.5px'}),
                        html.Div("Real-time Performance Dashboard", style={'fontSize': '11px', 'color': COLORS['text_muted'], 'textTransform': 'uppercase', 'letterSpacing': '1px'})
                    ], style={'marginLeft': '14px'})
                ], style={'display': 'flex', 'alignItems': 'center'}),
                html.Div([
                    html.Div([html.Span("●", style={'marginRight': '6px', 'fontSize': '10px'}), html.Span(status_txt)], className=status_cls, style={'marginRight': '20px'}),
                    html.Div([html.I(className="bi bi-clock", style={'marginRight': '6px'}), html.Span(id='last-update', children=datetime.now().strftime('%H:%M:%S'))],
                            style={'color': COLORS['text_muted'], 'fontSize': '12px', 'fontFamily': 'JetBrains Mono'})
                ], style={'display': 'flex', 'alignItems': 'center'})
            ], style={'display': 'flex', 'justifyContent': 'space-between', 'alignItems': 'center', 'padding': '16px 0'})
        ], fluid=True, style={'maxWidth': '1600px'})
    ], style={'background': COLORS['bg_secondary'], 'borderBottom': f'1px solid {COLORS["border"]}', 'position': 'sticky', 'top': 0, 'zIndex': 1000})

# ============ HOME TAB ============
def home_tab():
    return dbc.Container([
        dbc.Row([
            dbc.Col(html.Div(id='kpi-net-profit'), xl=3, lg=3, md=6, className="mb-4"),
            dbc.Col(html.Div(id='kpi-total-trades'), xl=3, lg=3, md=6, className="mb-4"),
            dbc.Col(html.Div(id='kpi-win-rate'), xl=3, lg=3, md=6, className="mb-4"),
            dbc.Col(html.Div(id='kpi-profit-factor'), xl=3, lg=3, md=6, className="mb-4"),
        ]),
        dbc.Row([
            dbc.Col(html.Div(id='kpi-win-trades'), xl=2, lg=4, md=6, className="mb-4"),
            dbc.Col(html.Div(id='kpi-loss-trades'), xl=2, lg=4, md=6, className="mb-4"),
            dbc.Col(html.Div(id='kpi-avg-win'), xl=2, lg=4, md=6, className="mb-4"),
            dbc.Col(html.Div(id='kpi-avg-loss'), xl=2, lg=4, md=6, className="mb-4"),
            dbc.Col(html.Div(id='kpi-max-win'), xl=2, lg=4, md=6, className="mb-4"),
            dbc.Col(html.Div(id='kpi-max-loss'), xl=2, lg=4, md=6, className="mb-4"),
        ]),
        dbc.Row([
            dbc.Col([chart_card("P&L by Channel", "bi-broadcast", "channel-pnl-chart")], lg=8, className="mb-4"),
            dbc.Col([chart_card("Win/Loss Distribution", "bi-pie-chart", "win-loss-pie")], lg=4, className="mb-4"),
        ]),
        dbc.Row([
            dbc.Col([chart_card("Daily P&L", "bi-bar-chart", "daily-pnl")], lg=6, className="mb-4"),
            dbc.Col([chart_card("Cumulative P&L", "bi-graph-up-arrow", "cumulative-pnl")], lg=6, className="mb-4"),
        ]),
    ], fluid=True, style={'maxWidth': '1600px', 'margin': '0 auto', 'padding': '24px 16px'})

# ============ TRADES TAB ============
def trades_tab():
    return dbc.Container([
        html.Div([
            dbc.Row([
                dbc.Col([
                    html.Div([html.I(className="bi bi-calendar-range"), html.Span("Date Range")], className="filter-label"),
                    dcc.DatePickerRange(id='date-filter', start_date=(datetime.now() - timedelta(days=30)).date(),
                                       end_date=datetime.now().date(), display_format='MMM D, YYYY', className="w-100")
                ], xl=3, lg=4, md=6, className="mb-3"),
                dbc.Col([
                    html.Div([html.I(className="bi bi-broadcast"), html.Span("Channel")], className="filter-label"),
                    dcc.Dropdown(id='channel-filter', multi=True, placeholder="All Channels")
                ], xl=2, lg=4, md=6, className="mb-3"),
                dbc.Col([
                    html.Div([html.I(className="bi bi-arrow-left-right"), html.Span("Order Type")], className="filter-label"),
                    dcc.Dropdown(id='order-type-filter', options=[{'label': 'Market', 'value': 'MARKET'}, {'label': 'Limit', 'value': 'LIMIT'}],
                                multi=True, placeholder="All Types")
                ], xl=2, lg=4, md=4, className="mb-3"),
                dbc.Col([
                    html.Div([html.I(className="bi bi-arrow-up-down"), html.Span("Side")], className="filter-label"),
                    dcc.Dropdown(id='side-filter', options=[{'label': 'Buy', 'value': 'BUY'}, {'label': 'Sell', 'value': 'SELL'}],
                                multi=True, placeholder="All Sides")
                ], xl=2, lg=4, md=4, className="mb-3"),
                dbc.Col([
                    html.Div([html.I(className="bi bi-check-circle"), html.Span("Status")], className="filter-label"),
                    dcc.Dropdown(id='status-filter', options=[{'label': 'Closed', 'value': 'closed'}, {'label': 'Active', 'value': 'active'},
                                {'label': 'Pending', 'value': 'pending'}, {'label': 'Blocked', 'value': 'blocked'}],
                                multi=True, placeholder="All Status")
                ], xl=2, lg=4, md=4, className="mb-3"),
            ]),
        ], className="filter-card mb-4"),
        dbc.Row([dbc.Col(html.Div(id='filtered-stats'), md=12)], className="mb-4"),
        html.Div([
            html.Div([html.I(className="bi bi-table"), html.Span("Trade History")], className="chart-header"),
            html.Div([dash_table.DataTable(id='trades-table', columns=[], data=[], filter_action="native", sort_action="native",
                page_action="native", page_size=15,
                style_table={'overflowX': 'auto'},
                style_cell={'textAlign': 'left', 'padding': '12px', 'fontFamily': 'JetBrains Mono', 'fontSize': '12px',
                           'backgroundColor': COLORS['bg_card'], 'color': COLORS['text_primary'], 'border': f'1px solid {COLORS["border"]}'},
                style_header={'backgroundColor': COLORS['bg_tertiary'], 'fontWeight': '600', 'color': COLORS['text_secondary'],
                             'fontSize': '11px', 'textTransform': 'uppercase', 'border': f'1px solid {COLORS["border"]}'},
                style_data_conditional=[
                    {'if': {'filter_query': '{trade_outcome} = "profit"'}, 'backgroundColor': COLORS['success_bg'], 'color': COLORS['success']},
                    {'if': {'filter_query': '{trade_outcome} = "loss"'}, 'backgroundColor': COLORS['danger_bg'], 'color': COLORS['danger']}
                ])
            ], style={'padding': '16px'})
        ], className="chart-card mb-4"),
        dbc.Row([
            dbc.Col([chart_card("Performance by Hour", "bi-clock", "hourly-chart")], lg=6, className="mb-4"),
            dbc.Col([chart_card("Rolling Win Rate (20)", "bi-graph-up-arrow", "rolling-wr")], lg=6, className="mb-4"),
        ]),
    ], fluid=True, style={'maxWidth': '1600px', 'margin': '0 auto', 'padding': '24px 16px'})

# ============ CONFIG TAB ============
def config_tab():
    chs = load_channels()
    if not chs:
        return dbc.Container([
            html.H4("⚙️ Bot Configuration", className="mb-4"),
            dbc.Alert([html.H5("Database Issue"), html.P(f"Error: {db.error or 'No channels found'}"),
                      html.P("Channels appear after your bot sends signals.")], color="warning")
        ], fluid=True, style={'maxWidth': '1200px', 'padding': '24px'})
    
    opts = [{'label': c['channel_name'] or c['channel_key'], 'value': c['id']} for c in chs]
    
    return dbc.Container([
        html.H4("⚙️ Bot Configuration", className="mb-4"),
        dbc.Row([dbc.Col([
            dbc.Label("Select Channel", style={'fontWeight': '600'}),
            dbc.Select(id='cfg-channel', options=opts, value=opts[0]['value'] if opts else None,
                      style={'background': COLORS['bg_tertiary'], 'border': f'1px solid {COLORS["border"]}'})
        ], md=4, className="mb-4")]),
        
        html.Div(id='config-form'),
        
        dbc.Button([html.I(className="bi bi-save me-2"), "Save Configuration"], id='save-config', className="btn-pro mt-3"),
        html.Div(id='save-status', className="mt-3"),
    ], fluid=True, style={'maxWidth': '1200px', 'padding': '24px'})

def render_config_form(cfg):
    if not cfg:
        return dbc.Alert("No configuration found. Bot creates one when it starts.", color="info")
    
    return html.Div([
        dbc.Tabs([
            dbc.Tab(label="📋 Basic", children=[
                html.Div([
                    html.Div([
                        html.H6("Risk Settings"),
                        dbc.Row([
                            dbc.Col([dbc.Label("Risk Per Trade", className="small"),
                                    dbc.InputGroup([dbc.Input(id='cfg-risk', type='number', value=round((cfg.get('risk_per_trade') or 0.02)*100, 2), step=0.1),
                                                   dbc.InputGroupText("%")])], md=6),
                            dbc.Col([dbc.Label("Risk Tolerance", className="small"),
                                    dbc.InputGroup([dbc.Input(id='cfg-tolerance', type='number', value=round((cfg.get('risk_tolerance') or 0.1)*100, 1), step=1),
                                                   dbc.InputGroupText("%")])], md=6),
                        ]),
                    ], className="config-group"),
                    html.Div([
                        html.H6("Identification"),
                        dbc.Row([
                            dbc.Col([dbc.Label("Magic Number", className="small"),
                                    dbc.Input(id='cfg-magic', type='number', value=cfg.get('magic_number', 123456))], md=6),
                            dbc.Col([dbc.Label("Max Slippage (points)", className="small"),
                                    dbc.Input(id='cfg-slippage', type='number', value=cfg.get('max_slippage_points', 20))], md=6),
                        ]),
                    ], className="config-group"),
                ], className="p-3")
            ]),
            
            dbc.Tab(label="💹 Instruments", children=[
                html.Div([
                    html.Div([
                        html.H6("Primary Instrument"),
                        dbc.Row([
                            dbc.Col([dbc.Label("Logical Symbol", className="small"),
                                    dbc.Input(id='cfg-logical', value=cfg.get('logical_symbol', 'XAUUSD'))], md=4),
                            dbc.Col([dbc.Label("Broker Symbol", className="small"),
                                    dbc.Input(id='cfg-broker-sym', value=cfg.get('inst_broker', 'XAUUSD'))], md=4),
                            dbc.Col([dbc.Label("Pip Tolerance", className="small"),
                                    dbc.Input(id='cfg-pip-tol', type='number', value=cfg.get('pip_tolerance', 1.5), step=0.1)], md=4),
                        ]),
                    ], className="config-group"),
                ], className="p-3")
            ]),
            
            dbc.Tab(label="🎯 TP Policy", children=[
                html.Div([
                    html.Div([
                        html.H6("Take Profit Policy"),
                        dbc.Row([
                            dbc.Col([dbc.Label("Policy Type", className="small"),
                                    dbc.Select(id='cfg-tp-kind', options=[{'label': 'R:R Ratio', 'value': 'rr'}, {'label': 'TP Index', 'value': 'tp_index'}],
                                              value=cfg.get('tp_kind', 'rr'))], md=4),
                            dbc.Col([dbc.Label("R:R Ratio", className="small"),
                                    dbc.Input(id='cfg-rr', type='number', value=cfg.get('rr_ratio', 1.0), step=0.1)], md=4),
                            dbc.Col([dbc.Label("TP Index", className="small"),
                                    dbc.Input(id='cfg-tp-idx', type='number', value=cfg.get('tp_tp_index', 1), min=1, max=10)], md=4),
                        ]),
                    ], className="config-group"),
                ], className="p-3")
            ]),
            
            dbc.Tab(label="🛡️ Risk-Free", children=[
                html.Div([
                    html.Div([
                        html.H6("Breakeven Policy"),
                        dbc.Checkbox(id='cfg-rf-on', label="Enable Risk-Free", value=cfg.get('rf_enabled', False), className="mb-3"),
                        dbc.Row([
                            dbc.Col([dbc.Label("Trigger Type", className="small"),
                                    dbc.Select(id='cfg-rf-kind', options=[{'label': '% Path', 'value': '%path'}, {'label': 'Pips', 'value': 'pips'}, {'label': 'TP Index', 'value': 'tp_index'}],
                                              value=cfg.get('rf_kind', '%path'))], md=4),
                            dbc.Col([dbc.Label("Percent Value", className="small"),
                                    dbc.Input(id='cfg-rf-pct', type='number', value=cfg.get('rf_percent', 50))], md=4),
                            dbc.Col([dbc.Label("Pips Value", className="small"),
                                    dbc.Input(id='cfg-rf-pips', type='number', value=cfg.get('rf_pips', 10))], md=4),
                        ]),
                    ], className="config-group"),
                ], className="p-3")
            ]),
            
            dbc.Tab(label="❌ Cancel", children=[
                html.Div([
                    html.Div([
                        html.H6("Pending Order Cancel Policy"),
                        dbc.Checkbox(id='cfg-cn-on', label="Enable Cancel Policy", value=cfg.get('cn_enabled', True), className="mb-3"),
                        dbc.Row([
                            dbc.Col([dbc.Label("Trigger Type", className="small"),
                                    dbc.Select(id='cfg-cn-kind', options=[{'label': 'Final TP', 'value': 'final_tp'}, {'label': 'TP Index', 'value': 'tp_index'}, {'label': '% Path', 'value': '%path'}],
                                              value=cfg.get('cn_kind', 'final_tp'))], md=4),
                            dbc.Col([dbc.Label("Percent", className="small"),
                                    dbc.Input(id='cfg-cn-pct', type='number', value=cfg.get('cn_percent', 50))], md=4),
                            dbc.Col([dbc.Label("TP Index", className="small"),
                                    dbc.Input(id='cfg-cn-idx', type='number', value=cfg.get('cn_tp_index', 1))], md=4),
                        ]),
                        html.Hr(),
                        html.P("Apply to:", className="small fw-bold"),
                        dbc.Checkbox(id='cfg-cn-now', label="NOW orders", value=cfg.get('cn_for_now', True), className="me-3", inline=True),
                        dbc.Checkbox(id='cfg-cn-limit', label="LIMIT orders", value=cfg.get('cn_for_limit', True), className="me-3", inline=True),
                        dbc.Checkbox(id='cfg-cn-auto', label="AUTO orders", value=cfg.get('cn_for_auto', True), inline=True),
                    ], className="config-group"),
                ], className="p-3")
            ]),
            
            dbc.Tab(label="📊 Trend Filter", children=[
                html.Div([
                    dbc.Alert("Blocks trades when both M1 and M5 timeframes are against the signal direction. Uses Structure (HH/HL), VWAP, and EMA methods.", color="info", className="mb-3"),
                    html.Div([
                        html.H6("Trend Filter Settings"),
                        dbc.Checkbox(id='cfg-tf-on', label="Enable Trend Filter", value=cfg.get('tf_enabled', False), className="mb-3"),
                        dbc.Row([
                            dbc.Col([dbc.Label("Swing Strength", className="small"),
                                    dbc.Input(id='cfg-tf-swing', type='number', value=cfg.get('swing_strength', 2), min=1, max=10)], md=3),
                            dbc.Col([dbc.Label("Min Swings", className="small"),
                                    dbc.Input(id='cfg-tf-minswing', type='number', value=cfg.get('min_swings_required', 2), min=1, max=5)], md=3),
                            dbc.Col([dbc.Label("EMA Period", className="small"),
                                    dbc.Input(id='cfg-tf-ema', type='number', value=cfg.get('ema_period', 50), min=5, max=200)], md=3),
                            dbc.Col([dbc.Label("Candles", className="small"),
                                    dbc.Input(id='cfg-tf-candles', type='number', value=cfg.get('candles_to_fetch', 100), min=20, max=500)], md=3),
                        ]),
                        html.Hr(),
                        dbc.Checkbox(id='cfg-tf-all3', label="Require all 3 methods to agree", value=cfg.get('require_all_three', False), className="me-3"),
                        dbc.Checkbox(id='cfg-tf-log', label="Log detailed analysis", value=cfg.get('log_details', True)),
                    ], className="config-group"),
                ], className="p-3")
            ]),
            
            dbc.Tab(label="⚡ Circuit Breaker", children=[
                html.Div([
                    html.Div([
                        html.H6("Circuit Breaker Settings"),
                        dbc.Checkbox(id='cfg-cb-on', label="Enable Circuit Breaker", value=cfg.get('cb_enabled', True), className="mb-3"),
                        dbc.Row([
                            dbc.Col([dbc.Label("Max Daily Trades", className="small"),
                                    dbc.Input(id='cfg-cb-trades', type='number', value=cfg.get('max_daily_trades', 20), min=1, max=100)], md=6),
                            dbc.Col([dbc.Label("Max Daily Loss %", className="small"),
                                    dbc.InputGroup([dbc.Input(id='cfg-cb-loss', type='number', value=cfg.get('max_daily_loss_pct', 10), min=1, max=50),
                                                   dbc.InputGroupText("%")])], md=6),
                        ]),
                    ], className="config-group"),
                ], className="p-3")
            ]),
        ], className="config-tabs"),
    ])

# ============ DEBUG TAB ============
def debug_tab():
    return dbc.Container([
        html.H4("🔧 Debug", className="mb-4"),
        html.Div([
            html.H6("Connection Status"),
            html.Div([
                html.Span("psycopg2: ", style={'fontWeight': '600'}),
                html.Span("✅ OK" if PG_OK else "❌ Missing", style={'color': COLORS['success'] if PG_OK else COLORS['danger']}),
            ]),
            html.Div([
                html.Span("DATABASE_URL: ", style={'fontWeight': '600'}),
                html.Span("✅ Set" if DATABASE_URL else "❌ Not Set", style={'color': COLORS['success'] if DATABASE_URL else COLORS['danger']}),
            ]),
            html.Div([
                html.Span("Connected: ", style={'fontWeight': '600'}),
                html.Span("✅ Yes" if db.ok else "❌ No", style={'color': COLORS['success'] if db.ok else COLORS['danger']}),
            ]),
            html.Div([html.Span("Error: ", style={'fontWeight': '600'}), html.Span(db.error or "None")]) if db.error else None,
        ], className="config-group"),
        html.Div([html.H6("Log"), html.Div(id='debug-log', className="dbg")], className="config-group"),
        dbc.Button("Test DB", id='test-db', color="primary", size="sm"),
        html.Div(id='test-result', className="mt-3"),
    ], fluid=True, style={'maxWidth': '800px', 'padding': '24px'})

# ============ LAYOUT ============
app.index_string = f'<!DOCTYPE html><html><head>{{%metas%}}<title>{{%title%}}</title>{{%favicon%}}{{%css%}}{CSS}</head><body>{{%app_entry%}}<footer>{{%config%}}{{%scripts%}}{{%renderer%}}</footer></body></html>'

app.layout = html.Div([
    dcc.Store(id='trade-data'),
    dcc.Interval(id='interval', interval=REFRESH, n_intervals=0),
    navbar(),
    dbc.Container([
        dbc.Tabs([
            dbc.Tab(label="🏠 Home", tab_id="home"),
            dbc.Tab(label="📊 Trades", tab_id="trades"),
            dbc.Tab(label="⚙️ Config", tab_id="config"),
            dbc.Tab(label="🔧 Debug", tab_id="debug"),
        ], id="tabs", active_tab="home", className="mb-3", style={'marginTop': '20px'}),
        html.Div(id="tab-content"),
    ], fluid=True, style={'maxWidth': '1600px'})
])

# ============ CALLBACKS ============
@callback(Output('tab-content', 'children'), Input('tabs', 'active_tab'))
def render_tab(tab):
    if tab == "trades": return trades_tab()
    if tab == "config": return config_tab()
    if tab == "debug": return debug_tab()
    return home_tab()

@callback(Output('trade-data', 'data'), Input('interval', 'n_intervals'))
def refresh_data(n):
    return load_trades(90).to_json(date_format='iso', orient='split')

@callback(Output('last-update', 'children'), Input('interval', 'n_intervals'))
def update_time(n):
    return datetime.now().strftime('%H:%M:%S')

# Home KPIs
@callback([Output('kpi-net-profit', 'children'), Output('kpi-total-trades', 'children'),
           Output('kpi-win-rate', 'children'), Output('kpi-profit-factor', 'children'),
           Output('kpi-win-trades', 'children'), Output('kpi-loss-trades', 'children'),
           Output('kpi-avg-win', 'children'), Output('kpi-avg-loss', 'children'),
           Output('kpi-max-win', 'children'), Output('kpi-max-loss', 'children')],
          Input('trade-data', 'data'))
def update_kpis(data):
    if not data: raise PreventUpdate
    df = pd.read_json(data, orient='split')
    k = calculate_kpis(df)
    pc = 'positive' if k['net_profit'] >= 0 else 'negative'
    return (
        kpi_card("Net Profit", f"${k['net_profit']:,.2f}", icon="bi-currency-dollar", value_class=pc),
        kpi_card("Total Trades", str(k['total_trades']), icon="bi-graph-up"),
        kpi_card("Win Rate", f"{k['win_rate']:.1f}%", icon="bi-percent"),
        kpi_card("Profit Factor", f"{k['profit_factor']:.2f}", icon="bi-bar-chart-line"),
        kpi_card("Wins", str(k['win_trades']), icon="bi-check-circle", value_class="positive"),
        kpi_card("Losses", str(k['loss_trades']), icon="bi-x-circle", value_class="negative"),
        kpi_card("Avg Win", f"${k['avg_win']:.2f}", icon="bi-arrow-up", value_class="positive"),
        kpi_card("Avg Loss", f"${k['avg_loss']:.2f}", icon="bi-arrow-down", value_class="negative"),
        kpi_card("Max Win", f"${k['max_win']:.2f}", icon="bi-trophy", value_class="positive"),
        kpi_card("Max Loss", f"${k['max_loss']:.2f}", icon="bi-exclamation-triangle", value_class="negative"),
    )

# Home Charts
@callback([Output('channel-pnl-chart', 'figure'), Output('win-loss-pie', 'figure'),
           Output('daily-pnl', 'figure'), Output('cumulative-pnl', 'figure')],
          Input('trade-data', 'data'))
def update_home_charts(data):
    if not data: raise PreventUpdate
    df = pd.read_json(data, orient='split')
    closed = df[df['status'] == 'closed']
    
    # Channel P&L
    fig1 = go.Figure()
    if not closed.empty and 'channel_name' in closed:
        ch = closed.groupby('channel_name')['profit_loss'].sum().sort_values()
        colors = [COLORS['chart_green'] if v >= 0 else COLORS['chart_red'] for v in ch.values]
        fig1.add_trace(go.Bar(x=ch.values, y=ch.index, orientation='h', marker_color=colors))
    fig1.update_layout(**chart_layout())
    
    # Win/Loss Pie
    fig2 = go.Figure()
    k = calculate_kpis(df)
    if k['total_trades'] > 0:
        fig2.add_trace(go.Pie(labels=['Wins', 'Losses', 'BE'], values=[k['win_trades'], k['loss_trades'], k['breakeven_trades']],
                             marker_colors=[COLORS['chart_green'], COLORS['chart_red'], COLORS['chart_blue']], hole=0.5))
    fig2.update_layout(**chart_layout())
    
    # Daily P&L
    fig3 = go.Figure()
    if not closed.empty:
        c = closed.copy()
        c['date'] = pd.to_datetime(c['close_time'], errors='coerce').dt.date
        c = c.dropna(subset=['date'])
        if not c.empty:
            daily = c.groupby('date')['profit_loss'].sum()
            colors = [COLORS['chart_green'] if v >= 0 else COLORS['chart_red'] for v in daily.values]
            fig3.add_trace(go.Bar(x=daily.index, y=daily.values, marker_color=colors))
    fig3.update_layout(**chart_layout())
    
    # Cumulative
    fig4 = go.Figure()
    if not closed.empty:
        c = closed.dropna(subset=['close_time']).sort_values('close_time').copy()
        if not c.empty:
            c['cum'] = c['profit_loss'].cumsum()
            fig4.add_trace(go.Scatter(x=c['close_time'], y=c['cum'], mode='lines', fill='tozeroy',
                                     line=dict(color=COLORS['accent_blue'], width=2), fillcolor='rgba(88,166,255,0.2)'))
    fig4.update_layout(**chart_layout())
    
    return fig1, fig2, fig3, fig4

# Trades filters
@callback(Output('channel-filter', 'options'), Input('trade-data', 'data'))
def update_channel_options(data):
    if not data: return []
    df = pd.read_json(data, orient='split')
    if 'channel_name' not in df: return []
    return [{'label': c, 'value': c} for c in df['channel_name'].dropna().unique()]

@callback([Output('filtered-stats', 'children'), Output('trades-table', 'data'), Output('trades-table', 'columns')],
          [Input('trade-data', 'data'), Input('date-filter', 'start_date'), Input('date-filter', 'end_date'),
           Input('channel-filter', 'value'), Input('order-type-filter', 'value'),
           Input('side-filter', 'value'), Input('status-filter', 'value')])
def update_filtered(data, start, end, channels, order_types, sides, statuses):
    if not data: raise PreventUpdate
    df = pd.read_json(data, orient='split')
    f = apply_filters(df, start, end, channels, order_types, sides, statuses)
    k = calculate_kpis(f)
    
    stats = dbc.Row([
        dbc.Col(kpi_card("Filtered Trades", str(k['total_trades']), icon="bi-filter"), xl=3, md=6, className="mb-3"),
        dbc.Col(kpi_card("Net P&L", f"${k['net_profit']:,.2f}", icon="bi-cash", value_class='positive' if k['net_profit']>=0 else 'negative'), xl=3, md=6, className="mb-3"),
        dbc.Col(kpi_card("Win Rate", f"{k['win_rate']:.1f}%", icon="bi-percent"), xl=3, md=6, className="mb-3"),
        dbc.Col(kpi_card("Pips", f"{k['total_pips']:,.0f}", icon="bi-bullseye"), xl=3, md=6, className="mb-3"),
    ])
    
    cols = ['channel_name', 'symbol', 'side', 'order_type', 'entry_price', 'close_price', 'profit_loss', 'profit_loss_pips', 'status', 'trade_outcome']
    cols = [c for c in cols if c in f.columns]
    columns = [{'name': c.replace('_', ' ').title(), 'id': c} for c in cols]
    
    return stats, f[cols].head(100).to_dict('records'), columns

@callback([Output('hourly-chart', 'figure'), Output('rolling-wr', 'figure')],
          [Input('trade-data', 'data'), Input('date-filter', 'start_date'), Input('date-filter', 'end_date'),
           Input('channel-filter', 'value'), Input('order-type-filter', 'value'),
           Input('side-filter', 'value'), Input('status-filter', 'value')])
def update_trade_charts(data, start, end, channels, order_types, sides, statuses):
    if not data: raise PreventUpdate
    df = pd.read_json(data, orient='split')
    f = apply_filters(df, start, end, channels, order_types, sides, statuses)
    closed = f[f['status'] == 'closed']
    
    # Hourly
    fig1 = go.Figure()
    if not closed.empty:
        c = closed.copy()
        c['hour'] = pd.to_datetime(c['signal_time'], errors='coerce').dt.hour
        c = c.dropna(subset=['hour'])
        if not c.empty:
            hourly = c.groupby('hour')['profit_loss'].sum()
            colors = [COLORS['chart_green'] if v >= 0 else COLORS['chart_red'] for v in hourly.values]
            fig1.add_trace(go.Bar(x=hourly.index, y=hourly.values, marker_color=colors))
    fig1.update_layout(**chart_layout())
    
    # Rolling WR
    fig2 = go.Figure()
    if len(closed) >= 20:
        c = closed.dropna(subset=['close_time']).sort_values('close_time').copy()
        c['is_win'] = (c['trade_outcome'] == 'profit').astype(int)
        c['rolling_wr'] = c['is_win'].rolling(20).mean() * 100
        c = c.dropna(subset=['rolling_wr'])
        if not c.empty:
            fig2.add_trace(go.Scatter(x=c['close_time'], y=c['rolling_wr'], mode='lines',
                                     line=dict(color=COLORS['chart_purple'], width=2), fill='tozeroy', fillcolor=f'{COLORS["chart_purple"]}22'))
            fig2.add_hline(y=50, line_dash="dash", line_color=COLORS['warning'])
    fig2.update_layout(**chart_layout())
    fig2.update_yaxes(range=[0, 100])
    
    return fig1, fig2

# Config
@callback(Output('config-form', 'children'), Input('cfg-channel', 'value'))
def load_config_form(cid):
    if not cid: return html.Div()
    return render_config_form(load_config(cid))

@callback(Output('save-status', 'children'), Input('save-config', 'n_clicks'),
          [State('cfg-channel', 'value'), State('cfg-risk', 'value'), State('cfg-tolerance', 'value'),
           State('cfg-magic', 'value'), State('cfg-slippage', 'value'),
           State('cfg-cb-on', 'value'), State('cfg-cb-trades', 'value'), State('cfg-cb-loss', 'value'),
           State('cfg-tf-on', 'value'), State('cfg-tf-swing', 'value'), State('cfg-tf-ema', 'value')],
          prevent_initial_call=True)
def save_config(n, cid, risk, tol, magic, slip, cb_on, cb_trades, cb_loss, tf_on, tf_swing, tf_ema):
    if not n or not cid: raise PreventUpdate
    
    ok1 = db.x("""UPDATE bot_configs SET risk_per_trade=%s, risk_tolerance=%s, magic_number=%s, max_slippage_points=%s, updated_at=NOW() WHERE channel_id=%s""",
              (risk/100 if risk else 0.02, tol/100 if tol else 0.1, magic or 123456, slip or 20, cid))
    
    if ok1:
        return dbc.Alert([html.I(className="bi bi-check-circle me-2"), "Configuration saved! Restart bot to apply."], color="success", dismissable=True)
    return dbc.Alert("Save failed", color="danger")

# Debug
@callback(Output('debug-log', 'children'), [Input('tabs', 'active_tab'), Input('interval', 'n_intervals')])
def update_log(tab, n):
    return '\n'.join(DEBUG_LOG[-30:])

@callback(Output('test-result', 'children'), Input('test-db', 'n_clicks'), prevent_initial_call=True)
def test_db(n):
    if not db.ok: return dbc.Alert(f"Not connected: {db.error}", color="danger")
    try:
        ch = db.q("SELECT COUNT(*) as c FROM channels")
        sig = db.q("SELECT COUNT(*) as c FROM signals")
        return dbc.Alert(f"✅ OK! Channels: {ch[0]['c']}, Signals: {sig[0]['c']}", color="success")
    except Exception as e:
        return dbc.Alert(f"Error: {e}", color="danger")

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8050))
    log(f"Starting on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
