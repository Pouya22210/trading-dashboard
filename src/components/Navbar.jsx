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
      <nav className="bg-dark-secondary border-b border-dark-border sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-18">
            {/* Logo */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <div className="w-9 h-9 sm:w-10 sm:h-10 lg:w-11 lg:h-11 rounded-xl bg-gradient-to-br from-dark-tertiary to-dark-secondary border border-dark-border flex items-center justify-center">
                <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-accent-cyan" />
              </div>
              <div className="min-w-0">
                <div className="text-sm sm:text-base lg:text-lg font-bold text-white tracking-tight">
                  Trading Analytics
                </div>
                <div className="text-xs text-gray-500 uppercase tracking-wider hidden sm:block">
                  Real-time Dashboard
                </div>
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

            {/* Right side */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              {/* Live Status */}
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-green-500/10">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                <span className="text-xs font-bold text-green-500 tracking-wider">LIVE</span>
              </div>

              {/* Clock - Hidden on mobile */}
              <div className="hidden sm:flex items-center gap-2 text-gray-500">
                <Clock className="w-4 h-4" />
                <span className="font-mono text-xs">{currentTime}</span>
              </div>

              {/* Mobile Menu Button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 bg-dark-tertiary border border-dark-border rounded-lg hover:bg-dark-border transition-colors"
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

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/60 z-40"
          onClick={() => setMobileMenuOpen(false)}
          style={{ top: '64px' }}
        />
      )}

      {/* Mobile Slide-out Menu */}
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
          maxHeight: 'calc(100vh - 64px)'
        }}
      >
        <div className="h-full overflow-y-auto">
          <div className="p-4 sm:p-6">
            {/* Time on mobile menu */}
            <div className="flex items-center gap-2 text-gray-400 mb-6 pb-4 border-b border-dark-border">
              <Clock className="w-4 h-4" />
              <span className="font-mono text-sm">{currentTime}</span>
              <span className="ml-auto text-xs text-gray-600">
                {new Date().toLocaleDateString()}
              </span>
            </div>

            {/* Navigation Links */}
            <div className="space-y-2">
              {tabs.map(tab => (
                <Link
                  key={tab.path}
                  to={tab.path}
                  onClick={handleNavClick}
                  className={`
                    block px-4 py-3.5 rounded-lg text-base font-medium 
                    transition-all touch-manipulation
                    ${location.pathname === tab.path 
                      ? 'bg-gradient-to-r from-accent-blue to-accent-cyan text-dark-primary shadow-lg' 
                      : 'text-gray-300 hover:bg-dark-tertiary hover:text-white active:bg-dark-border'
                    }
                  `}
                >
                  {tab.label}
                </Link>
              ))}
            </div>

            {/* Additional info section */}
            <div className="mt-8 pt-6 border-t border-dark-border">
              <div className="flex items-center gap-2 text-gray-500 text-xs">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                <span>System Online</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
