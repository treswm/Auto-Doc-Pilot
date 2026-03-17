import { useState, useEffect } from 'react'
import '../styles/TranslationTrainingInput.css'

/**
 * Translation Training Input Component
 * Allows users to edit and save the glossary and translation instructions
 * that are used when translating Help Center articles to French Canadian
 */
function TranslationTrainingInput() {
  const [isEditing, setIsEditing] = useState(false)
  const [content, setContent] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)

  // Load training input on mount
  useEffect(() => {
    loadTrainingInput()
  }, [])

  async function loadTrainingInput() {
    try {
      setIsLoading(true)
      setError(null)
      const res = await fetch('/api/translations/input', {
        credentials: 'include'
      })
      const data = await res.json()

      if (data.success) {
        setContent(data.translationInput)
      } else {
        setError('Failed to load training input')
      }
    } catch (err) {
      console.error('Error loading training input:', err)
      setError('Failed to load training input')
    } finally {
      setIsLoading(false)
    }
  }

  async function saveTrainingInput() {
    try {
      setIsSaving(true)
      setError(null)
      setMessage(null)

      const res = await fetch('/api/translations/input', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ translationInput: content })
      })

      const data = await res.json()

      if (data.success) {
        setMessage('✅ Training input saved successfully!')
        setIsEditing(false)
        setTimeout(() => setMessage(null), 3000)
      } else {
        setError(data.error || 'Failed to save training input')
      }
    } catch (err) {
      console.error('Error saving training input:', err)
      setError('Failed to save training input')
    } finally {
      setIsSaving(false)
    }
  }

  function handleCancel() {
    loadTrainingInput()
    setIsEditing(false)
  }

  if (isLoading) {
    return (
      <div className="training-input-container">
        <p className="loading-text">Loading training input...</p>
      </div>
    )
  }

  return (
    <div className="training-input-container">
      <div className="training-input-header">
        <h3 className="section-title">📚 Translation Training Input</h3>
        <p className="help-text">
          Glossary and instructions used when translating Help Center articles to French Canadian
        </p>
      </div>

      {error && (
        <div className="error-message">
          <p>❌ {error}</p>
        </div>
      )}

      {message && (
        <div className="success-message">
          <p>{message}</p>
        </div>
      )}

      {isEditing ? (
        <div className="training-input-editor">
          <textarea
            className="training-input-textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Enter translation guidelines, glossary, and instructions..."
          />

          <div className="training-input-actions">
            <button
              className="btn btn-primary"
              onClick={saveTrainingInput}
              disabled={isSaving}
            >
              {isSaving ? '💾 Saving...' : '💾 Save Changes'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleCancel}
              disabled={isSaving}
            >
              ✕ Cancel
            </button>
          </div>

          <p className="help-text" style={{ marginTop: '1rem', fontSize: '0.85em' }}>
            Tip: Start with instructions about idioms and common mistakes, then list the glossary.
            These instructions will be included in every translation request to OpenAI.
          </p>
        </div>
      ) : (
        <div className="training-input-view">
          <div className="training-input-content">
            <pre>{content}</pre>
          </div>

          <div className="training-input-actions">
            <button
              className="btn btn-primary"
              onClick={() => setIsEditing(true)}
            >
              ✏️ Edit Training Input
            </button>
          </div>
        </div>
      )}

      <div className="training-input-info">
        <p className="help-text">
          <strong>Character count:</strong> {content.length} characters<br />
          <strong>Last saved:</strong> Every time you click "Save Changes"<br />
          <strong>Used in:</strong> All Help Center article translations to French Canadian
        </p>
      </div>
    </div>
  )
}

export default TranslationTrainingInput
