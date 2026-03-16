import { useState, useCallback } from 'react'
import FeedbackForm from '../components/FeedbackForm'
import '../styles/Tabs.css'

function ReleasesTab({ user }) {
  const [releaseArticles, setReleaseArticles] = useState(null)
  const [scanLoading, setScanLoading] = useState(false)
  const [scanError, setScanError] = useState(null)
  const [keywordsInput, setKeywordsInput] = useState('')
  const [usedKeywords, setUsedKeywords] = useState(null)
  const [selectedArticle, setSelectedArticle] = useState(null)

  const scanReleaseArticles = useCallback(async () => {
    if (!keywordsInput.trim()) {
      setScanError('Please enter at least one keyword')
      return
    }

    setScanLoading(true)
    setScanError(null)
    try {
      const keywords = keywordsInput
        .split(',')
        .map(k => k.trim())
        .filter(k => k)
      
      if (keywords.length === 0) {
        throw new Error('Please enter valid keywords separated by commas')
      }

      const res = await fetch(`/api/scanners/releases?keywords=${keywords.join(',')}&limit=50`, {
        credentials: 'include'
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to scan articles')
      setReleaseArticles(data.articles)
      setUsedKeywords(keywords)
    } catch (err) {
      setScanError(err.message)
    } finally {
      setScanLoading(false)
    }
  }, [keywordsInput])

  const handleKeywordChange = (e) => {
    setKeywordsInput(e.target.value)
    if (scanError) setScanError(null)
  }

  return (
    <div className="tab-container">
      <div className="tab-header">
        <h2>Release Notes Analysis</h2>
      </div>

      <div className="info-box">
        <p>
          🚀 <strong>Phase 3:</strong> Enter release keywords to identify which Help Center articles
          need updating. The system will find articles matching those keywords so your team can review
          and update them quickly.
        </p>
      </div>

      <div className="release-input-section">
        <label htmlFor="keywords-input" className="input-label">
          Release Keywords (comma-separated)
        </label>
        <div className="input-group">
          <input
            id="keywords-input"
            type="text"
            value={keywordsInput}
            onChange={handleKeywordChange}
            placeholder="e.g., AI, Mobile App, Dashboard, Performance"
            className="input-field"
            disabled={scanLoading}
          />
          <button
            className="btn btn-accent"
            onClick={scanReleaseArticles}
            disabled={scanLoading || !keywordsInput.trim()}
          >
            {scanLoading ? 'Scanning...' : '🔍 Find Articles'}
          </button>
        </div>
        <p className="help-text">
          Enter the key features or components from your release notes. The system will find all
          Help Center articles mentioning those keywords.
        </p>
      </div>

      {scanError && (
        <div className="error-message">
          <p>❌ Error: {scanError}</p>
        </div>
      )}

      {scanLoading && (
        <div className="content-placeholder">
          <p>🔍 Scanning for articles matching "{keywordsInput}"...</p>
        </div>
      )}

      {!releaseArticles && !scanLoading && !scanError && (
        <div className="content-placeholder">
          <p>📝 Enter release keywords above and click "Find Articles"</p>
          <p className="help-text">
            Examples: AI features, Mobile app improvements, Security updates, Performance enhancements
          </p>
        </div>
      )}

      {usedKeywords && releaseArticles && releaseArticles.length > 0 ? (
        <>
          <div className="scan-info">
            <p>
              ✅ Found <strong>{releaseArticles.length}</strong> articles matching: <span className="keywords-badge">{usedKeywords.join(', ')}</span>
            </p>
          </div>
          <div className="articles-grid">
            {releaseArticles.map(article => (
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
                  <p>📅 Updated: {new Date(article.updated_at).toLocaleString()}</p>
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
        </>
      ) : (
        releaseArticles && (
          <div className="content-placeholder">
            <p>No articles found matching those keywords</p>
            <p className="help-text">
              Try different keywords or check if articles need to be updated with release terminology.
            </p>
          </div>
        )
      )}

      {selectedArticle && (
        <FeedbackForm
          type="release"
          entityId={selectedArticle.id}
          label={`Release Update Needed: ${selectedArticle.title}`}
          hint="Mark if this article needs updating for the release, and provide any specific feedback."
        />
      )}
    </div>
  )
}

export default ReleasesTab
