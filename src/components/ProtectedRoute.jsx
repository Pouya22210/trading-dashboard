import React from 'react'
import { useAuth } from './AuthContext'
import Login from './Login'

/**
 * ProtectedRoute - Wraps components that require authentication
 * 
 * Usage:
 *   <ProtectedRoute title="Channel Settings">
 *     <Channels />
 *   </ProtectedRoute>
 */
export default function ProtectedRoute({ children, title = "Admin Access Required" }) {
  const { isAuthenticated, isLoading, login } = useAuth()

  // Show loading state while checking session
  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-400">
          <span className="w-5 h-5 border-2 border-gray-600 border-t-accent-cyan rounded-full animate-spin" />
          <span>Checking authentication...</span>
        </div>
      </div>
    )
  }

  // Show login if not authenticated
  if (!isAuthenticated) {
    return <Login onLogin={login} title={title} />
  }

  // Render protected content
  return children
}
