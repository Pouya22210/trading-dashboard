import React, { createContext, useContext, useState, useEffect } from 'react'

// Simple auth context for protecting admin sections
const AuthContext = createContext(null)

// You can change this password or move it to environment variables
// For production, consider using Supabase Auth instead
const ADMIN_PASSWORD = 'pouya'  // CHANGE THIS!

// Session duration in milliseconds (24 hours)
const SESSION_DURATION = 24 * 60 * 60 * 1000

export function AuthProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Check for existing session on mount
  useEffect(() => {
    const session = localStorage.getItem('admin_session')
    if (session) {
      try {
        const { expiry } = JSON.parse(session)
        if (expiry && Date.now() < expiry) {
          setIsAuthenticated(true)
        } else {
          // Session expired
          localStorage.removeItem('admin_session')
        }
      } catch {
        localStorage.removeItem('admin_session')
      }
    }
    setIsLoading(false)
  }, [])

  const login = (password) => {
    if (password === ADMIN_PASSWORD) {
      const session = {
        expiry: Date.now() + SESSION_DURATION,
        timestamp: Date.now()
      }
      localStorage.setItem('admin_session', JSON.stringify(session))
      setIsAuthenticated(true)
      return { success: true }
    }
    return { success: false, error: 'Invalid password' }
  }

  const logout = () => {
    localStorage.removeItem('admin_session')
    setIsAuthenticated(false)
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export default AuthContext
