import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Zap, Clock } from 'lucide-react'

export default function Navbar() {
  const location = useLocation()
  const currentTime = new Date().toLocaleTimeString()

  const tabs = [
    { path: '/', label: 'Dashboard' },
    { path: '/trades', label: 'Trades & Analysis' },
    { path: '/channels', label: 'Channels' },
  ]

  return (
    <nav className="bg-dark-secondary border-b border-dark-border sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-dark-tertiary to-dark-secondary border border-dark-border flex items-center justify-center">
              <Zap className="w-6 h-6 text-accent-cyan" />
            </div>
            <div>
              <div className="text-lg font-bold text-white tracking-tight">Trading Analytics</div>
              <div className="text-xs text-gray-500 uppercase tracking-wider">Real-time Dashboard</div>
            </div>
          </div>

          {/* Tabs */}
          <div className="tab-nav">
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

          {/* Status */}
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              <span className="text-xs font-bold text-green-500 tracking-wider">LIVE</span>
            </div>
            <div className="flex items-center gap-2 text-gray-500">
              <Clock className="w-3 h-3" />
              <span className="font-mono text-xs">{currentTime}</span>
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}
