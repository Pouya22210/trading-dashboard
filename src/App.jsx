import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './components/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Navbar from './components/Navbar'
import Dashboard from './pages/Dashboard'
import Trades from './pages/Trades'
import Channels from './pages/Channels'
import Backtest from './pages/Backtest'
import { recordSiteVisit } from './lib/supabase'

export default function App() {
  useEffect(() => {
    console.log('[site_visits] App mounted — calling recordSiteVisit()')
    recordSiteVisit()
  }, [])

  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-dark-primary">
          <Navbar />

          <main>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/trades" element={<Trades />} />
              <Route 
                path="/channels" 
                element={
                  <ProtectedRoute title="Channel Configuration">
                    <Channels />
                  </ProtectedRoute>
                } 
              />
              <Route path="/backtest" element={<Backtest />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AuthProvider>
  )
}
