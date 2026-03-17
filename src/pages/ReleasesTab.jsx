import { useState, useCallback } from 'react'
import FeedbackForm from '../components/FeedbackForm'
import ReleaseNotesInputSection from '../components/ReleaseNotesInputSection'
import '../styles/Tabs.css'

function ReleasesTab({ user }) {
  const [releaseArticles, setReleaseArticles] = useState(null)
  const [scanLoading, setScanLoading] = useState(false)
  const [scanError, setScanError] = useState(null)
  const [keywordsInput, setKeywordsInput] = useState('')
  const [usedKeywords, setUsedKeywords] = useState(null)
  const [selectedArticle, setSelectedArticle] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [releaseId, setReleaseId] = useState(null)
  const [releaseTitle, setReleaseTitle] = useState(null)
  const [flaggedArticles, setFlaggedArticles] = useState([])
  const [flaggingLoading, setFlaggingLoading] = useState(false)

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

  const handleKeywordsExtracted = (keywordsForSearch) => {
    setKeywordsInput(keywordsForSearch)
  }

  const handleAnalysisComplete = (analysisData) => {
    setAnalysis(analysisData)
    // Generate a releaseId based on timestamp + version
    const id = `release_${Date.now()}`
    setReleaseId(id)
  }

  const searchAndFlagArticles = useCallback(async () => {
    if (!analysis || !releaseId) {
      setScanError('Please analyze the release first')
      return
    }

    setFlaggingLoading(true)
    setScanError(null)

    try {
      const res = await fetch('/api/scanners/search-and-flag', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          releaseNotes: '', // Frontend doesn't have this, backend uses the analysis
          releaseId,
          releaseTitle: releaseTitle || 'Release Analysis'
        })
      })

      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to search articles')

      setFlaggedArticles(data.foundArticles || [])

      // Now flag the articles
      if (data.foundArticles && data.foundArticles.length > 0) {
        const articleIds = data.foundArticles.map(a => a.id)

        const flagRes = await fetch('/api/articles/flag-by-release', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({
            releaseId,
            releaseTitle: releaseTitle || 'Release Analysis',
            affectedAreas: analysis.affectedFeatures || [],
            articleIds
          })
        })

        const flagData = await flagRes.json()
        if (!flagData.success) throw new Error(flagData.error || 'Failed to flag articles')
      }
    } catch (err) {
      setScanError(err.message)
    } finally {
      setFlaggingLoading(false)
    }
  }, [analysis, releaseId, releaseTitle])

  return (
    <div className="tab-container">
      <div className="tab-header">
        <h2>Release Notes Analysis</h2>
      </div>

      <div className="info-box">
        <p>
          🚀 <strong>Phase 3:</strong> Paste your release notes to extract keywords automatically, then the system will find which Help Center articles
          need updating. Or manually enter keywords to identify articles matching those terms.
        </p>
      </div>

      <ReleaseNotesInputSection
        onKeywordsExtracted={handleKeywordsExtracted}
        onAnalysisComplete={handleAnalysisComplete}
      />

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

      {analysis && !flaggedArticles.length && (
        <div className="search-articles-section">
          <h4>🔍 Ready to Search Help Center</h4>
          <p>Click below to search your Help Center for {analysis.searchQueries?.length || 0} related topics and flag affected articles:</p>
          <button
            className="btn btn-primary"
            onClick={searchAndFlagArticles}
            disabled={flaggingLoading}
          >
            {flaggingLoading ? 'Searching & Flagging...' : '🚀 Find Affected Articles'}
          </button>
        </div>
      )}

      {flaggedArticles.length > 0 && (
        <>
          <div className="scan-info">
            <p>
              ✅ Found and flagged <strong>{flaggedArticles.length}</strong> articles for this release
            </p>
          </div>
          <div className="articles-grid">
            {flaggedArticles.map(article => (
              <div
                key={article.id}
                className={`article-card ${selectedArticle?.id === article.id ? 'selected' : ''}`}
                onClick={() => setSelectedArticle(article)}
              >
                <div className="article-header">
                  <h4>{article.title}</h4>
                  <span className="article-id">ID: {article.id}</span>
                  <span className="status-badge flagged">Flagged for Review</span>
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
                    Review Article ↗
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
