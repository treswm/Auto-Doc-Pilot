import { useState, useEffect } from 'react'
import '../styles/ReleaseNotesInputSection.css'

/**
 * Release Notes Input Section
 * Paste release notes and auto-extract keywords for article scanning
 */
function ReleaseNotesInputSection({ onKeywordsExtracted, onAnalysisComplete }) {
  const [isAdding, setIsAdding] = useState(false)
  const [releaseNotes, setReleaseNotes] = useState('')
  const [version, setVersion] = useState('')
  const [extractedKeywords, setExtractedKeywords] = useState([])
  const [analysis, setAnalysis] = useState(null)
  const [addedAt, setAddedAt] = useState(null)
  const [processedAt, setProcessedAt] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)

  // Load initial content from API
  useEffect(() => {
    loadReleaseNotes()
  }, [])

  async function loadReleaseNotes() {
    try {
      setIsLoading(true)
      const res = await fetch('/api/release-notes/input', {
        credentials: 'include'
      })
      const data = await res.json()

      if (data.success) {
        setReleaseNotes(data.releaseNotes || '')
        setVersion(data.version || '')
        setExtractedKeywords(data.extractedKeywords || [])
        setAddedAt(data.addedAt || null)
        setProcessedAt(data.processedAt || null)
      }
    } catch (err) {
      console.error('Error loading release notes:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    setSuccessMessage(null)

    if (!version.trim()) {
      setError('Please enter a version number or label')
      setIsSaving(false)
      return
    }

    try {
      const res = await fetch('/api/release-notes/input', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ releaseNotes, version })
      })

      const data = await res.json()

      if (data.success) {
        setIsAdding(false)
        setAddedAt(data.addedAt)
        setSuccessMessage('✅ Release notes added successfully! Now extract keywords and scan articles.')
        setTimeout(() => setSuccessMessage(null), 4000)
      } else {
        setError(data.error || 'Failed to save release notes')
      }
    } catch (err) {
      console.error('Error saving release notes:', err)
      setError(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleAnalyzeImpact = async () => {
    if (!releaseNotes.trim()) {
      setError('Please paste release notes first')
      return
    }

    setIsAnalyzing(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const res = await fetch('/api/release-notes/analyze-impact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ releaseNotes })
      })

      const data = await res.json()

      if (data.success) {
        setAnalysis({
          affectedFeatures: data.affectedFeatures || [],
          recommendedArticles: data.recommendedArticles || [],
          searchQueries: data.searchQueries || []
        })
        setSuccessMessage(`✨ Analysis complete! Found ${data.affectedFeatures?.length || 0} affected features.`)

        // Callback to parent component with analysis
        if (onAnalysisComplete) {
          onAnalysisComplete({
            affectedFeatures: data.affectedFeatures,
            recommendedArticles: data.recommendedArticles,
            searchQueries: data.searchQueries
          })
        }

        setTimeout(() => setSuccessMessage(null), 3000)
      } else {
        setError(data.error || 'Failed to analyze release impact')
      }
    } catch (err) {
      console.error('Error analyzing release impact:', err)
      setError(err.message)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleCancel = () => {
    loadReleaseNotes()
    setIsAdding(false)
    setError(null)
  }

  const markAsProcessed = async () => {
    try {
      const res = await fetch('/api/release-notes/input', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ releaseNotes, version, markProcessed: true })
      })

      const data = await res.json()
      if (data.success) {
        setProcessedAt(data.processedAt)
        setSuccessMessage('✅ Release marked as processed. Audit trail recorded.')
        setTimeout(() => setSuccessMessage(null), 3000)
      }
    } catch (err) {
      console.error('Error marking as processed:', err)
    }
  }

  if (isLoading) {
    return (
      <div className="release-notes-section">
        <div className="section-header">
          <h3>📝 Release Notes Input</h3>
          <p className="section-subtitle">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="release-notes-section">
      <div className="section-header">
        <h3>📝 Release Notes Input</h3>
        <p className="section-subtitle">
          Paste release notes and extract keywords to find articles needing updates
        </p>
      </div>

      {error && (
        <div className="error-message">
          <p>❌ {error}</p>
        </div>
      )}

      {successMessage && (
        <div className="success-message">
          <p>✅ {successMessage}</p>
        </div>
      )}

      {!isAdding ? (
        <div className="release-notes-view">
          <div className="release-header">
            {version && (
              <div className="version-badge">
                <strong>Version:</strong> {version}
              </div>
            )}
            {addedAt && (
              <div className="timestamp-info">
                <small>📅 Added: {new Date(addedAt).toLocaleString()}</small>
              </div>
            )}
            {processedAt && (
              <div className="timestamp-info processed">
                <small>✅ Last Processed: {new Date(processedAt).toLocaleString()}</small>
              </div>
            )}
          </div>

          <div className="notes-display">
            <pre className="notes-content">
              {releaseNotes || '[No release notes entered yet]'}
            </pre>
          </div>

          <div className="view-actions">
            {releaseNotes ? (
              <>
                <button
                  className="btn btn-primary"
                  onClick={() => setIsAdding(true)}
                >
                  ✏️ Edit Release
                </button>
                <button
                  className="btn btn-accent"
                  onClick={markAsProcessed}
                >
                  ✅ Mark as Processed
                </button>
              </>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => setIsAdding(true)}
              >
                ➕ Add Release Notes
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="release-notes-edit">
          <div className="version-field">
            <label htmlFor="version-input">
              <strong>Version / Release Label</strong>
              <span className="required">*</span>
            </label>
            <input
              id="version-input"
              type="text"
              className="version-input"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="e.g., v2.5.0, Release 2.5, or Platform 2026-Q1"
              autoFocus
            />
            <small>Used for auditability and tracking documentation changes</small>
          </div>

          <label htmlFor="notes-textarea">
            <strong>Release Notes</strong>
          </label>
          <textarea
            id="notes-textarea"
            className="notes-textarea"
            value={releaseNotes}
            onChange={(e) => setReleaseNotes(e.target.value)}
            placeholder="Paste your release notes here (from Jira, GitHub, release notes doc, etc.)..."
          />

          <div className="edit-actions">
            <button
              className="btn btn-success"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : '💾 Save'}
            </button>
            <button
              className="btn btn-ghost"
              onClick={handleCancel}
              disabled={isSaving}
            >
              Cancel
            </button>
          </div>

          <p className="help-text">
            💡 After saving, click "Extract Keywords" to have OpenAI identify the key features
            and topics that might require Help Center article updates.
          </p>
        </div>
      )}

      {releaseNotes && !isAdding && (
        <div className="extract-section">
          <p className="extract-prompt">
            Ready to find affected articles? Analyze this release to identify documentation that needs updates:
          </p>
          <button
            className="btn btn-accent"
            onClick={handleAnalyzeImpact}
            disabled={isAnalyzing || !releaseNotes.trim()}
          >
            {isAnalyzing ? 'Analyzing Impact...' : '🔍 Analyze Release Impact with AI'}
          </button>
        </div>
      )}

      {analysis && !isAdding && (
        <div className="analysis-section">
          <div className="analysis-header">
            <h4>📊 Release Impact Analysis</h4>
          </div>

          {analysis.affectedFeatures.length > 0 && (
            <div className="analysis-block">
              <h5>🎯 Affected Features</h5>
              <ul className="analysis-list">
                {analysis.affectedFeatures.map((feature, i) => (
                  <li key={i}>{feature}</li>
                ))}
              </ul>
            </div>
          )}

          {analysis.recommendedArticles.length > 0 && (
            <div className="analysis-block">
              <h5>📚 Recommended Articles to Review</h5>
              <ul className="analysis-list">
                {analysis.recommendedArticles.map((article, i) => (
                  <li key={i}>{article}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="analysis-actions">
            <p className="analysis-status">
              ✅ Ready to search Help Center for {analysis.searchQueries.length} related topics
            </p>
          </div>
        </div>
      )}

      <div className="info-box">
        <p>
          <strong>📝 How this works:</strong> Paste release notes and save them. Click "Analyze Release Impact"
          to have OpenAI identify affected features and recommend which Help Center articles likely need updates.
          Then click "Find Affected Articles" to search your Help Center and create flagged articles for review.
        </p>
      </div>
    </div>
  )
}

export default ReleaseNotesInputSection
