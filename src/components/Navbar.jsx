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
        background: 'rgba(23, 23, 23, 0.90)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        <div className="max-w-7xl mx-auto px-4" style={{ paddingLeft: '1rem', paddingRight: '1rem' }}>
          <div className="flex items-center justify-between" style={{ height: '60px' }}>

            {/* Logo */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <div style={{
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                background: 'rgba(173, 255, 47, 0.15)',
                border: '1px solid rgba(173, 255, 47, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Sparkles style={{ width: '16px', height: '16px', color: '#ADFF2F' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{
                  fontSize: '15px',
                  fontWeight: '600',
                  color: '#ffffff',
                  letterSpacing: '-0.02em',
                  lineHeight: '1.2',
                }}>
                  Trading Dashboard
                </span>
                <span style={{
                  fontSize: '11px',
                  color: 'rgba(255,255,255,0.35)',
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
                      minWidth: '18px',
                      height: '18px',
                      padding: '0 5px',
                      borderRadius: '9px',
                      fontSize: '10px',
                      fontWeight: '700',
                      background: location.pathname === tab.path ? 'rgba(0,0,0,0.25)' : 'rgba(173,255,47,0.15)',
                      color: location.pathname === tab.path ? 'inherit' : '#ADFF2F',
                      border: location.pathname === tab.path ? '1px solid rgba(0,0,0,0.2)' : '1px solid rgba(173,255,47,0.3)',
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
                padding: '5px 12px',
                borderRadius: '20px',
                background: 'rgba(173, 255, 47, 0.08)',
                border: '1px solid rgba(173, 255, 47, 0.20)',
              }}>
                <span style={{
                  width: '6px', height: '6px',
                  borderRadius: '50%',
                  background: '#ADFF2F',
                  display: 'inline-block',
                  animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite',
                }} />
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#ADFF2F', letterSpacing: '0.06em' }}>
                  LIVE
                </span>
              </div>

              {/* Clock */}
              <div className="hidden lg:flex items-center gap-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
                <Clock style={{ width: '13px', height: '13px' }} />
                <span className="font-mono" style={{ fontSize: '12px' }}>{currentTime}</span>
              </div>

              {/* Mobile Menu Button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden"
                style={{
                  padding: '8px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
                aria-label="Toggle menu"
              >
                {mobileMenuOpen
                  ? <X style={{ width: '18px', height: '18px', color: 'white' }} />
                  : <Menu style={{ width: '18px', height: '18px', color: 'white' }} />
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
          style={{ top: '60px', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 40 }}
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Slide Menu */}
      <div
        className="lg:hidden fixed right-0"
        style={{
          top: '60px',
          height: 'calc(100vh - 60px)',
          width: '280px',
          background: 'rgba(23,23,23,0.97)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          zIndex: 50,
          transform: mobileMenuOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {tabs.map(tab => (
            <Link
              key={tab.path}
              to={tab.path}
              onClick={handleNavClick}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 16px',
                borderRadius: '10px',
                fontSize: '15px',
                fontWeight: location.pathname === tab.path ? '600' : '400',
                color: location.pathname === tab.path ? '#000000' : 'rgba(255,255,255,0.7)',
                background: location.pathname === tab.path ? '#ADFF2F' : 'rgba(255,255,255,0.04)',
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
                  minWidth: '20px',
                  height: '20px',
                  padding: '0 6px',
                  borderRadius: '10px',
                  fontSize: '11px',
                  fontWeight: '700',
                  background: location.pathname === tab.path ? 'rgba(0,0,0,0.2)' : 'rgba(173,255,47,0.15)',
                  color: location.pathname === tab.path ? '#000000' : '#ADFF2F',
                  border: location.pathname === tab.path ? '1px solid rgba(0,0,0,0.15)' : '1px solid rgba(173,255,47,0.3)',
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
