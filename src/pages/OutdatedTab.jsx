import { useState, useCallback } from 'react'
import FeedbackForm from '../components/FeedbackForm'
import '../styles/Tabs.css'

function OutdatedTab({ user }) {
  const [outdatedArticles, setOutdatedArticles] = useState(null)
  const [scanLoading, setScanLoading] = useState(false)
  const [scanError, setScanError] = useState(null)
  const [selectedArticle, setSelectedArticle] = useState(null)

  const scanOutdatedArticles = useCallback(async () => {
    setScanLoading(true)
    setScanError(null)
    try {
      const res = await fetch('/api/scanners/outdated?daysSinceUpdate=90&limit=50', {
        credentials: 'include'
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to scan articles')
      setOutdatedArticles(data.articles)
    } catch (err) {
      setScanError(err.message)
    } finally {
      setScanLoading(false)
    }
  }, [])

  const calculateDaysStale = (updatedAt) => {
    const days = Math.floor((Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24))
    return days
  }

  return (
    <div className="tab-container">
      <div className="tab-header">
        <h2>Outdated Documentation</h2>
        <button
          className="btn btn-accent"
          onClick={scanOutdatedArticles}
          disabled={scanLoading}
        >
          {scanLoading ? 'Scanning...' : '🔍 Scan Outdated (90+ days)'}
        </button>
      </div>

      <div className="info-box">
        <p>
          ⏰ <strong>Phase 2:</strong> Articles flagged as potentially outdated will appear here.
          Review each one, mark it "Needs Updating" or "Still Good", and provide feedback.
          Each article links directly to the Help Center so you can review the current content.
        </p>
      </div>

      {!outdatedArticles && !scanLoading && (
        <div className="content-placeholder">
          <p>📚 Click "Scan Outdated" to find articles that haven't been updated recently</p>
          <p className="help-text">
            Articles not updated in 90+ days will be flagged for review.
          </p>
        </div>
      )}

      {scanLoading && (
        <div className="content-placeholder">
          <p>🔍 Scanning for outdated articles...</p>
        </div>
      )}

      {scanError && (
        <div className="error-message">
          <p>❌ Error: {scanError}</p>
          <button className="btn btn-primary btn-sm" onClick={scanOutdatedArticles}>
            Retry Scan
          </button>
        </div>
      )}

      {outdatedArticles && outdatedArticles.length > 0 ? (
        <div className="articles-grid">
          {outdatedArticles.map(article => (
            <div
              key={article.id}
              className={`article-card ${selectedArticle?.id === article.id ? 'selected' : ''}`}
              onClick={() => setSelectedArticle(article)}
            >
              <div className="article-header">
                <h4>{article.title}</h4>
                <span className="article-id">ID: {article.id}</span>
              </div>
              <div className="article-meta">
                <p>⏰ Last updated: {new Date(article.updated_at).toLocaleString()}</p>
                <p className="staleness-badge">
                  🚨 {calculateDaysStale(article.updated_at)} days old
                </p>
              </div>
              <div className="article-actions">
                <a
                  href={article.helpCenterUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary btn-sm"
                >
                  View Article ↗
                </a>
                <a
                  href={article.helpCenterUrlFr}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost btn-sm"
                >
                  French ↗
                </a>
              </div>
            </div>
          ))}
        </div>
      ) : (
        outdatedArticles && (
          <div className="content-placeholder">
            <p>✅ No outdated articles found!</p>
            <p className="help-text">All articles have been updated recently.</p>
          </div>
        )
      )}

      {selectedArticle && (
        <FeedbackForm
          type="outdated"
          entityId={selectedArticle.id}
          label={`Feedback: ${selectedArticle.title}`}
          hint="Mark as 'Needs Updating' or 'Still Good' and explain why."
        />
      )}
    </div>
  )
}

export default OutdatedTab
