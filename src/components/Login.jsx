import React, { useState } from 'react'
import { Lock, Eye, EyeOff, AlertCircle, Shield } from 'lucide-react'

export default function Login({ onLogin, title = "Admin Access Required" }) {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    // Small delay for UX
    await new Promise(resolve => setTimeout(resolve, 300))

    const result = onLogin(password)
    
    if (!result.success) {
      setError(result.error || 'Authentication failed')
      setPassword('')
    }
    
    setIsLoading(false)
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{ background: 'rgba(48,209,88,0.10)', border: '1px solid rgba(48,209,88,0.25)' }}>
            <Shield className="w-8 h-8" style={{ color: '#30D158' }} />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">{title}</h1>
          <p className="text-gray-400 text-sm">
            Enter your admin password to access this section
          </p>
        </div>

        {/* Login Card */}
        <div className="rounded-xl p-6" style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Password Field */}
            <div>
              <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                <Lock className="w-3 h-3" style={{ color: '#30D158' }} />
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter admin password"
                  className="w-full pr-10"
                  autoFocus
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!password || isLoading}
              style={!password || isLoading
                ? { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.25)', cursor: 'not-allowed', borderRadius: '10px', padding: '12px 16px', fontWeight: '600', fontSize: '14px', border: 'none', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }
                : { background: '#30D158', color: '#000000', cursor: 'pointer', borderRadius: '10px', padding: '12px 16px', fontWeight: '600', fontSize: '14px', border: 'none', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s' }
              }
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-dark-primary/30 border-t-dark-primary rounded-full animate-spin" />
                  Authenticating...
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  Unlock Access
                </>
              )}
            </button>
          </form>

          {/* Footer hint */}
          <p className="text-center text-gray-600 text-xs mt-4">
            Session expires after 24 hours
          </p>
        </div>
      </div>
    </div>
  )
}
