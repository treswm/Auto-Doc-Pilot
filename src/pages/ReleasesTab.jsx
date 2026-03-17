import { useState, useCallback } from 'react'
import FeedbackForm from '../components/FeedbackForm'
import ReleaseNotesInputSection from '../components/ReleaseNotesInputSection'
import '../styles/Tabs.css'

function ReleasesTab({ user }) {
  const [selectedArticle, setSelectedArticle] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [releaseId, setReleaseId] = useState(null)
  const [releaseTitle, setReleaseTitle] = useState(null)
  const [flaggedArticles, setFlaggedArticles] = useState([])
  const [flaggingLoading, setFlaggingLoading] = useState(false)


  const handleAnalysisComplete = (analysisData) => {
    setAnalysis(analysisData)
    // Generate a releaseId based on timestamp + version
    const id = `release_${Date.now()}`
    setReleaseId(id)
  }

  const searchAndFlagArticles = useCallback(async () => {
    if (!analysis || !releaseId) {
      console.error('Please analyze the release first')
      return
    }

    setFlaggingLoading(true)

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
      console.error('Error searching and flagging articles:', err.message)
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
          Paste your release notes to analyze the impact and find which Help Center articles need updating.
        </p>
      </div>

      <ReleaseNotesInputSection
        onAnalysisComplete={handleAnalysisComplete}
      />

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
