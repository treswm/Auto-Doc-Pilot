import { useState } from 'react'
import './FeedbackForm.css'

/**
 * Reusable feedback form used in all three tabs.
 * Submits to /api/feedback/:type and shows confirmation.
 *
 * Props:
 *   type       — 'translation' | 'outdated' | 'release'
 *   entityId   — the run ID or article ID this feedback is about
 *   label      — heading text
 *   hint       — helper text shown below the heading
 */
function FeedbackForm({ type, entityId, label, hint }) {
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(null)       // 'good' | 'bad'
  const [correction, setCorrection] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!rating) return
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch(`/api/feedback/${type}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId, rating, correction }),
      })
      if (!res.ok) throw new Error('Feedback submission failed')
      setSubmitted(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <div className="feedback-trigger">
        <button className="feedback-toggle-btn" onClick={() => setOpen(true)}>
          💬 Leave feedback to improve future AI results
        </button>
      </div>
    )
  }

  return (
    <div className="feedback-form-container">
      <div className="feedback-header">
        <h4>{label || 'Feedback'}</h4>
        <button className="close-btn" onClick={() => setOpen(false)}>✕</button>
      </div>

      {hint && <p className="feedback-hint">{hint}</p>}

      {submitted ? (
        <div className="feedback-success">
          ✅ Thank you! Your feedback has been saved and will improve future results.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="feedback-form">
          {/* Rating */}
          <div className="rating-row">
            <button
              type="button"
              className={`rating-btn ${rating === 'good' ? 'selected good' : ''}`}
              onClick={() => setRating('good')}
            >👍 Looks good</button>
            <button
              type="button"
              className={`rating-btn ${rating === 'bad' ? 'selected bad' : ''}`}
              onClick={() => setRating('bad')}
            >👎 Needs improvement</button>
          </div>

          {/* Correction / comment */}
          {rating === 'bad' && (
            <div className="form-group">
              <label htmlFor={`correction-${entityId}`}>
                What was wrong? (Optional — corrections update the glossary)
              </label>
              <textarea
                id={`correction-${entityId}`}
                value={correction}
                onChange={(e) => setCorrection(e.target.value)}
                placeholder={
                  type === 'translation'
                    ? 'e.g. "Policyholder" should be "Preneur d\'assurance" not "Titulaire"'
                    : 'Describe what was incorrect or missing...'
                }
                rows={3}
              />
            </div>
          )}

          {error && <p className="feedback-error">{error}</p>}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={!rating || submitting}
          >
            {submitting ? 'Saving...' : 'Submit Feedback'}
          </button>
        </form>
      )}
    </div>
  )
}

export default FeedbackForm
