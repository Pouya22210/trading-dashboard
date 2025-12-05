"""
Trading Dashboard - PostgreSQL Edition
Deployment: Railway (GitHub connected)
Database: Supabase PostgreSQL
"""

import os
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional

import dash
from dash import dcc, html, dash_table, Input, Output, State, callback, ctx
import dash_bootstrap_components as dbc
from dash.exceptions import PreventUpdate
import plotly.graph_objects as go
import pandas as pd
import numpy as np
import psycopg2
from psycopg2.extras import RealDictCursor

# ========================== Configuration ==========================

DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    supabase_url = os.getenv('SUPABASE_URL', '')
    db_password = os.getenv('SUPABASE_DB_PASSWORD', '')
    if supabase_url and db_password:
        project_ref = supabase_url.replace('https://', '').split('.')[0]
        DATABASE_URL = f"postgresql://postgres.{project_ref}:{db_password}@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres"

REFRESH_INTERVAL = 10000

COLORS = {
    'bg_primary': '#0d1117', 'bg_secondary': '#161b22', 'bg_tertiary': '#21262d',
    'bg_card': '#1c2128', 'border': '#30363d', 'text_primary': '#e6edf3',
    'text_secondary': '#8b949e', 'text_muted': '#6e7681',
    'accent_blue': '#58a6ff', 'accent_purple': '#a371f7', 'accent_cyan': '#39d5ff',
    'success': '#3fb950', 'danger': '#f85149', 'warning': '#d29922',
    'chart_green': '#3fb950', 'chart_red': '#f85149', 'chart_purple': '#a371f7',
    'chart_cyan': '#39d5ff', 'chart_orange': '#db6d28', 'chart_yellow': '#d29922',
}

# ========================== Database Functions ==========================

def get_db_connection():
    if not DATABASE_URL:
        return None
    try:
        return psycopg2.connect(DATABASE_URL)
    except Exception as e:
        print(f"DB Error: {e}")
        return None

def execute_query(query: str, params: tuple = None, fetch: bool = True):
    conn = get_db_connection()
    if not conn:
        return [] if fetch else None
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute(query, params)
        if fetch:
            result = [dict(row) for row in cursor.fetchall()]
        else:
            conn.commit()
            result = None
        cursor.close()
        conn.close()
        return result
    except Exception as e:
        print(f"Query error: {e}")
        conn.close()
        return [] if fetch else None

def load_trades():
    rows = execute_query("SELECT * FROM trades ORDER BY signal_time DESC LIMIT 5000")
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows)
    for col in ['entry_price', 'tp_price', 'sl_price', 'lot_size', 'profit_loss', 'profit_loss_pips']:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce')
    for col in ['signal_time', 'execution_time', 'close_time']:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors='coerce')
    return df

def load_events(limit=500):
    rows = execute_query("SELECT * FROM events ORDER BY occurred_at DESC LIMIT %s", (limit,))
    return pd.DataFrame(rows) if rows else pd.DataFrame()

def load_blocked(limit=200):
    rows = execute_query("SELECT * FROM blocked_trades ORDER BY blocked_at DESC LIMIT %s", (limit,))
    return pd.DataFrame(rows) if rows else pd.DataFrame()

def load_channels():
    return execute_query("SELECT * FROM v_channel_configs") or []

