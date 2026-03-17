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
  const [totalArticlesFound, setTotalArticlesFound] = useState(0)
  const [flaggingLoading, setFlaggingLoading] = useState(false)
  const [articleStatuses, setArticleStatuses] = useState({})
  const [previousReleases, setPreviousReleases] = useState([])
  const [selectedReleaseHistory, setSelectedReleaseHistory] = useState(null)
  const [articleReasons, setArticleReasons] = useState({})


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
      setTotalArticlesFound(data.totalArticlesFound || data.foundArticles.length || 0)

      // Articles are now displayed in session but NOT persisted to database yet
      // They will only be persisted when user marks the release as processed
    } catch (err) {
      console.error('Error searching and flagging articles:', err.message)
    } finally {
      setFlaggingLoading(false)
    }
  }, [analysis, releaseId, releaseTitle])

  const handleArticleStatus = (articleId, status) => {
    setArticleStatuses(prev => ({
      ...prev,
      [articleId]: status
    }))
  }

  const updateArticleStatus = async (articleId, status) => {
    try {
      await fetch(`/api/articles/flag/${releaseId}_${articleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          reviewStatus: status,
          reviewedBy: user?.name || 'Unknown'
        })
      })
      handleArticleStatus(articleId, status)
    } catch (err) {
      console.error('Failed to update article status:', err)
    }
  }

  const fetchPreviousReleases = useCallback(async () => {
    try {
      const res = await fetch('/api/articles/releases-history', {
        credentials: 'include'
      })
      const data = await res.json()
      if (data.success) {
        setPreviousReleases(data.releases || [])
      }
    } catch (err) {
      console.error('Failed to fetch releases history:', err)
    }
  }, [])

  const loadReleaseHistory = (release) => {
    setSelectedReleaseHistory(release)
  }

  const handleMarkAsProcessed = async () => {
    try {
      if (!flaggedArticles || flaggedArticles.length === 0 || !releaseId || !analysis) {
        console.error('Missing required data to process release')
        return
      }

      const articleIds = flaggedArticles.map(a => a.id)

      // Persist articles to database
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

      // Clear current view after successful processing
      setFlaggedArticles([])
      setTotalArticlesFound(0)
      setAnalysis(null)
      setReleaseId(null)
      setArticleStatuses({})

      // Refresh previous releases list
      await fetchPreviousReleases()
    } catch (err) {
      console.error('Error marking release as processed:', err.message)
    }
  }

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
        flaggedArticles={flaggedArticles}
        releaseId={releaseId}
        analysis={analysis}
      />

      {analysis && !flaggedArticles.length && (
        <div className="search-articles-section">
          <h4>🔍 Ready to Search Help Center</h4>
          <p>Click below to search your Help Center and identify articles that need updates based on this release:</p>
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
              ✅ Found <strong>{totalArticlesFound}</strong> articles for this release. {totalArticlesFound > flaggedArticles.length && `Showing the first ${flaggedArticles.length} for quick review.`} Mark their status, then click "Mark as Processed" below.
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
                  <p>📅 Last updated: {new Date(article.updated_at).toLocaleString()}</p>
                  {analysis?.affectedFeatures && analysis.affectedFeatures.length > 0 && (
                    <p className="article-flag-reason">
                      <strong>Affected by:</strong> {analysis.affectedFeatures.join(', ')}
                    </p>
                  )}
                </div>
                {articleStatuses[article.id] ? (
                  <div className="article-resolved">
                    <div className="resolved-audit-info">
                      <span className="badge badge-success">✓ {articleStatuses[article.id] === 'updated' ? 'Updated' : articleStatuses[article.id] === 'no_update' ? 'Does Not Require Updating' : 'Review Later'}</span>
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleArticleStatus(article.id, null)}
                    >
                      Undo
                    </button>
                  </div>
                ) : (
                  <div className="article-actions">
                    <a
                      href={article.helpCenterUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary btn-sm"
                    >
                      Review Article ↗
                    </a>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => updateArticleStatus(article.id, 'updated')}
                    >
                      Mark as Updated
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => updateArticleStatus(article.id, 'review_later')}
                    >
                      Review Later
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => updateArticleStatus(article.id, 'no_update')}
                    >
                      Does Not Require Updating
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="process-release-section">
            <button
              className="btn btn-success"
              onClick={handleMarkAsProcessed}
            >
              ✅ Mark as Processed
            </button>
            <p className="process-info">Click when you're done reviewing articles. This will save the release to your Previous Releases history.</p>
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

      {/* Previous Releases Section */}
      <div className="previous-releases-section">
        <div className="releases-header">
          <h3>📚 Previous Releases</h3>
          <button className="btn btn-ghost btn-sm" onClick={fetchPreviousReleases}>
            Load Release History
          </button>
        </div>

        {previousReleases.length === 0 && (
          <div className="content-placeholder">
            <p>No previous releases found</p>
            <p className="help-text">Releases you've analyzed and reviewed will appear here</p>
          </div>
        )}

        {previousReleases.length > 0 && !selectedReleaseHistory && (
          <div className="releases-list">
            {previousReleases.map(release => (
              <div key={release.releaseId} className="release-item">
                <div className="release-info">
                  <h4>{release.releaseTitle || release.releaseId}</h4>
                  <p className="release-meta">
                    {release.flaggedCount} articles flagged • {release.updatedCount} updated • {release.pendingCount} pending
                  </p>
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => loadReleaseHistory(release)}
                >
                  View Details
                </button>
              </div>
            ))}
          </div>
        )}

        {selectedReleaseHistory && (
          <div className="release-detail">
            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedReleaseHistory(null)}>
              ← Back to Releases
            </button>
            <h3>{selectedReleaseHistory.releaseTitle || selectedReleaseHistory.releaseId}</h3>
            <div className="release-stats">
              <div className="stat">
                <span className="stat-label">Flagged</span>
                <span className="stat-value">{selectedReleaseHistory.flaggedCount}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Updated</span>
                <span className="stat-value updated">{selectedReleaseHistory.updatedCount}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Pending</span>
                <span className="stat-value pending">{selectedReleaseHistory.pendingCount}</span>
              </div>
            </div>
            <div className="release-audit-log">
              <h4>📋 Review Audit Log</h4>
              <div className="audit-entries">
                {selectedReleaseHistory.articles && selectedReleaseHistory.articles.map(article => (
                  <div key={article.id} className="audit-entry">
                    <div className="entry-header">
                      <span className="entry-title">{article.title}</span>
                      <span className={`status-badge ${article.reviewStatus}`}>
                        {article.reviewStatus === 'updated' ? '✓ Updated' :
                         article.reviewStatus === 'no_update' ? '✓ Does Not Require Updating' :
                         article.reviewStatus === 'review_later' ? '⏱ Review Later' :
                         '⏳ Pending'}
                      </span>
                    </div>
                    <div className="entry-details">
                      <p className="entry-id">Article ID: {article.id}</p>
                      {article.reviewedAt && (
                        <p className="entry-timestamp">
                          Reviewed: {new Date(article.reviewedAt).toLocaleString()} by {article.reviewedBy || 'Unknown'}
                        </p>
                      )}
                      {article.flaggedAt && (
                        <p className="entry-timestamp">
                          Flagged: {new Date(article.flaggedAt).toLocaleString()}
                        </p>
                      )}
                      {article.notes && (
                        <p className="entry-notes"><strong>Notes:</strong> {article.notes}</p>
                      )}
                    </div>
                    <a
                      href={article.helpCenterUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-ghost btn-xs"
                    >
                      View Article ↗
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ReleasesTab
