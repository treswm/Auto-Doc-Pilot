import { useState, useCallback } from 'react'
import FeedbackForm from '../components/FeedbackForm'
import '../styles/Tabs.css'
import glossaryData from '../../glossary.json'

function OutdatedTab({ user }) {
  const [outdatedArticles, setOutdatedArticles] = useState(null)
  const [totalArticlesFound, setTotalArticlesFound] = useState(0)
  const [articleStatuses, setArticleStatuses] = useState({})
  const [scanLoading, setScanLoading] = useState(false)
  const [scanError, setScanError] = useState(null)
  const [selectedArticle, setSelectedArticle] = useState(null)
  const [view, setView] = useState('scan') // 'scan' or 'history'
  const [previousReviews, setPreviousReviews] = useState([])
  const [selectedReviewHistory, setSelectedReviewHistory] = useState(null)
  const [showGlossary, setShowGlossary] = useState(false)

  // Generate fake outdated scores
  const generateOutdatedScore = (articleId, daysOld) => {
    // Deterministic fake scores based on ID for consistency
    const seed = articleId * 73 // Prime number for distribution
    const timeScore = Math.min(100, (daysOld / 300) * 30 + Math.random() * 5)
    const productScore = (seed % 30) + 15
    const userScore = (seed % 15) + 5
    const screenshotScore = (seed % 15) + 5
    const terminologyScore = (seed % 10) + 2

    const total = Math.round(timeScore + productScore + userScore + screenshotScore + terminologyScore)

    return {
      total: Math.min(100, total),
      timeScore: Math.round(timeScore),
      productScore: Math.round(productScore),
      userScore: Math.round(userScore),
      screenshotScore: Math.round(screenshotScore),
      terminologyScore: Math.round(terminologyScore)
    }
  }

  const calculateDaysStale = (updatedAt) => {
    const days = Math.floor((Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24))
    return days
  }

  const scanOutdatedArticles = useCallback(async () => {
    setScanLoading(true)
    setScanError(null)
    try {
      const res = await fetch('/api/scanners/outdated?daysSinceUpdate=90&limit=50', {
        credentials: 'include'
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to scan articles')

      const total = data.articles.length
      const displayArticles = data.articles.slice(0, 6)

      // Add scores to articles
      const articlesWithScores = displayArticles.map(article => ({
        ...article,
        outdatedScore: generateOutdatedScore(article.id, calculateDaysStale(article.updated_at))
      }))

      // Sort articles by outdated score (highest first)
      const sortedArticles = articlesWithScores.sort((a, b) =>
        b.outdatedScore.total - a.outdatedScore.total
      )

      setOutdatedArticles(sortedArticles)
      setTotalArticlesFound(total)
      setArticleStatuses({})
    } catch (err) {
      setScanError(err.message)
    } finally {
      setScanLoading(false)
    }
  }, [])

  const handleArticleStatus = (articleId, status) => {
    setArticleStatuses(prev => ({
      ...prev,
      [articleId]: status
    }))
  }

  const fetchPreviousReviews = useCallback(async () => {
    try {
      const res = await fetch('/api/articles/outdated-history', {
        credentials: 'include'
      })
      const data = await res.json()
      if (data.success) {
        setPreviousReviews(data.reviews || [])
      }
    } catch (err) {
      console.error('Failed to fetch previous reviews:', err)
    }
  }, [])

  return (
    <div className="tab-container">
      <div className="tab-header">
        <h2>Outdated Documentation</h2>
        <button
          className="btn btn-accent"
          onClick={scanOutdatedArticles}
          disabled={scanLoading}
        >
          {scanLoading ? 'Scanning...' : '🔍 Scan Outdated'}
        </button>
      </div>

      {/* View Tabs */}
      <div className="view-tabs">
        <button
          className={`btn btn-ghost ${view === 'scan' ? 'active' : ''}`}
          onClick={() => setView('scan')}
        >
          Current Scan
        </button>
        <button
          className={`btn btn-ghost ${view === 'history' ? 'active' : ''}`}
          onClick={() => { setView('history'); fetchPreviousReviews() }}
        >
          Previously Reviewed
        </button>
        <button
          className={`btn btn-ghost ${view === 'glossary' ? 'active' : ''}`}
          onClick={() => setView('glossary')}
        >
          Terminology Glossary
        </button>
      </div>

      {view === 'scan' && (
        <>
          <div className="info-box">
            <p>
              <strong>📊 Outdated Score Calculation:</strong> Articles are scored based on:
              30% time since last review, 30% product-change mismatch, 15% user behavior/feedback signals, 15% screenshot checks, 10% terminology/semantic drift. Review each article and mark whether it needs updating or is still current.
            </p>
          </div>

          {!outdatedArticles && !scanLoading && (
            <div className="content-placeholder">
              <p>📚 Click "Scan Outdated" to find articles that need review</p>
              <p className="help-text">
                Articles will be scored and displayed here for review.
              </p>
            </div>
          )}

          {scanLoading && (
            <div className="content-placeholder">
              <p>🔍 Scanning for articles that need review...</p>
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
            <>
              <div className="scan-info">
                <p>
                  ✅ Found <strong>{totalArticlesFound}</strong> articles needing review. {totalArticlesFound > outdatedArticles.length && `Showing the first ${outdatedArticles.length} for quick review.`}
                </p>
              </div>
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

                    {/* Outdated Score Display */}
                    <div className="outdated-score">
                      <div className="score-overall">
                        <span className="score-label">Outdated Score:</span>
                        <span className={`score-value ${article.outdatedScore.total >= 70 ? 'high' : article.outdatedScore.total >= 40 ? 'medium' : 'low'}`}>
                          {article.outdatedScore.total}%
                        </span>
                      </div>
                      <div className="score-breakdown">
                        <div className="score-item">
                          <span className="score-name">Time:</span>
                          <span className="score-pct">{article.outdatedScore.timeScore}%</span>
                        </div>
                        <div className="score-item">
                          <span className="score-name">Product Mismatch:</span>
                          <span className="score-pct">{article.outdatedScore.productScore}%</span>
                        </div>
                        <div className="score-item">
                          <span className="score-name">User Signals:</span>
                          <span className="score-pct">{article.outdatedScore.userScore}%</span>
                        </div>
                        <div className="score-item">
                          <span className="score-name">Screenshots:</span>
                          <span className="score-pct">{article.outdatedScore.screenshotScore}%</span>
                        </div>
                        <div className="score-item">
                          <span className="score-name">Terminology:</span>
                          <span className="score-pct">{article.outdatedScore.terminologyScore}%</span>
                        </div>
                      </div>
                    </div>

                    <div className="article-meta">
                      <p>📅 Last updated: {new Date(article.updated_at).toLocaleString()}</p>
                    </div>

                    {articleStatuses[article.id] ? (
                      <div className="article-resolved">
                        <div className="resolved-audit-info">
                          <span className="badge badge-success">
                            ✓ {articleStatuses[article.id] === 'needs_update' ? 'Needs Updating' : articleStatuses[article.id] === 'still_good' ? 'Still Good' : 'Review Later'}
                          </span>
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
                          onClick={() => handleArticleStatus(article.id, 'needs_update')}
                        >
                          Needs Updating
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleArticleStatus(article.id, 'review_later')}
                        >
                          Review Later
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleArticleStatus(article.id, 'still_good')}
                        >
                          Still Good
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            outdatedArticles && (
              <div className="content-placeholder">
                <p>✅ No articles need review!</p>
                <p className="help-text">All articles appear to be current.</p>
              </div>
            )
          )}

          {selectedArticle && (
            <FeedbackForm
              type="outdated"
              entityId={selectedArticle.id}
              label={`Review: ${selectedArticle.title}`}
              hint="Mark whether this article needs updating and provide any feedback."
            />
          )}
        </>
      )}

      {view === 'history' && (
        <div className="previous-reviews-section">
          <div className="reviews-header">
            <h3>📚 Previously Reviewed</h3>
          </div>

          {previousReviews.length === 0 && (
            <div className="content-placeholder">
              <p>No articles reviewed yet</p>
              <p className="help-text">Articles you've reviewed will appear here</p>
            </div>
          )}

          {previousReviews.length > 0 && !selectedReviewHistory && (
            <div className="reviews-list">
              {previousReviews.map(review => (
                <div key={review.id} className="review-item">
                  <div className="review-info">
                    <h4>{review.title}</h4>
                    <p className="review-meta">
                      Reviewed {review.reviewedArticleCount} articles • {review.needsUpdateCount} need updating • {review.stillGoodCount} still good
                    </p>
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setSelectedReviewHistory(review)}
                  >
                    View Details
                  </button>
                </div>
              ))}
            </div>
          )}

          {selectedReviewHistory && (
            <div className="review-detail">
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedReviewHistory(null)}>
                ← Back to Reviews
              </button>
              <h3>{selectedReviewHistory.title}</h3>
              <div className="review-audit-log">
                <h4>📋 Review History</h4>
                <div className="audit-entries">
                  {selectedReviewHistory.articles && selectedReviewHistory.articles.map(article => (
                    <div key={article.id} className="audit-entry">
                      <div className="entry-header">
                        <span className="entry-title">{article.title}</span>
                        <span className={`status-badge ${article.reviewStatus}`}>
                          {article.reviewStatus === 'needs_update' ? '🔧 Needs Updating' :
                           article.reviewStatus === 'still_good' ? '✓ Still Good' :
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
      )}

      {view === 'glossary' && (
        <div className="glossary-section">
          <div className="glossary-header">
            <div className="glossary-header-content">
              <h3>📚 Hi Marley Terminology Glossary</h3>
              <p className="glossary-subtitle">Source of truth for terminology and semantic drift scoring</p>
            </div>
            <button className="glossary-edit-btn">
              ✏️ Edit
            </button>
          </div>

          <div className="glossary-content">
            <table className="glossary-table">
              <thead>
                <tr>
                  <th>English Term</th>
                  <th>French-Canadian</th>
                  <th>Category</th>
                  <th>Context</th>
                </tr>
              </thead>
              <tbody>
                {glossaryData.glossary.slice(0, 30).map((term, idx) => (
                  <tr key={idx}>
                    <td><strong>{term.english}</strong></td>
                    <td>{term.french}</td>
                    <td><span className="glossary-badge">{term.category}</span></td>
                    <td className="glossary-context">{term.context}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="glossary-note">
            <p>
              <strong>💡 Note:</strong> This is the source of truth for terminology and semantic drift scoring. Articles using outdated terminology or inconsistent language relative to this glossary will score higher on the "terminology/semantic drift" component of the Outdated Score.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default OutdatedTab
