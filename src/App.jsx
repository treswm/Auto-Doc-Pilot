import { useState, useEffect } from 'react'
import LoginPage from './pages/LoginPage'
import TranslationTab from './pages/TranslationTab'
import OutdatedTab from './pages/OutdatedTab'
import ReleasesTab from './pages/ReleasesTab'
import './App.css'

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('translation')

  // Check if user is authenticated
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/me')
        if (response.ok) {
          const userData = await response.json()
          setUser(userData)
        }
      } catch (error) {
        console.error('Auth check failed:', error)
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [])

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      setUser(null)
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    )
  }

  if (!user) {
    return <LoginPage onLoginSuccess={(userData) => setUser(userData)} />
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <h1>Help Center Translation Dashboard</h1>
          <div className="user-info">
            <span>{user.name || user.email}</span>
            <button onClick={handleLogout} className="logout-btn">Logout</button>
          </div>
        </div>
      </header>

      <nav className="tab-navigation">
        <button
          className={`tab-btn ${activeTab === 'translation' ? 'active' : ''}`}
          onClick={() => setActiveTab('translation')}
        >
          📝 Translation
        </button>
        <button
          className={`tab-btn ${activeTab === 'outdated' ? 'active' : ''}`}
          onClick={() => setActiveTab('outdated')}
        >
          ⏰ Outdated Documentation
        </button>
        <button
          className={`tab-btn ${activeTab === 'releases' ? 'active' : ''}`}
          onClick={() => setActiveTab('releases')}
        >
          🚀 Release Notes
        </button>
      </nav>

      <main className="tab-content">
        {activeTab === 'translation' && <TranslationTab user={user} />}
        {activeTab === 'outdated' && <OutdatedTab user={user} />}
        {activeTab === 'releases' && <ReleasesTab user={user} />}
      </main>
    </div>
  )
}

export default App
