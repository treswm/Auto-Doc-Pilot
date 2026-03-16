import { useState, useEffect } from 'react'
import '../styles/TranslationInputSection.css'

/**
 * Translation Input Section
 * Editable glossary and translation instructions for AI translations
 */
function TranslationInputSection({ onUpdate }) {
  const [isEditing, setIsEditing] = useState(false)
  const [content, setContent] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  // Load initial content from API
  useEffect(() => {
    loadTranslationInput()
  }, [])

  async function loadTranslationInput() {
    try {
      setIsLoading(true)
      const res = await fetch('/api/translations/input', {
        credentials: 'include'
      })
      const data = await res.json()
      
      if (data.success) {
        setContent(data.translationInput)
      } else {
        // Set default template if fetch fails
        setContent(getDefaultContent())
      }
    } catch (err) {
      console.error('Error loading translation input:', err)
      setContent(getDefaultContent())
    } finally {
      setIsLoading(false)
    }
  }

  function getDefaultContent() {
    return `Translation Corrects:
• Idioms like "out of the box" should not be directly translated. Out of the box should instead be translated to: clé en main
• [Add more translation rules here]

Hi Marley Glossary:
[Paste the glossary content here - include all Hi Marley specific terms and their translations]

Additional Notes:
[Any other guidance for translators]`
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    
    try {
      const res = await fetch('/api/translations/input', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ translationInput: content })
      })

      const data = await res.json()
      
      if (data.success) {
        // Callback to parent component
        if (onUpdate) {
          onUpdate(content)
        }
        
        setIsEditing(false)
        console.log('✅ Translation input saved successfully')
      } else {
        setError(data.error || 'Failed to save translation input')
      }
    } catch (err) {
      console.error('Error saving translation input:', err)
      setError(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    loadTranslationInput()
    setIsEditing(false)
    setError(null)
  }

  if (isLoading) {
    return (
      <div className="translation-input-section">
        <div className="section-header">
          <h3>📚 Translation Input</h3>
          <p className="section-subtitle">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="translation-input-section">
      <div className="section-header">
        <h3>📚 Translation Input</h3>
        <p className="section-subtitle">
          Glossary and instructions to improve AI translations
        </p>
      </div>

      {error && (
        <div className="error-message">
          <p>❌ {error}</p>
        </div>
      )}

      {!isEditing ? (
        <div className="translation-input-view">
          <div className="input-display">
            <pre className="input-content">{content}</pre>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => setIsEditing(true)}
          >
            ✏️ Edit Translation Input
          </button>
        </div>
      ) : (
        <div className="translation-input-edit">
          <textarea
            className="input-textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Enter translation instructions, glossary, and rules here..."
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
            💡 This content will be sent to OpenAI with translation requests to provide context and improve translation quality.
          </p>
        </div>
      )}

      <div className="info-box">
        <p>
          <strong>📝 How this works:</strong> The translation input is included with every translation request to OpenAI. 
          It helps the AI understand Hi Marley's terminology, brand voice, and any special translation rules.
        </p>
      </div>
    </div>
  )
}

export default TranslationInputSection