def create_channel(config):
    conn = get_db_connection()
    if not conn:
        return None
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            INSERT INTO channels (channel_key, risk_per_trade, risk_tolerance, magic, max_slippage_points, trade_monitor_interval_sec, is_active)
            VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id
        """, (config['channel_key'], config.get('risk_per_trade', 0.02), config.get('risk_tolerance', 0.10),
              config.get('magic', 123456), config.get('max_slippage_points', 20), config.get('trade_monitor_interval_sec', 0.5), True))
        channel_id = cur.fetchone()['id']
        cur.execute("INSERT INTO instruments (channel_id, logical, broker_symbol) VALUES (%s, %s, %s)",
                   (channel_id, 'XAUUSD', 'XAUUSD'))
        cur.execute("INSERT INTO final_tp_policies (channel_id) VALUES (%s)", (channel_id,))
        cur.execute("INSERT INTO riskfree_policies (channel_id) VALUES (%s)", (channel_id,))
        cur.execute("INSERT INTO cancel_policies (channel_id) VALUES (%s)", (channel_id,))
        cur.execute("INSERT INTO command_settings (channel_id) VALUES (%s)", (channel_id,))
        cur.execute("INSERT INTO circuit_breaker_settings (channel_id) VALUES (%s)", (channel_id,))
        cur.execute("INSERT INTO trend_filter_settings (channel_id) VALUES (%s)", (channel_id,))
        conn.commit()
        cur.close()
        conn.close()
        return str(channel_id)
    except Exception as e:
        print(f"Create error: {e}")
        conn.rollback()
        conn.close()
        return None

def update_channel(channel_id, config):
    execute_query("""
        UPDATE channels SET channel_key=%s, risk_per_trade=%s, risk_tolerance=%s, magic=%s, 
        max_slippage_points=%s, trade_monitor_interval_sec=%s WHERE id=%s
    """, (config['channel_key'], config.get('risk_per_trade', 0.02), config.get('risk_tolerance', 0.10),
          config.get('magic', 123456), config.get('max_slippage_points', 20), 
          config.get('trade_monitor_interval_sec', 0.5), channel_id), fetch=False)
    return True

def delete_channel(channel_id):
    execute_query("DELETE FROM channels WHERE id = %s", (channel_id,), fetch=False)
    return True

def toggle_channel(channel_id, is_active):
    execute_query("UPDATE channels SET is_active = %s WHERE id = %s", (is_active, channel_id), fetch=False)

# ========================== Helper Functions ==========================

def apply_filters(df, start_date, end_date, channels):
    if df.empty:
        return df
    filtered = df.copy()
    if start_date and 'signal_time' in filtered.columns:
        filtered = filtered[filtered['signal_time'] >= pd.to_datetime(start_date)]
    if end_date and 'signal_time' in filtered.columns:
        filtered = filtered[filtered['signal_time'] <= pd.to_datetime(end_date) + timedelta(days=1)]
    if channels and 'channel_name' in filtered.columns:
        filtered = filtered[filtered['channel_name'].isin(channels)]
    return filtered

def get_chart_layout():
    return {
        'paper_bgcolor': COLORS['bg_card'], 'plot_bgcolor': COLORS['bg_card'],
        'font': {'color': COLORS['text_primary']}, 'margin': {'l': 50, 'r': 30, 't': 40, 'b': 40},
        'xaxis': {'gridcolor': COLORS['border']}, 'yaxis': {'gridcolor': COLORS['border']}
    }

def create_kpi_card(title, value, subtitle, color, icon):
    color_map = {"blue": COLORS['accent_blue'], "green": COLORS['success'], "red": COLORS['danger'],
                 "purple": COLORS['accent_purple'], "yellow": COLORS['warning'], "cyan": COLORS['accent_cyan']}
    accent = color_map.get(color, COLORS['accent_blue'])
    return html.Div([
        html.Div([html.Span(icon, style={'fontSize': '24px', 'marginRight': '12px'}),
                  html.Span(title, style={'color': COLORS['text_secondary'], 'fontSize': '14px'})],
                 style={'display': 'flex', 'alignItems': 'center', 'marginBottom': '8px'}),
        html.Div(value, style={'fontSize': '32px', 'fontWeight': '600', 'color': accent, 'marginBottom': '4px'}),
        html.Div(subtitle or "", style={'fontSize': '12px', 'color': COLORS['text_muted']})
    ], style={'backgroundColor': COLORS['bg_card'], 'borderRadius': '12px', 'padding': '20px',
              'border': f'1px solid {COLORS["border"]}'})

# ========================== Dash App ==========================

app = dash.Dash(__name__, external_stylesheets=[dbc.themes.DARKLY], suppress_callback_exceptions=True, title="Trading Dashboard")
server = app.server

app.layout = html.Div([
    # Header
    html.Div([
        html.H2("📈 Trading Bot Dashboard", style={'color': COLORS['text_primary'], 'margin': '0'}),
        html.Div([
            html.Span(id='last-update', style={'color': COLORS['text_muted'], 'marginRight': '20px'}),
            dbc.Button("🔄 Refresh", id='refresh-btn', color='primary', size='sm')
        ])
    ], style={'display': 'flex', 'justifyContent': 'space-between', 'alignItems': 'center',
              'padding': '20px 30px', 'backgroundColor': COLORS['bg_secondary'], 'borderBottom': f'1px solid {COLORS["border"]}'}),
    
    # Main Tabs
    dbc.Tabs([
        # Overview Tab
        dbc.Tab(label="📊 Overview", children=[
            html.Div([
                # Filters
                html.Div([
                    dbc.Row([
                        dbc.Col([dbc.Label("Date Range", style={'color': COLORS['text_secondary']}),
                                dcc.DatePickerRange(id='date-range', start_date=datetime.now().date() - timedelta(days=30),
                                                   end_date=datetime.now().date())], md=4),
                        dbc.Col([dbc.Label("Channels", style={'color': COLORS['text_secondary']}),
                                dcc.Dropdown(id='channel-filter', multi=True, placeholder="All Channels")], md=4),
                    ])
                ], style={'padding': '15px', 'backgroundColor': COLORS['bg_secondary'], 'borderRadius': '8px', 'marginBottom': '20px'}),
                
                html.Div(id='kpi-cards', style={'marginBottom': '20px'}),
                
                dbc.Row([
                    dbc.Col([html.Div([html.H6("Cumulative P&L", style={'color': COLORS['text_primary']}),
                                      dcc.Graph(id='pnl-chart', config={'displayModeBar': False})],
                                     style={'backgroundColor': COLORS['bg_card'], 'borderRadius': '12px', 'padding': '20px'})], md=8),
                    dbc.Col([html.Div([html.H6("Trade Outcomes", style={'color': COLORS['text_primary']}),
                                      dcc.Graph(id='outcome-pie', config={'displayModeBar': False})],
                                     style={'backgroundColor': COLORS['bg_card'], 'borderRadius': '12px', 'padding': '20px'})], md=4),
                ], className='mb-4'),
            ], style={'padding': '20px'})
        ]),
        
        # Trades Tab
        dbc.Tab(label="📋 Trades", children=[
            html.Div([
                dash_table.DataTable(id='trades-table',
                    columns=[{'name': c, 'id': c} for c in ['trade_id', 'channel_name', 'symbol', 'side', 'order_type',
                             'entry_price', 'sl_price', 'tp_price', 'lot_size', 'status', 'trade_outcome', 'profit_loss', 'signal_time']],
                    page_size=25, style_table={'overflowX': 'auto'},
                    style_header={'backgroundColor': COLORS['bg_tertiary'], 'color': COLORS['text_primary']},
                    style_cell={'backgroundColor': COLORS['bg_card'], 'color': COLORS['text_primary'], 'border': f'1px solid {COLORS["border"]}'},
                    style_data_conditional=[
                        {'if': {'filter_query': '{trade_outcome} = "profit"'}, 'color': COLORS['success']},
                        {'if': {'filter_query': '{trade_outcome} = "loss"'}, 'color': COLORS['danger']},
                    ],
                    filter_action='native', sort_action='native')
            ], style={'padding': '20px'})
        ]),
        
        # Events Tab
        dbc.Tab(label="📜 Events", children=[
            html.Div([
                html.H5("Recent Events", style={'color': COLORS['text_primary'], 'marginBottom': '15px'}),
                dash_table.DataTable(id='events-table',
                    columns=[{'name': c, 'id': c} for c in ['occurred_at', 'event_type', 'channel_name', 'trade_id', 'symbol', 'reason', 'severity']],
                    page_size=30, style_table={'overflowX': 'auto'},
                    style_header={'backgroundColor': COLORS['bg_tertiary'], 'color': COLORS['text_primary']},
                    style_cell={'backgroundColor': COLORS['bg_card'], 'color': COLORS['text_primary']},
                    filter_action='native', sort_action='native')
            ], style={'padding': '20px'})
        ]),
        
        # Blocked Tab
        dbc.Tab(label="🚫 Blocked", children=[
            html.Div([
                html.H5("Blocked Trades", style={'color': COLORS['text_primary'], 'marginBottom': '15px'}),
                dbc.Row([
                    dbc.Col([html.Div([dcc.Graph(id='block-reasons-chart', config={'displayModeBar': False})],
                                     style={'backgroundColor': COLORS['bg_card'], 'borderRadius': '12px', 'padding': '20px'})], md=6),
                ], className='mb-4'),
                dash_table.DataTable(id='blocked-table',
                    columns=[{'name': c, 'id': c} for c in ['blocked_at', 'channel_name', 'symbol', 'side', 'entry_price', 'block_reason']],
                    page_size=20, style_header={'backgroundColor': COLORS['bg_tertiary'], 'color': COLORS['text_primary']},
                    style_cell={'backgroundColor': COLORS['bg_card'], 'color': COLORS['text_primary']},
                    filter_action='native', sort_action='native')
            ], style={'padding': '20px'})
        ]),
        
        # Config Tab
        dbc.Tab(label="⚙️ Config", children=[
            html.Div([
                html.Div([html.H5("Channel Configurations", style={'color': COLORS['text_primary'], 'display': 'inline-block'}),
                         dbc.Button("➕ Add", id='add-channel-btn', color='success', size='sm', style={'float': 'right'})],
                        style={'marginBottom': '20px'}),
                dash_table.DataTable(id='channels-table',
                    columns=[{'name': c, 'id': c} for c in ['channel_key', 'risk_display', 'magic', 'rf_display', 'tf_display', 'active_display']],
                    page_size=10, style_header={'backgroundColor': COLORS['bg_tertiary'], 'color': COLORS['text_primary']},
                    style_cell={'backgroundColor': COLORS['bg_card'], 'color': COLORS['text_primary']},
                    row_selectable='single'),
                html.Div([
                    dbc.Button("✏️ Edit", id='edit-btn', color='primary', size='sm', className='me-2'),
                    dbc.Button("🗑️ Delete", id='delete-btn', color='danger', size='sm', className='me-2'),
                    dbc.Button("⏸️ Toggle", id='toggle-btn', color='warning', size='sm'),
                ], style={'marginTop': '15px'}),
                html.Div(id='config-feedback', style={'marginTop': '15px'})
            ], style={'padding': '20px'})
        ]),
    ], style={'backgroundColor': COLORS['bg_primary']}),
    
    # Data stores
    dcc.Store(id='trades-data'), dcc.Store(id='channels-data'), dcc.Store(id='events-data'), dcc.Store(id='blocked-data'),
    dcc.Interval(id='refresh-interval', interval=REFRESH_INTERVAL, n_intervals=0),
    
    # Config Modal
    dbc.Modal([
        dbc.ModalHeader(dbc.ModalTitle("Channel Configuration")),
        dbc.ModalBody([
            dbc.Row([
                dbc.Col([dbc.Label("Channel Key"), dbc.Input(id='cfg-channel-key', placeholder="e.g., Gold Signals")], md=6),
                dbc.Col([dbc.Label("Magic Number"), dbc.Input(id='cfg-magic', type='number', value=123456)], md=3),
                dbc.Col([dbc.Label("Risk %"), dbc.Input(id='cfg-risk', type='number', value=2, min=0.1, max=10, step=0.1)], md=3),
            ], className='mb-3'),
        ]),
        dbc.ModalFooter([dbc.Button("Cancel", id='cancel-modal', color='secondary'),
                        dbc.Button("Save", id='save-modal', color='primary')])
    ], id='config-modal', is_open=False),
    dcc.Store(id='edit-channel-id'),
], style={'backgroundColor': COLORS['bg_primary'], 'minHeight': '100vh'})

# ========================== Callbacks ==========================

@callback(
    [Output('trades-data', 'data'), Output('channels-data', 'data'), Output('events-data', 'data'),
     Output('blocked-data', 'data'), Output('last-update', 'children'), Output('channel-filter', 'options')],
    [Input('refresh-interval', 'n_intervals'), Input('refresh-btn', 'n_clicks')]
)
def refresh_data(n_intervals, n_clicks):
    trades_df = load_trades()
    events_df = load_events()
    blocked_df = load_blocked()
    channels = load_channels()
    channel_opts = [{'label': c, 'value': c} for c in trades_df['channel_name'].dropna().unique()] if not trades_df.empty else []
    return (trades_df.to_dict('records'), channels, events_df.to_dict('records'), blocked_df.to_dict('records'),
            f"Last: {datetime.now().strftime('%H:%M:%S')}", channel_opts)

@callback(Output('kpi-cards', 'children'), [Input('trades-data', 'data'), Input('date-range', 'start_date'),
          Input('date-range', 'end_date'), Input('channel-filter', 'value')])
def update_kpis(data, start, end, channels):
    if not data:
        return dbc.Row([dbc.Col(create_kpi_card("Total Trades", "0", "", "blue", "📈"), md=2) for _ in range(6)])
    df = apply_filters(pd.DataFrame(data), start, end, channels)
    total = len(df)
    closed = df[df['status'] == 'closed'] if 'status' in df.columns else pd.DataFrame()
    wins = len(closed[closed['trade_outcome'] == 'profit']) if not closed.empty else 0
    losses = len(closed[closed['trade_outcome'] == 'loss']) if not closed.empty else 0
    wr = (wins / len(closed) * 100) if len(closed) > 0 else 0
    pnl = closed['profit_loss'].sum() if 'profit_loss' in closed.columns else 0
    pips = closed['profit_loss_pips'].sum() if 'profit_loss_pips' in closed.columns else 0
    active = len(df[df['status'] == 'active']) if 'status' in df.columns else 0
    return dbc.Row([
        dbc.Col(create_kpi_card("Total Trades", str(total), f"{wins}W / {losses}L", "blue", "📈"), md=2),
        dbc.Col(create_kpi_card("Win Rate", f"{wr:.1f}%", f"{len(closed)} closed", "green", "🎯"), md=2),
        dbc.Col(create_kpi_card("Total P&L", f"${pnl:,.2f}", "", "green" if pnl >= 0 else "red", "💰"), md=2),
        dbc.Col(create_kpi_card("Total Pips", f"{pips:,.1f}", "", "purple", "📏"), md=2),
        dbc.Col(create_kpi_card("Active", str(active), "Open trades", "cyan", "🔴"), md=2),
    ])

@callback(Output('pnl-chart', 'figure'), [Input('trades-data', 'data'), Input('date-range', 'start_date'),
          Input('date-range', 'end_date'), Input('channel-filter', 'value')])
def update_pnl(data, start, end, channels):
    fig = go.Figure()
    fig.update_layout(**get_chart_layout())
    if not data:
        return fig
    df = apply_filters(pd.DataFrame(data), start, end, channels)
    closed = df[(df['status'] == 'closed') & (df['profit_loss'].notna())].copy()
    if closed.empty:
        return fig
    closed['close_time'] = pd.to_datetime(closed['close_time'])
    closed = closed.sort_values('close_time')
    closed['cum_pnl'] = closed['profit_loss'].cumsum()
    fig.add_trace(go.Scatter(x=closed['close_time'], y=closed['cum_pnl'], mode='lines+markers',
                            line=dict(color=COLORS['chart_cyan'], width=2), fill='tozeroy', fillcolor=f'{COLORS["chart_cyan"]}20'))
    return fig

@callback(Output('outcome-pie', 'figure'), [Input('trades-data', 'data'), Input('date-range', 'start_date'),
          Input('date-range', 'end_date'), Input('channel-filter', 'value')])
def update_pie(data, start, end, channels):
    fig = go.Figure()
    fig.update_layout(**get_chart_layout())
    if not data:
        return fig
    df = apply_filters(pd.DataFrame(data), start, end, channels)
    closed = df[df['status'] == 'closed']
    if closed.empty or 'trade_outcome' not in closed.columns:
        return fig
    counts = closed['trade_outcome'].value_counts()
    colors = {'profit': COLORS['chart_green'], 'loss': COLORS['chart_red'], 'breakeven': COLORS['chart_yellow']}
    fig.add_trace(go.Pie(labels=counts.index, values=counts.values, marker=dict(colors=[colors.get(o, '#888') for o in counts.index]),
                        hole=0.4, textinfo='label+percent'))
    return fig

@callback(Output('trades-table', 'data'), [Input('trades-data', 'data'), Input('date-range', 'start_date'),
          Input('date-range', 'end_date'), Input('channel-filter', 'value')])
def update_trades_table(data, start, end, channels):
    if not data:
        return []
    df = apply_filters(pd.DataFrame(data), start, end, channels)
    for col in ['signal_time', 'close_time']:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors='coerce').dt.strftime('%Y-%m-%d %H:%M')
    return df.to_dict('records')

@callback(Output('events-table', 'data'), Input('events-data', 'data'))
def update_events_table(data):
    if not data:
        return []
    df = pd.DataFrame(data)
    if 'occurred_at' in df.columns:
        df['occurred_at'] = pd.to_datetime(df['occurred_at'], errors='coerce').dt.strftime('%Y-%m-%d %H:%M:%S')
    return df.to_dict('records')

@callback([Output('blocked-table', 'data'), Output('block-reasons-chart', 'figure')], Input('blocked-data', 'data'))
def update_blocked(data):
    fig = go.Figure()
    fig.update_layout(**get_chart_layout())
    if not data:
        return [], fig
    df = pd.DataFrame(data)
    if 'blocked_at' in df.columns:
        df['blocked_at'] = pd.to_datetime(df['blocked_at'], errors='coerce').dt.strftime('%Y-%m-%d %H:%M')
    if 'block_reason' in df.columns:
        counts = df['block_reason'].value_counts()
        fig.add_trace(go.Bar(y=counts.index, x=counts.values, orientation='h', marker=dict(color=COLORS['chart_red'])))
    return df.to_dict('records'), fig

@callback(Output('channels-table', 'data'), Input('channels-data', 'data'))
def update_channels_table(data):
    if not data:
        return []
    return [{
        'channel_id': c.get('channel_id'), 'channel_key': c.get('channel_key', ''),
        'risk_display': f"{float(c.get('risk_per_trade', 0.02)) * 100:.1f}%", 'magic': c.get('magic', 123456),
        'rf_display': '✅' if c.get('riskfree_enabled') else '❌',
        'tf_display': '✅' if c.get('trend_filter_enabled') else '❌',
        'active_display': '🟢' if c.get('is_active') else '🔴', 'is_active': c.get('is_active', True)
    } for c in data]

@callback([Output('config-modal', 'is_open'), Output('cfg-channel-key', 'value'), Output('cfg-magic', 'value'),
           Output('cfg-risk', 'value'), Output('edit-channel-id', 'data')],
          [Input('add-channel-btn', 'n_clicks'), Input('edit-btn', 'n_clicks'), Input('cancel-modal', 'n_clicks'), Input('save-modal', 'n_clicks')],
          [State('channels-table', 'data'), State('channels-table', 'selected_rows'), State('config-modal', 'is_open')])
def toggle_modal(add, edit, cancel, save, data, selected, is_open):
    triggered = ctx.triggered_id
    if triggered in ['cancel-modal', 'save-modal']:
        return False, '', 123456, 2, None
    if triggered == 'add-channel-btn':
        return True, '', 123456, 2, None
    if triggered == 'edit-btn' and selected and data:
        c = data[selected[0]]
        return True, c.get('channel_key', ''), c.get('magic', 123456), float(c.get('risk_display', '2%').replace('%', '')), c.get('channel_id')
    return is_open, '', 123456, 2, None

@callback(Output('config-feedback', 'children'), Input('save-modal', 'n_clicks'),
          [State('edit-channel-id', 'data'), State('cfg-channel-key', 'value'), State('cfg-magic', 'value'), State('cfg-risk', 'value')],
          prevent_initial_call=True)
def save_config(n, channel_id, key, magic, risk):
    if not key:
        return dbc.Alert("Channel key required", color="danger")
    config = {'channel_key': key, 'magic': int(magic) if magic else 123456, 'risk_per_trade': float(risk) / 100 if risk else 0.02}
    if channel_id:
        update_channel(channel_id, config)
        return dbc.Alert("Updated!", color="success")
    else:
        create_channel(config)
        return dbc.Alert("Created!", color="success")

@callback(Output('config-feedback', 'children', allow_duplicate=True), Input('delete-btn', 'n_clicks'),
          [State('channels-table', 'data'), State('channels-table', 'selected_rows')], prevent_initial_call=True)
def delete_config(n, data, selected):
    if selected and data:
        delete_channel(data[selected[0]].get('channel_id'))
        return dbc.Alert("Deleted!", color="info")
    return ""

@callback(Output('config-feedback', 'children', allow_duplicate=True), Input('toggle-btn', 'n_clicks'),
          [State('channels-table', 'data'), State('channels-table', 'selected_rows')], prevent_initial_call=True)
def toggle_config(n, data, selected):
    if selected and data:
        c = data[selected[0]]
        toggle_channel(c.get('channel_id'), not c.get('is_active', True))
        return dbc.Alert("Toggled!", color="info")
    return ""

# ========================== Run ==========================

if __name__ == '__main__':
    port = int(os.getenv('PORT', 8050))
    debug = os.getenv('DEBUG', 'False').lower() == 'true'
    print(f"🚀 Dashboard starting on port {port}...")
    app.run_server(debug=debug, host='0.0.0.0', port=port)
