import React, { useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Dashboard from './pages/Dashboard'
import Trades from './pages/Trades'
import Channels from './pages/Channels'

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard')

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-dark-primary">
        <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
        
        <main>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/trades" element={<Trades />} />
            <Route path="/channels" element={<Channels />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
