import React, { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Zap, Clock, Menu, X } from 'lucide-react'

export default function Navbar() {
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString())

  // Update time every second
  React.useEffect(() => {
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
      <nav className="bg-dark-secondary border-b border-dark-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            {/* Logo - Always visible */}
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-dark-tertiary to-dark-secondary border border-dark-border flex items-center justify-center flex-shrink-0">
                <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-accent-cyan" />
              </div>
              <div className="min-w-0">
                <div className="text-base sm:text-lg font-bold text-white tracking-tight truncate">Trading Analytics</div>
                <div className="text-xs text-gray-500 uppercase tracking-wider hidden sm:block">Real-time Dashboard</div>
              </div>
            </div>

            {/* Desktop Tabs - Hidden on mobile */}
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

            {/* Right side - Status and Menu */}
            <div className="flex items-center gap-2 sm:gap-5">
              {/* Live Status - Responsive */}
              <div className="flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-full bg-green-500/10">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                <span className="text-xs font-bold text-green-500 tracking-wider">LIVE</span>
              </div>

              {/* Clock - Hidden on small mobile */}
              <div className="hidden sm:flex items-center gap-2 text-gray-500">
                <Clock className="w-3 h-3" />
                <span className="font-mono text-xs">{currentTime}</span>
              </div>

              {/* Mobile Menu Button - Only visible on mobile */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 bg-dark-tertiary border border-dark-border rounded-lg hover:bg-dark-border transition-colors"
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

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Slide-out Menu */}
      <div className={`
        lg:hidden fixed top-[73px] right-0 h-[calc(100vh-73px)] w-64
        bg-dark-secondary border-l border-dark-border
        transform transition-transform duration-300 ease-in-out z-40
        ${mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'}
      `}>
        <div className="p-4">
          {/* Time on mobile menu */}
          <div className="flex items-center gap-2 text-gray-400 mb-6 pb-4 border-b border-dark-border">
            <Clock className="w-4 h-4" />
            <span className="font-mono text-sm">{currentTime}</span>
          </div>

          {/* Navigation Links */}
          <div className="space-y-2">
            {tabs.map(tab => (
              <Link
                key={tab.path}
                to={tab.path}
                onClick={handleNavClick}
                className={`
                  block px-4 py-3 rounded-lg text-sm font-medium transition-all
                  ${location.pathname === tab.path 
                    ? 'bg-gradient-to-r from-accent-blue to-accent-cyan text-dark-primary' 
                    : 'text-gray-300 hover:bg-dark-tertiary hover:text-white'
                  }
                `}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
