import { useState, useEffect, useCallback } from 'react'
import FeedbackForm from '../components/FeedbackForm'
import TranslationInputSection from '../components/TranslationInputSection'
import TranslationTrainingInput from '../components/TranslationTrainingInput'
import '../styles/Tabs.css'
import '../styles/TranslationTab.css'

const STATUS_LABEL = {
  pending: null,
  updated: 'Updated',
  update_later: 'Update Later',
  no_update: 'Does Not Require Updating',
}

function ScreenshotList({ items, onAction }) {
  if (items.length === 0) {
    return (
      <div className="content-placeholder">
        <p>No screenshots in this category</p>
        <p className="help-text">
          Visual Media found in articles will appear here once the workflow has run.
        </p>
      </div>
    )
  }

  return (
    <div className="screenshot-list">
      {items.map(screenshot => (
        <div key={screenshot.id} className={`screenshot-card ${screenshot.status !== 'pending' ? 'screenshot-card--resolved' : ''}`}>
          <div className="screenshot-img-wrap">
            <img
              src={screenshot.src}
              alt={screenshot.alt || 'Screenshot'}
              className="screenshot-img"
              onError={e => { e.target.style.display = 'none' }}
            />
          </div>

          <div className="screenshot-details">
            <div className="screenshot-card-meta">
              <strong className="screenshot-article-title">{screenshot.articleTitle}</strong>
              <span className="meta-date">Article ID: {screenshot.articleId}</span>
            </div>

            {screenshot.alt && (
              <p className="screenshot-alt">Alt text: {screenshot.alt}</p>
            )}

            {screenshot.status !== 'pending' ? (
              <div className="screenshot-resolved">
                <div className="resolved-info">
                  <span className="badge badge-success">✓ {STATUS_LABEL[screenshot.status]}</span>
                  <span className="resolved-meta">
                    by {screenshot.updatedBy} • {screenshot.updatedAt ? new Date(screenshot.updatedAt).toLocaleString() : 'unknown time'}
                  </span>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => onAction(screenshot.id, 'pending')}
                >
                  Undo
                </button>
              </div>
            ) : (
              <div className="screenshot-actions">
                <a
                  href={screenshot.zendeskEditorUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary btn-sm"
                >
                  Open in Editor ↗
                </a>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => onAction(screenshot.id, 'updated')}
                >
                  Mark as Updated
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => onAction(screenshot.id, 'update_later')}
                >
                  Update Later
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => onAction(screenshot.id, 'no_update')}
                >
                  Does Not Require Updating
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function TranslationTab({ user }) {
  const [pending, setPending] = useState(null)
  const [history, setHistory] = useState([])
  const [approvers, setApprovers] = useState([])
  const [view, setView] = useState('pending') // 'pending' | 'scan-results' | 'history' | 'approvers' | 'visual-media' | 'translation-results'
  const [screenshotSection, setScreenshotSection] = useState('pendingApproval') // 'pendingApproval' | 'invalidDate' | 'articles'
  const [screenshots, setVisualMedia] = useState(null)
  const [voting, setVoting] = useState(false)
  const [triggering, setTriggering] = useState(false)
  const [message, setMessage] = useState(null)
  const [selectedArticle, setSelectedArticle] = useState(null)
  const [translationInput, setTranslationInput] = useState(null)
  const [scannedArticles, setScannedArticles] = useState(null)
  const [scanLoading, setScanLoading] = useState(false)
  const [scanError, setScanError] = useState(null)
  const [translationRunning, setTranslationRunning] = useState(false)
  const [currentRunId, setCurrentRunId] = useState(null)
  const [translationProgress, setTranslationProgress] = useState(null)
  const [translationResults, setTranslationResults] = useState(null)

  // ── Data fetching ─────────────────────────────────────────────────────────

  const fetchPending = useCallback(async () => {
    try {
      const res = await fetch('/api/approvals/pending', { credentials: 'include' })
      const data = await res.json()
      setPending(data.pending)
    } catch (err) {
      console.error('Failed to fetch pending:', err)
    }
  }, [])

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/approvals/history', { credentials: 'include' })
      const data = await res.json()
      setHistory(data.history || [])
    } catch (err) {
      console.error('Failed to fetch history:', err)
    }
  }, [])

  const fetchApprovers = useCallback(async () => {
    try {
      const res = await fetch('/api/approvers', { credentials: 'include' })
      const data = await res.json()
      setApprovers(data.approvers || [])
    } catch (err) {
      console.error('Failed to fetch approvers:', err)
    }
  }, [])

  const scanRecentArticles = useCallback(async () => {
    setScanLoading(true)
    setScanError(null)
    try {
      const res = await fetch('/api/approvals/scan-section?sectionId=49206877282195', {
        credentials: 'include'
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setScannedArticles(data.articles)
      setView('scan-results')
    } catch (err) {
      setScanError(err.message)
    } finally {
      setScanLoading(false)
    }
  }, [])

  const fetchVisualMedia = useCallback(async () => {
    try {
      const res = await fetch('/api/articles/screenshots', { credentials: 'include' })
      const data = await res.json()
      setVisualMedia(data)
    } catch (err) {
      console.error('Failed to fetch screenshots:', err)
    }
  }, [])

  // Initial load + polling every 10s for pending approvals
  useEffect(() => {
    fetchPending()
    fetchHistory()
    fetchApprovers()

    const interval = setInterval(fetchPending, 10000)
    return () => clearInterval(interval)
  }, [fetchPending, fetchHistory, fetchApprovers])

  const handleScreenshotAction = async (screenshotId, status) => {
    try {
      await fetch(`/api/articles/screenshots/${screenshotId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      await fetchVisualMedia()
    } catch (err) {
      console.error('Failed to update screenshot status:', err)
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleTriggerWorkflow = async () => {
    setTriggering(true)
    setMessage(null)
    setTranslationRunning(true)
    setTranslationProgress(null)
    try {
      const res = await fetch('/api/approvals/trigger', {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json()
      const runId = data.runId
      setCurrentRunId(runId)
      setMessage({ type: 'info', text: 'Translation starting...' })

      // Poll for completion - check every 2 seconds for up to 5 minutes
      let attempts = 0
      const maxAttempts = 150 // 5 minutes with 2s interval
      const pollInterval = setInterval(async () => {
        attempts++
        try {
          const statusRes = await fetch(`/api/approvals/status/${runId}`, { credentials: 'include' })
          const statusData = await statusRes.json()

          // Update progress in UI
          if (statusData.totalArticles > 0) {
            setTranslationProgress({
              translated: statusData.articlesTranslated,
              total: statusData.totalArticles,
              failed: statusData.articlesFailed,
            })
          }

          // Check if translation is completed
          if (statusData.status === 'completed') {
            clearInterval(pollInterval)
            setTranslationRunning(false)
            setTranslationProgress(null)
            const csvName = statusData.auditFilename || `translation-${runId}.csv`
            setTranslationResults({
              runId,
              articlesTranslated: statusData.articlesTranslated,
              articlesFailed: statusData.articlesFailed,
              totalArticles: statusData.totalArticles,
              csvName,
              completedAt: new Date().toISOString(),
            })
            setMessage({
              type: 'success',
              text: `✅ Translation completed! ${statusData.articlesTranslated} articles translated, ${statusData.articlesFailed} failed. 📄 ${csvName}`
            })
            setView('translation-results')
          } else if (statusData.status === 'failed') {
            clearInterval(pollInterval)
            setTranslationRunning(false)
            setTranslationProgress(null)
            const errorMsg = statusData.errors && statusData.errors.length > 0
              ? statusData.errors[0]
              : 'Translation failed'
            setMessage({ type: 'error', text: `❌ Translation failed: ${errorMsg}` })
          }
        } catch (err) {
          console.error('Failed to check translation status:', err)
        }

        // Timeout after 5 minutes
        if (attempts >= maxAttempts) {
          clearInterval(pollInterval)
          setTranslationRunning(false)
          setTranslationProgress(null)
          setMessage({ type: 'warning', text: '⏱️ Translation may still be running. Check the History tab for the audit log.' })
        }
      }, 2000)
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to trigger workflow.' })
      setTranslationRunning(false)
      setTranslationProgress(null)
    } finally {
      setTriggering(false)
    }
  }

  const handleVote = async (approved) => {
    if (!pending?.runId) return
    setVoting(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/approvals/${pending.runId}/vote`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved }),
      })
      const data = await res.json()
      setMessage({
        type: approved ? 'success' : 'error',
        text: approved
          ? `✅ Approved by ${data.voter}. Translations will upload shortly.`
          : `❌ Denied by ${data.voter}. No translations will be uploaded.`,
      })
      await fetchPending()
    } catch (err) {
      setMessage({ type: 'error', text: 'Vote failed. Please try again.' })
    } finally {
      setVoting(false)
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  const hasVoted = pending && user &&
    pending.approvalsReceived?.some(v => v.approver_id === user.id)

  const isAdmin = user?.role === 'admin'

  return (
    <div className="tab-container">
      <div className="tab-header">
        <h2>Translation Approvals</h2>
        <div className="btn-group">
          <button
            className={`btn btn-ghost ${view === 'pending' ? 'active' : ''}`}
            onClick={() => setView('pending')}
          >Pending</button>
          <button
            className={`btn btn-ghost ${view === 'history' ? 'active' : ''}`}
            onClick={() => { setView('history'); fetchHistory() }}
          >History</button>
          {translationResults && (
            <button
              className={`btn btn-ghost ${view === 'translation-results' ? 'active' : ''}`}
              onClick={() => setView('translation-results')}
            >✅ Results</button>
          )}
          <button
            className={`btn btn-ghost ${view === 'approvers' ? 'active' : ''}`}
            onClick={() => { setView('approvers'); fetchApprovers() }}
          >Approvers</button>
          <button
            className={`btn btn-ghost ${view === 'visual-media' ? 'active' : ''}`}
            onClick={() => { setView('visual-media'); fetchVisualMedia() }}
          >Visual Media</button>
          <button
            className={`btn btn-ghost ${view === 'training-input' ? 'active' : ''}`}
            onClick={() => setView('training-input')}
          >📚 Training Input</button>
          <button
            className="btn btn-accent"
            onClick={scanRecentArticles}
            disabled={scanLoading}
          >
            {scanLoading ? 'Scanning...' : '🔍 Scan Recent'}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleTriggerWorkflow}
            disabled={triggering}
          >
            {triggering ? 'Starting...' : '▶ Run Workflow Now'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`alert alert-${message.type}`}>{message.text}</div>
      )}

      {/* ── Pending view ── */}
      {view === 'pending' && (
        <>
          {translationRunning && (
            <div className="translation-loading">
              <div className="spinner"></div>
              <h3>Translation in Progress</h3>
              {translationProgress ? (
                <p>Translating articles... ({translationProgress.translated}/{translationProgress.total} completed)</p>
              ) : (
                <p>Articles are being translated and uploaded to the Help Center...</p>
              )}
              <p className="help-text">This typically takes 2-3 minutes.</p>
            </div>
          )}
          {!pending && !translationRunning ? (
            <div className="content-placeholder">
              <p>No pending approvals</p>
              <p className="help-text">
                Click "Run Workflow Now" to scan for recently edited articles,
                or the workflow will run automatically on Monday at 9am.
              </p>
            </div>
          ) : pending && !translationRunning ? (
            <div className="approval-round">
              <div className="round-meta">
                <span className="badge badge-warning">Pending Approval</span>
                <span className="meta-date">
                  {new Date(pending.timestamp).toLocaleString()}
                </span>
                <span className="meta-count">{pending.articles?.length} article(s)</span>
              </div>

              <div className="articles-list">
                {pending.articles?.map(article => (
                  <div
                    key={article.id}
                    className={`article-card ${selectedArticle?.id === article.id ? 'selected' : ''}`}
                    onClick={() => setSelectedArticle(
                      selectedArticle?.id === article.id ? null : article
                    )}
                  >
                    <div className="article-card-header">
                      <strong>{article.title}</strong>
                      <div className="article-links">
                        <a
                          href={article.helpCenterUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-link"
                          onClick={e => e.stopPropagation()}
                        >
                          View EN ↗
                        </a>
                        <a
                          href={article.helpCenterUrlFr}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-link"
                          onClick={e => e.stopPropagation()}
                        >
                          View FR ↗
                        </a>
                      </div>
                    </div>
                    <p className="article-id">Article ID: {article.id}</p>
                    {selectedArticle?.id === article.id && (
                      <div className="article-detail">
                        <p className="help-text">
                          Click the links above to open the English and French versions
                          in the Help Center. Translation preview will be available
                          once Zendesk credentials are configured.
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Approvals so far */}
              {pending.approvalsReceived?.length > 0 && (
                <div className="votes-section">
                  <h4>Votes so far</h4>
                  {pending.approvalsReceived.map((v, i) => (
                    <div key={i} className="vote-row">
                      <span>{v.approver_name}</span>
                      <span className={v.approved ? 'text-success' : 'text-danger'}>
                        {v.approved ? '✅ Approved' : '❌ Denied'}
                      </span>
                      <span className="meta-date">
                        {new Date(v.timestamp).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Vote buttons */}
              {isAdmin && !hasVoted && (
                <div className="vote-actions">
                  <p>Review the articles above, then cast your vote:</p>
                  <div className="btn-group">
                    <button
                      className="btn btn-success"
                      onClick={() => handleVote(true)}
                      disabled={voting}
                    >
                      {voting ? 'Submitting...' : '✅ Approve All'}
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={() => handleVote(false)}
                      disabled={voting}
                    >
                      {voting ? 'Submitting...' : '❌ Deny All'}
                    </button>
                  </div>
                </div>
              )}

              {hasVoted && (
                <p className="already-voted">You have already voted on this batch.</p>
              )}

              {!isAdmin && (
                <p className="help-text">
                  Only admins can approve translations. You are logged in as {user?.role}.
                </p>
              )}

              {/* Feedback form */}
              <FeedbackForm
                type="translation"
                entityId={pending.runId}
                label="Translation Quality Feedback"
                hint="Did the translations look accurate? Flag any terms that were wrong and we'll update the glossary."
              />
            </div>
          ) : null}
        </>
      )}

      {/* ── History view ── */}
      {view === 'history' && (
        <div>
          <h3 className="section-title">Past Approval Runs</h3>
          {history.length === 0 ? (
            <div className="content-placeholder">
              <p>No history yet</p>
              <p className="help-text">Completed runs will appear here as CSV audit logs.</p>
            </div>
          ) : (
            <div className="history-list">
              {history.map((item, i) => (
                <div key={i} className="history-row">
                  <span className="history-date">{item.date}</span>
                  <span className="history-rows">{item.rows} article(s)</span>
                  <span className="history-file">{item.filename}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Visual Media view ── */}
      {view === 'visual-media' && (
        <div>
          <div className="screenshots-subnav">
            <button
              className={`subnav-btn ${screenshotSection === 'pendingApproval' ? 'active' : ''}`}
              onClick={() => setScreenshotSection('pendingApproval')}
            >
              Pending Approval
              {screenshots && (
                <span className="subnav-count">{screenshots.pendingApproval?.length ?? 0}</span>
              )}
            </button>
            <button
              className={`subnav-btn ${screenshotSection === 'invalidDate' ? 'active' : ''}`}
              onClick={() => setScreenshotSection('invalidDate')}
            >
              Invalid Date
              {screenshots && (
                <span className="subnav-count">{screenshots.invalidDate?.length ?? 0}</span>
              )}
            </button>
            <button
              className={`subnav-btn ${screenshotSection === 'articles' ? 'active' : ''}`}
              onClick={() => setScreenshotSection('articles')}
            >
              Article(s)
              {screenshots && (
                <span className="subnav-count">{screenshots.articles?.length ?? 0}</span>
              )}
            </button>
            <button
              className={`subnav-btn ${screenshotSection === 'resolved' ? 'active' : ''}`}
              onClick={() => setScreenshotSection('resolved')}
            >
              Resolved
              {screenshots && (
                <span className="subnav-count">{screenshots.resolved?.length ?? 0}</span>
              )}
            </button>
          </div>

          {!screenshots ? (
            <div className="content-placeholder">
              <p>Loading screenshots...</p>
            </div>
          ) : (
            <ScreenshotList
              items={screenshots[screenshotSection] ?? []}
              onAction={handleScreenshotAction}
            />
          )}
        </div>
      )}

      {/* ── Translation Results view ── */}
      {view === 'translation-results' && translationResults && (
        <div>
          <h3 className="section-title">✅ Translation Results</h3>
          <div className="result-summary">
            <div className="result-stat">
              <span className="result-label">Articles Translated</span>
              <span className="result-value">{translationResults.articlesTranslated}</span>
            </div>
            <div className="result-stat">
              <span className="result-label">Articles Failed</span>
              <span className="result-value">{translationResults.articlesFailed}</span>
            </div>
            <div className="result-stat">
              <span className="result-label">Total Scanned</span>
              <span className="result-value">{translationResults.totalArticles}</span>
            </div>
            <div className="result-stat">
              <span className="result-label">Completed</span>
              <span className="result-value">{new Date(translationResults.completedAt).toLocaleTimeString()}</span>
            </div>
          </div>
          <div className="result-csv">
            <p className="help-text">📄 Audit Log: <strong>{translationResults.csvName}</strong></p>
          </div>
          <div className="result-actions">
            <button
              className="btn btn-secondary"
              onClick={() => {
                // Download the CSV file
                window.location.href = `/api/approvals/download-csv/${translationResults.csvName}`
              }}
            >
              📥 Download CSV
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => setView('pending')}
            >
              ← Back to Pending
            </button>
          </div>
        </div>
      )}

      {/* ── Scan Results view ── */}
      {view === 'scan-results' && (
        <div>
          <h3 className="section-title">📋 Best Practices Section - Translation Status</h3>
          {scanLoading && (
            <div className="content-placeholder">
              <p>🔍 Scanning Best Practices section...</p>
            </div>
          )}
          {scanError && (
            <div className="error-message">
              <p>❌ Error: {scanError}</p>
              <button className="btn btn-primary btn-sm" onClick={scanRecentArticles}>
                Retry Scan
              </button>
            </div>
          )}
          {scannedArticles && scannedArticles.length > 0 ? (
            <div>
              <div className="scan-summary">
                <p className="help-text">
                  Found <strong>{scannedArticles.length}</strong> articles •
                  <strong>{scannedArticles.filter(a => a.needsTranslation).length}</strong> need translation
                </p>
              </div>
              <div className="articles-table">
                <table className="scan-table">
                  <thead>
                    <tr>
                      <th>Article Title</th>
                      <th>English Updated</th>
                      <th>French Updated</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scannedArticles.map(article => (
                      <tr key={article.id} className={article.needsTranslation ? 'needs-translation' : 'up-to-date'}>
                        <td className="article-title-cell">
                          <div>
                            <strong>{article.title}</strong>
                            <p className="article-id-small">ID: {article.id}</p>
                          </div>
                        </td>
                        <td className="date-cell">
                          {new Date(article.englishUpdatedAt).toLocaleString()}
                        </td>
                        <td className="date-cell">
                          {article.frenchUpdatedAt
                            ? new Date(article.frenchUpdatedAt).toLocaleString()
                            : <span className="no-translation">No translation</span>
                          }
                        </td>
                        <td className="status-cell">
                          {article.needsTranslation ? (
                            <span className="badge badge-warning">⚠️ Needs Update</span>
                          ) : (
                            <span className="badge badge-success">✓ Up to date</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="scan-actions">
                <button
                  className="btn btn-primary"
                  onClick={handleTriggerWorkflow}
                  disabled={triggering || translationRunning}
                >
                  {triggering || translationRunning ? 'Starting...' : '▶ Run Translation Now'}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => setView('pending')}
                >
                  ← Back
                </button>
              </div>
            </div>
          ) : (
            scannedArticles && (
              <div className="content-placeholder">
                <p>No articles found in Best Practices section</p>
              </div>
            )
          )}
        </div>
      )}

      {/* ── Approvers view ── */}
      {view === 'approvers' && (
        <div>
          <h3 className="section-title">Approvers</h3>
          <p className="help-text" style={{ marginBottom: '1.5rem' }}>
            Admins can approve translations. Reviewers receive notifications only.
            To manage approvers via Slack, use the <strong>@helpcenter-edit-approvers</strong> user group.
          </p>
          <div className="approvers-list">
            {approvers.map((a, i) => (
              <div key={i} className="approver-row">
                <div>
                  <strong>{a.name}</strong>
                  <span className="meta-date">{a.email}</span>
                </div>
                <span className={`badge ${a.role === 'admin' ? 'badge-primary' : 'badge-default'}`}>
                  {a.role}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Translation Training Input view ── */}
      {view === 'training-input' && (
        <div>
          <TranslationTrainingInput />
        </div>
      )}
    </div>
  )
}

export default TranslationTab
