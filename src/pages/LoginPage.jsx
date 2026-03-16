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
      // For POC: simple email/password login (Step 2 will add Slack OAuth)
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
    // Redirect to /api/auth/slack
    console.log('Slack OAuth coming in Step 2')
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-box">
          <h1>Help Center Translation Dashboard</h1>
          <p className="subtitle">Manage translations, outdated articles, and release notes</p>

          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
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
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>

          <div className="divider">or</div>

          <button
            onClick={handleSlackLogin}
            className="login-btn slack"
            disabled={true}
            title="Slack OAuth - Coming in Step 2"
          >
            Login with Slack (Coming Soon)
          </button>

          <p className="note">
            For POC: Enter any email address to proceed.
            Slack OAuth will be added in Step 2.
          </p>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
