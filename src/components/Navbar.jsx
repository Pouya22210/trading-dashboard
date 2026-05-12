import React, { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Sparkles, Clock, Menu, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function Navbar() {
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
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

  return (
    <>
      <nav style={{
        background: 'var(--neu-bg)',
        boxShadow: '0 6px 18px rgba(0,0,0,0.35), inset 0 -1px 0 rgba(255,255,255,0.025)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div className="max-w-7xl mx-auto px-4" style={{ paddingLeft: '1rem', paddingRight: '1rem' }}>
          <div className="flex items-center justify-between" style={{ height: '68px' }}>

            {/* Logo */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '14px',
                background: 'var(--neu-bg)',
                boxShadow: 'var(--neu-raised-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Sparkles style={{ width: '17px', height: '17px', color: '#ADFF2F' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{
                  fontSize: '15px',
                  fontWeight: '600',
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.02em',
                  lineHeight: '1.2',
                }}>
                  Trading Dashboard
                </span>
                <span style={{
                  fontSize: '11px',
                  color: 'rgba(232,234,239,0.40)',
                  letterSpacing: '0',
                  lineHeight: '1.2',
                }}>
                  Track your trading performance with real-time insights
                </span>
              </div>
            </div>

            {/* Desktop Tabs */}
            <div className="hidden lg:flex tab-nav">
              {tabs.map(tab => (
                <Link
                  key={tab.path}
                  to={tab.path}
                  className={`tab-btn ${location.pathname === tab.path ? 'active' : ''}`}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {tab.label}
                  {tab.showCount && channelCount !== null && (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: '20px',
                      height: '20px',
                      padding: '0 6px',
                      borderRadius: '10px',
                      fontSize: '10px',
                      fontWeight: '700',
                      background: 'var(--neu-bg)',
                      color: '#ADFF2F',
                      boxShadow: location.pathname === tab.path
                        ? 'var(--neu-pressed-sm)'
                        : 'var(--neu-raised-sm)',
                    }}>
                      {channelCount}
                    </span>
                  )}
                </Link>
              ))}
            </div>

            {/* Right Side */}
            <div className="flex items-center gap-3 flex-shrink-0">

              {/* LIVE badge */}
              <div className="hidden lg:flex items-center gap-2" style={{
                padding: '6px 14px',
                borderRadius: '20px',
                background: 'var(--neu-bg)',
                boxShadow: 'var(--neu-raised-sm)',
              }}>
                <span style={{
                  width: '6px', height: '6px',
                  borderRadius: '50%',
                  background: '#ADFF2F',
                  display: 'inline-block',
                  boxShadow: '0 0 8px rgba(173,255,47,0.6)',
                  animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite',
                }} />
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#ADFF2F', letterSpacing: '0.06em' }}>
                  LIVE
                </span>
              </div>

              {/* Clock */}
              <div className="hidden lg:flex items-center gap-2" style={{
                color: 'rgba(232,234,239,0.50)',
                padding: '6px 12px',
                borderRadius: '14px',
                background: 'var(--neu-bg)',
                boxShadow: 'var(--neu-pressed-sm)',
              }}>
                <Clock style={{ width: '13px', height: '13px' }} />
                <span className="font-mono" style={{ fontSize: '12px' }}>{currentTime}</span>
              </div>

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
          style={{ top: '68px', background: 'rgba(15,17,21,0.7)', backdropFilter: 'blur(6px)', zIndex: 40 }}
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Slide Menu */}
      <div
        className="lg:hidden fixed right-0"
        style={{
          top: '68px',
          height: 'calc(100vh - 68px)',
          width: '280px',
          background: 'var(--neu-bg)',
          boxShadow: '-8px 0 18px rgba(0,0,0,0.5)',
          zIndex: 50,
          transform: mobileMenuOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {tabs.map(tab => (
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
                fontWeight: location.pathname === tab.path ? '600' : '400',
                color: location.pathname === tab.path ? '#ADFF2F' : 'rgba(232,234,239,0.72)',
                background: 'var(--neu-bg)',
                boxShadow: location.pathname === tab.path
                  ? 'var(--neu-raised-sm)'
                  : 'var(--neu-pressed-sm)',
                textDecoration: 'none',
                transition: 'all 0.2s',
              }}
            >
              {tab.label}
              {tab.showCount && channelCount !== null && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: '22px',
                  height: '22px',
                  padding: '0 7px',
                  borderRadius: '11px',
                  fontSize: '11px',
                  fontWeight: '700',
                  background: 'var(--neu-bg)',
                  color: '#ADFF2F',
                  boxShadow: 'var(--neu-pressed-sm)',
                }}>
                  {channelCount}
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
