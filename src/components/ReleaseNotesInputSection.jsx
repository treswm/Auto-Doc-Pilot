import { useState, useEffect } from 'react'
import '../styles/ReleaseNotesInputSection.css'

/**
 * Release Notes Input Section
 * Paste release notes and auto-extract keywords for article scanning
 */
function ReleaseNotesInputSection({ onKeywordsExtracted }) {
  const [isEditing, setIsEditing] = useState(false)
  const [releaseNotes, setReleaseNotes] = useState('')
  const [extractedKeywords, setExtractedKeywords] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isExtracting, setIsExtracting] = useState(false)
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
        setExtractedKeywords(data.extractedKeywords || [])
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
    
    try {
      const res = await fetch('/api/release-notes/input', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ releaseNotes })
      })

      const data = await res.json()
      
      if (data.success) {
        setIsEditing(false)
        setSuccessMessage('Release notes saved successfully!')
        setTimeout(() => setSuccessMessage(null), 3000)
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

  const handleExtractKeywords = async () => {
    if (!releaseNotes.trim()) {
      setError('Please paste release notes first')
      return
    }

    setIsExtracting(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const res = await fetch('/api/release-notes/extract-keywords', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ releaseNotes })
      })

      const data = await res.json()

      if (data.success) {
        setExtractedKeywords(data.keywords || [])
        setSuccessMessage(`✨ Extracted ${data.keywords?.length || 0} keywords!`)
        
        // Callback to parent component with keywords
        if (onKeywordsExtracted) {
          onKeywordsExtracted(data.keywordsForSearch)
        }
        
        setTimeout(() => setSuccessMessage(null), 3000)
      } else {
        setError(data.error || 'Failed to extract keywords')
      }
    } catch (err) {
      console.error('Error extracting keywords:', err)
      setError(err.message)
    } finally {
      setIsExtracting(false)
    }
  }

  const handleCancel = () => {
    loadReleaseNotes()
    setIsEditing(false)
    setError(null)
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

      {!isEditing ? (
        <div className="release-notes-view">
          <div className="notes-display">
            <pre className="notes-content">
              {releaseNotes || '[No release notes entered yet]'}
            </pre>
          </div>

          <div className="view-actions">
            <button
              className="btn btn-primary"
              onClick={() => setIsEditing(true)}
            >
              ✏️ Edit Release Notes
            </button>
          </div>

          {extractedKeywords.length > 0 && (
            <div className="keywords-display">
              <h4>🏷️ Extracted Keywords</h4>
              <div className="keywords-chips">
                {extractedKeywords.map((keyword, i) => (
                  <span key={i} className="keyword-chip">{keyword}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="release-notes-edit">
          <textarea
            className="notes-textarea"
            value={releaseNotes}
            onChange={(e) => setReleaseNotes(e.target.value)}
            placeholder="Paste your release notes here (from Jira, GitHub, release notes doc, etc.)..."
            autoFocus
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

      {releaseNotes && !isEditing && (
        <div className="extract-section">
          <button
            className="btn btn-accent"
            onClick={handleExtractKeywords}
            disabled={isExtracting || !releaseNotes.trim()}
          >
            {isExtracting ? 'Extracting Keywords...' : '✨ Extract Keywords with AI'}
          </button>
        </div>
      )}

      <div className="info-box">
        <p>
          <strong>📝 How this works:</strong> Paste any release notes, save them, then click 
          "Extract Keywords" to have OpenAI identify the key features and topics. The extracted 
          keywords automatically populate the search field to find relevant Help Center articles.
        </p>
      </div>
    </div>
  )
}

export default ReleaseNotesInputSection
