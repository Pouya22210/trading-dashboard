import React from 'react'
import { LogOut } from 'lucide-react'
import { useAuth } from './AuthContext'

export default function LogoutButton({ className = '' }) {
  const { logout, isAuthenticated } = useAuth()

  if (!isAuthenticated) return null

  return (
    <button
      onClick={logout}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-dark-tertiary transition-all ${className}`}
      title="Logout"
    >
      <LogOut className="w-4 h-4" />
      <span>Logout</span>
    </button>
  )
}
