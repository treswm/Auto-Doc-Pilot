import { useState } from 'react'
import '../styles/Tabs.css'

const CHATGPT_PROJECT_URL = 'https://chatgpt.com/g/g-p-69e7c1e796988191b20675b622f6a535-help-center-article-writer/project'

function buildPrompt(description) {
  return `Write a Help Center article for Hi Marley's Zendesk Help Center.

Article description:
${description.trim()}

Return the article as HTML formatted for Zendesk:
- Article body HTML only — no <html>, <head>, or <body> tags
- <h2> for section headers
- <h3> for sub-sections
- <p> for paragraphs
- <ul><li> for bullet points
- <ol><li> for numbered procedures
- <strong> for bold labels, button names, and UI element names`
}

export default function CreateArticleTab() {
  const [description, setDescription] = useState('')
  const [prompt, setPrompt] = useState(null)
  const [copied, setCopied] = useState(false)

  // Paste-back state
  const [pastedHtml, setPastedHtml] = useState('')
  const [htmlCopied, setHtmlCopied] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  // Feedback state
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackRating, setFeedbackRating] = useState(null)
  const [feedbackSaving, setFeedbackSaving] = useState(false)
  const [feedbackSaved, setFeedbackSaved] = useState(false)

  const handleGenerate = () => {
    if (!description.trim()) return
    setPrompt(buildPrompt(description))
    setPastedHtml('')
    setShowPreview(false)
    setFeedbackText('')
    setFeedbackRating(null)
    setFeedbackSaved(false)
  }

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleCopyHtml = () => {
    navigator.clipboard.writeText(pastedHtml).then(() => {
      setHtmlCopied(true)
      setTimeout(() => setHtmlCopied(false), 2000)
    })
  }

  const handleSaveFeedback = async () => {
    if (!feedbackText.trim() && !feedbackRating) return
    setFeedbackSaving(true)
    try {
      await fetch('/api/create-article/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim(),
          feedback: feedbackText.trim(),
          rating: feedbackRating,
        }),
      })
      setFeedbackSaved(true)
    } catch (err) {
      console.error('Feedback save error:', err)
    } finally {
      setFeedbackSaving(false)
    }
  }

  return (
    <div className="create-article-tab">
      <div className="create-article-header">
        <h1 className="create-article-title">Create New Article</h1>
        <p className="create-article-subtitle">
          Describe the article you want to write, copy the prompt, and paste it into the Hi Marley ChatGPT project — it already knows Hi Marley's voice, formatting, and Help Center structure.
        </p>
      </div>

      {/* ── Step 1: Description input ─────────────────────────────── */}
      <div className="ca-card">
        <label className="ca-label" htmlFor="ca-description">
          What article do you want to create?
        </label>
        <textarea
          id="ca-description"
          className="ca-textarea"
          placeholder="Describe the article in plain English. Include what feature or workflow it covers, who the audience is (operators, admins, policyholders), and any specific sections you want included.&#10;&#10;Example: An article explaining how operators can use the Address Case feature to flag and escalate unresolved conversations. It should cover what Address Case is, how to use it from the Inbox, and what happens after it's addressed."
          rows={5}
          value={description}
          onChange={e => setDescription(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate() }}
        />
        <button
          className="btn btn-primary ca-generate-btn"
          onClick={handleGenerate}
          disabled={!description.trim()}
        >
          ✨ Build Prompt
        </button>
      </div>

      {/* ── Step 2: Copy prompt + open project ────────────────────── */}
      {prompt && (
        <>
          <div className="ca-card ca-prompt-card">
            <h2 className="ca-section-heading">Your Prompt is Ready</h2>
            <p className="ca-section-desc">
              Copy the prompt, then open the Hi Marley ChatGPT project in a new conversation and paste it in.
              The project already has Hi Marley's writing style, tone, and formatting rules — no extra instructions needed.
            </p>

            <div className="ca-action-row">
              <button className="btn btn-primary ca-copy-btn" onClick={handleCopyPrompt}>
                {copied ? '✓ Copied!' : '📋 Copy Prompt'}
              </button>
              <a
                href={CHATGPT_PROJECT_URL}
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost ca-project-link"
              >
                Open ChatGPT Project →
              </a>
            </div>

            <details className="ca-prompt-preview">
              <summary className="ca-prompt-preview-toggle">Preview prompt</summary>
              <pre className="ca-prompt-text">{prompt}</pre>
            </details>
          </div>

          {/* ── Step 3: Paste HTML result back (optional) ─────────── */}
          <div className="ca-card">
            <h2 className="ca-section-heading">Paste Article HTML</h2>
            <p className="ca-section-desc">
              Once ChatGPT returns the article HTML, paste it here to preview it and copy it to Zendesk.
            </p>
            <textarea
              className="ca-textarea ca-html-paste"
              placeholder="Paste the HTML from ChatGPT here…"
              rows={7}
              value={pastedHtml}
              onChange={e => { setPastedHtml(e.target.value); setShowPreview(false) }}
            />
            {pastedHtml.trim() && (
              <div className="ca-html-actions">
                <button className="btn btn-primary" onClick={() => setShowPreview(p => !p)}>
                  {showPreview ? 'Hide Preview' : '👁 Preview Article'}
                </button>
                <button className="btn btn-ghost" onClick={handleCopyHtml}>
                  {htmlCopied ? '✓ Copied!' : '📋 Copy HTML'}
                </button>
              </div>
            )}
            {showPreview && pastedHtml.trim() && (
              <div className="ca-preview-box">
                <div className="ca-preview-label">Preview</div>
                <div className="ca-preview-content" dangerouslySetInnerHTML={{ __html: pastedHtml }} />
              </div>
            )}
          </div>

          {/* ── Feedback ─────────────────────────────────────────── */}
          <div className="ca-card ca-feedback-card">
            <h2 className="ca-section-heading">Feedback</h2>
            <p className="ca-section-desc">
              Did the article come out well? Rate the result to help improve future prompts.
            </p>
            <div className="ca-rating-row">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  className={`ca-star ${feedbackRating >= n ? 'ca-star-active' : ''}`}
                  onClick={() => setFeedbackRating(feedbackRating === n ? null : n)}
                  disabled={feedbackSaved}
                  title={['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'][n]}
                >★</button>
              ))}
              {feedbackRating && (
                <span className="ca-rating-label">
                  {['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'][feedbackRating]}
                </span>
              )}
            </div>
            <textarea
              className="ca-textarea ca-feedback-textarea"
              placeholder="Optional notes — what worked well or what could be improved? (e.g. 'Great structure but the tone was too formal' or 'Missed covering the mobile view entirely')"
              rows={3}
              value={feedbackText}
              onChange={e => setFeedbackText(e.target.value)}
              disabled={feedbackSaved}
            />
            {feedbackSaved ? (
              <p className="ca-feedback-saved">✓ Feedback saved — thanks!</p>
            ) : (
              <button
                className="btn btn-primary btn-sm"
                onClick={handleSaveFeedback}
                disabled={feedbackSaving || (!feedbackText.trim() && !feedbackRating)}
              >
                {feedbackSaving ? 'Saving…' : '💾 Save Feedback'}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
