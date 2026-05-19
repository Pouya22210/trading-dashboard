import React, { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Sparkles, Clock, Menu, X, Moon, Sun, History } from 'lucide-react'
import { supabase } from '../lib/supabase'
import ActivityLogPanel from './ActivityLogPanel'

export default function Navbar({ theme, toggleTheme }) {
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activityLogOpen, setActivityLogOpen] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString())
  const [channelCount, setChannelCount] = useState(null)

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    async function loadChannelCount() {
      try {
        const { count } = await supabase.from('channels').select('*', { count: 'exact', head: true })
        setChannelCount(count ?? 0)
      } catch {
        // silently ignore
      }
    }
    loadChannelCount()

    const subscription = supabase
      .channel('navbar-channels')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channels' }, () => {
        loadChannelCount()
      })
      .subscribe()

    return () => supabase.removeChannel(subscription)
  }, [])

  const tabs = [
    { path: '/', label: 'Dashboard' },
    { path: '/trades', label: 'Trades & Analysis' },
    { path: '/channels', label: 'Channels', showCount: true },
    { path: '/backtest', label: 'Back Test' },
  ]

  const handleNavClick = () => setMobileMenuOpen(false)
  const isLight = theme === 'light'

  return (
    <>
      <nav style={{
        background: 'var(--neu-bg)',
        boxShadow: isLight
          ? '0 6px 18px rgba(145,160,191,0.18)'
          : '0 6px 18px rgba(0,0,0,0.35), inset 0 -1px 0 rgba(255,255,255,0.025)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:max-w-[1600px] lg:px-8">
          <div className="flex items-center justify-between gap-4" style={{ height: '68px' }}>

            {/* Logo — links to dashboard */}
            <Link
              to="/"
              aria-label="Go to dashboard"
              className="flex items-center gap-3 min-w-0 flex-1 lg:flex-none"
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '14px',
                background: 'var(--neu-bg)',
                boxShadow: 'var(--neu-raised-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Sparkles style={{ width: '17px', height: '17px', color: 'var(--accent-green)' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{
                  fontSize: '15px',
                  fontWeight: '600',
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.02em',
                  lineHeight: '1.2',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  Trading Dashboard
                </span>
                <span
                  className="hidden sm:block"
                  style={{
                    fontSize: '11px',
                    color: 'var(--text-tertiary)',
                    letterSpacing: '0',
                    lineHeight: '1.2',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  Track your trading performance with real-time insights
                </span>
              </div>
            </Link>

            {/* Desktop Tabs — centered */}
            <div className="hidden lg:flex flex-1 justify-center" style={{ gap: '10px', alignItems: 'center' }}>
              {tabs.map(tab => {
                const isActive = location.pathname === tab.path
                return (
                  <Link
                    key={tab.path}
                    to={tab.path}
                    className={`tab-btn ${isActive ? 'active' : ''}`}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    {tab.label}
                    {tab.showCount && channelCount !== null && (
                      <span style={{
                        fontSize: '11px',
                        fontWeight: '600',
                        color: 'var(--accent-green)',
                        opacity: 0.85,
                      }}>
                        ({channelCount})
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>

            {/* Right Side */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* LIVE badge - flat */}
              <div className="hidden lg:flex items-center gap-2" style={{
                padding: '6px 12px',
                color: 'var(--accent-green)',
                background: 'transparent',
                boxShadow: 'none',
                border: 'none',
              }}>
                <span style={{
                  width: '6px', height: '6px',
                  borderRadius: '50%',
                  background: 'var(--accent-green)',
                  display: 'inline-block',
                }} />
                <span style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '0.06em' }}>
                  LIVE
                </span>
              </div>

              {/* Clock - flat */}
              <div className="hidden lg:flex items-center gap-2" style={{
                color: 'var(--text-secondary)',
                padding: '6px 12px',
                background: 'transparent',
                boxShadow: 'none',
                border: 'none',
              }}>
                <Clock style={{ width: '13px', height: '13px' }} />
                <span className="font-mono" style={{ fontSize: '12px' }}>{currentTime}</span>
              </div>

              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                aria-label="Toggle theme"
                title={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
                style={{
                  width: '40px',
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '12px',
                  background: 'var(--neu-bg)',
                  border: 'none',
                  boxShadow: 'var(--neu-raised-sm)',
                  color: isLight ? '#f59e0b' : 'var(--accent-green)',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.18s ease, color 0.18s ease',
                }}
              >
                {isLight
                  ? <Sun style={{ width: '18px', height: '18px' }} />
                  : <Moon style={{ width: '18px', height: '18px' }} />}
              </button>

              {/* Activity Log Toggle */}
              <button
                onClick={() => setActivityLogOpen(!activityLogOpen)}
                aria-label="Toggle activity log"
                title="Activity log"
                style={{
                  width: '40px',
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '12px',
                  background: 'var(--neu-bg)',
                  border: 'none',
                  boxShadow: activityLogOpen ? 'var(--neu-pressed-sm)' : 'var(--neu-raised-sm)',
                  color: 'var(--purple)',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.18s ease, color 0.18s ease',
                }}
              >
                <History style={{ width: '18px', height: '18px' }} />
              </button>

              {/* Mobile Menu Button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden"
                style={{
                  padding: '10px',
                  background: 'var(--neu-bg)',
                  border: 'none',
                  borderRadius: '12px',
                  boxShadow: mobileMenuOpen ? 'var(--neu-pressed-sm)' : 'var(--neu-raised-sm)',
                  cursor: 'pointer',
                }}
                aria-label="Toggle menu"
              >
                {mobileMenuOpen
                  ? <X style={{ width: '18px', height: '18px', color: 'var(--text-primary)' }} />
                  : <Menu style={{ width: '18px', height: '18px', color: 'var(--text-primary)' }} />
                }
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0"
          style={{
            top: '68px',
            background: isLight ? 'rgba(120,135,160,0.35)' : 'rgba(15,17,21,0.7)',
            backdropFilter: 'blur(6px)',
            zIndex: 40,
          }}
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Activity Log Overlay */}
      {activityLogOpen && (
        <div
          className="fixed inset-0"
          style={{
            top: '68px',
            background: isLight ? 'rgba(120,135,160,0.35)' : 'rgba(15,17,21,0.7)',
            backdropFilter: 'blur(6px)',
            zIndex: 45,
          }}
          onClick={() => setActivityLogOpen(false)}
        />
      )}

      {/* Activity Log Slide Panel */}
      <div
        className="fixed right-0"
        style={{
          top: '68px',
          height: 'calc(100vh - 68px)',
          width: 'min(420px, 92vw)',
          background: 'var(--neu-bg)',
          boxShadow: isLight
            ? '-8px 0 18px rgba(145,160,191,0.25)'
            : '-8px 0 18px rgba(0,0,0,0.5)',
          zIndex: 55,
          transform: activityLogOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
          overflowY: 'auto',
        }}
      >
        <ActivityLogPanel />
      </div>

      {/* Mobile Slide Menu */}
      <div
        className="lg:hidden fixed right-0"
        style={{
          top: '68px',
          height: 'calc(100vh - 68px)',
          width: '280px',
          background: 'var(--neu-bg)',
          boxShadow: isLight
            ? '-8px 0 18px rgba(145,160,191,0.25)'
            : '-8px 0 18px rgba(0,0,0,0.5)',
          zIndex: 50,
          transform: mobileMenuOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {tabs.map(tab => {
            const isActive = location.pathname === tab.path
            return (
              <Link
                key={tab.path}
                to={tab.path}
                onClick={handleNavClick}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '14px 18px',
                  borderRadius: '14px',
                  fontSize: '15px',
                  fontWeight: isActive ? '600' : '400',
                  color: isActive ? 'var(--accent-green)' : 'var(--text-secondary)',
                  background: isActive ? 'var(--neu-bg)' : 'transparent',
                  boxShadow: isActive ? 'var(--neu-raised-sm)' : 'none',
                  textDecoration: 'none',
                  transition: 'all 0.2s',
                }}
              >
                {tab.label}
                {tab.showCount && channelCount !== null && (
                  <span style={{
                    fontSize: '12px',
                    fontWeight: '600',
                    color: 'var(--accent-green)',
                    opacity: 0.85,
                  }}>
                    ({channelCount})
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      </div>
    </>
  )
}
