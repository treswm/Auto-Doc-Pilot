import { useState, useEffect } from 'react'
import LoginPage from './pages/LoginPage'
import TranslationTab from './pages/TranslationTab'
import OutdatedTab from './pages/OutdatedTab'
import ReleasesTab from './pages/ReleasesTab'
import AdminTab from './pages/AdminTab'
import './App.css'

const TranslationIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3h6M5 1v2M3.5 3c.3 2.5 2.2 4.5 5 5M6.5 3C6.2 5 5.5 7 3.5 8"/>
    <path d="M9 11l1.5-4 1.5 4M9.5 9.5h2"/>
    <path d="M9 13.5h5"/>
  </svg>
)

const OutdatedIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="6"/>
    <path d="M8 5v3l2 1.5"/>
  </svg>
)

const ReleasesIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 2l1.5 3.5H13L10.5 7.5l1 3L8 8.5l-3.5 2 1-3L3 5.5h3.5L8 2z"/>
  </svg>
)

const AdminIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="8" cy="5.5" r="2.5"/>
    <path d="M2.5 13c0-3 2.5-4.5 5.5-4.5s5.5 1.5 5.5 4.5"/>
  </svg>
)

const NAV_ITEMS = [
  { id: 'translation', label: 'Translation', Icon: TranslationIcon },
  { id: 'outdated', label: 'Outdated Docs', Icon: OutdatedIcon },
  { id: 'releases', label: 'Release Notes', Icon: ReleasesIcon },
]

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('translation')

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
      </div>
    )
  }

  if (!user) {
    return <LoginPage onLoginSuccess={(userData) => setUser(userData)} />
  }

  const navItems = user.role === 'admin'
    ? [...NAV_ITEMS, { id: 'admin', label: 'Admin', Icon: AdminIcon }]
    : NAV_ITEMS

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-logo">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="white">
              <polygon points="6,1 11,3.5 11,8.5 6,11 1,8.5 1,3.5"/>
            </svg>
          </div>
          <span className="brand-name">Doc Pilot</span>
        </div>

        <p className="sidebar-label">Workflows</p>

        <nav className="sidebar-nav">
          {navItems.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`nav-item ${activeTab === id ? 'active' : ''}`}
              onClick={() => setActiveTab(id)}
            >
              <Icon />
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-section">
            <span className="user-email">{user.name || user.email}</span>
            <button onClick={handleLogout} className="logout-btn">Sign out</button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <div className="tab-content">
          {activeTab === 'translation' && <TranslationTab user={user} />}
          {activeTab === 'outdated' && <OutdatedTab user={user} />}
          {activeTab === 'releases' && <ReleasesTab user={user} />}
          {activeTab === 'admin' && <AdminTab user={user} />}
        </div>
      </main>
    </div>
  )
}

export default App
