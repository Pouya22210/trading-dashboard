import React, { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Zap, Clock, Menu, X } from 'lucide-react'

export default function Navbar() {
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString())

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const tabs = [
    { path: '/', label: 'Dashboard' },
    { path: '/trades', label: 'Trades & Analysis' },
    { path: '/channels', label: 'Channels' },
  ]

  const handleNavClick = () => {
    setMobileMenuOpen(false)
  }

  return (
    <>
      <nav className="bg-dark-secondary border-b border-dark-border sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">

            {/* Logo */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-dark-tertiary to-dark-secondary border border-dark-border flex items-center justify-center">
                <Zap className="w-5 h-5 text-accent-cyan" />
              </div>
              <div className="text-sm sm:text-base font-bold text-white tracking-tight">
                Trading Analytics
              </div>
            </div>

            {/* Desktop Tabs */}
            <div className="hidden lg:flex tab-nav">
              {tabs.map(tab => (
                <Link
                  key={tab.path}
                  to={tab.path}
                  className={`tab-btn ${location.pathname === tab.path ? 'active' : ''}`}
                >
                  {tab.label}
                </Link>
              ))}
            </div>

            {/* Right Side */}
            <div className="flex items-center gap-2 flex-shrink-0">

              {/* LIVE badge – desktop only */}
              <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-green-500/10">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                <span className="text-xs font-bold text-green-500 tracking-wider">
                  LIVE
                </span>
              </div>

              {/* Clock – desktop only */}
              <div className="hidden lg:flex items-center gap-2 text-gray-500">
                <Clock className="w-4 h-4" />
                <span className="font-mono text-xs">{currentTime}</span>
              </div>

              {/* Mobile Menu Button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 bg-dark-tertiary border border-dark-border rounded-lg"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? (
                  <X className="w-5 h-5 text-white" />
                ) : (
                  <Menu className="w-5 h-5 text-white" />
                )}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 z-40"
          style={{ top: '64px' }}
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Slide Menu */}
      <div
        className={`
          lg:hidden fixed right-0 w-full sm:w-80 bg-dark-secondary
          border-l border-dark-border shadow-2xl z-50
          transform transition-transform duration-300 ease-in-out
          ${mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
        style={{
          top: '64px',
          height: 'calc(100vh - 64px)',
        }}
      >
        <div className="p-6 space-y-2">
          {tabs.map(tab => (
            <Link
              key={tab.path}
              to={tab.path}
              onClick={handleNavClick}
              className={`
                block px-4 py-3.5 rounded-lg text-base font-medium
                ${location.pathname === tab.path
                  ? 'bg-gradient-to-r from-accent-blue to-accent-cyan text-dark-primary'
                  : 'text-gray-300 hover:bg-dark-tertiary hover:text-white'}
              `}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
