import { useState } from 'react'
import '../styles/LoginPage.css'

function LoginPage({ onLoginSuccess }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleLogin = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      if (!response.ok) {
        throw new Error('Login failed')
      }

      const user = await response.json()
      onLoginSuccess(user)
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.')
      console.error('Login error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSlackLogin = async () => {
    // TODO: Step 2 - Implement Slack OAuth
    console.log('Slack OAuth coming in Step 2')
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-box">
          <div className="login-logo">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="white">
              <polygon points="7,1 13,4 13,10 7,13 1,10 1,4"/>
            </svg>
          </div>

          <h1>Doc Pilot</h1>
          <p className="subtitle">Help Center documentation automation</p>

          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                disabled={loading}
              />
            </div>

            {error && <div className="error-message">{error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="login-btn primary"
            >
              {loading ? 'Signing in...' : 'Continue'}
            </button>
          </form>

          <div className="divider">or</div>

          <button
            onClick={handleSlackLogin}
            className="login-btn slack"
            disabled={true}
            title="Slack OAuth - Coming in Step 2"
          >
            Continue with Slack
          </button>

          <p className="note">
            Enter any email to access the POC environment.
          </p>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
