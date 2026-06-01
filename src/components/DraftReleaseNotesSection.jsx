import { useState } from 'react'
import '../styles/DraftReleaseNotesSection.css'

/**
 * Draft Release Notes in Help Center
 *
 * Collapsible section (collapsed by default) at the top of the Releases tab.
 * Accepts BOTH:
 *   - Release notes text (paste) — the source of truth for what shipped
 *   - Train the Trainer deck PDF — supplies screenshots for the draft article
 *
 * After upload, the parent renders the screenshot-doc panel inside this section
 * (passed in via `children`) so the user can preview and create the Zendesk
 * draft without leaving the collapsible.
 */
function DraftReleaseNotesSection({ onUploadComplete, hasScreenshots, children }) {
  const [version, setVersion] = useState('')
  const [releaseNotes, setReleaseNotes] = useState('')
  const [pdfFile, setPdfFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState(null)
  const [uploadedSummary, setUploadedSummary] = useState(null)

  const handleProcess = async () => {
    setError(null)

    if (!version.trim()) {
      setError('Please enter a version / release label (e.g. "Release 2.86").')
      return
    }
    if (!releaseNotes.trim() && !pdfFile) {
      setError('Provide release notes text and/or a Train the Trainer PDF before processing.')
      return
    }

    setUploading(true)
    setProgress(pdfFile ? 'Uploading PDF and extracting screenshots…' : 'Saving release notes…')

    try {
      let pdfResult = null

      // Step 1 — If a PDF was provided, upload it (extracts text + screenshots)
      if (pdfFile) {
        const fd = new FormData()
        fd.append('pdf', pdfFile)
        fd.append('version', version)
        const res = await fetch('/api/release-notes/upload-pdf', {
          method: 'POST',
          credentials: 'include',
          body: fd,
        })
        pdfResult = await res.json()
        if (!pdfResult.success) {
          throw new Error(pdfResult.error || 'Failed to process PDF')
        }
      }

      // Step 2 — If user pasted text, override session text with their pasted version
      // (the user's pasted text is the source of truth for what shipped; PDF text may
      // include internal marketing slides we don't want in the draft).
      if (releaseNotes.trim()) {
        setProgress('Saving release notes text…')
        const saveRes = await fetch('/api/release-notes/input', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ releaseNotes, version }),
        })
        const saveData = await saveRes.json()
        if (!saveData.success) {
          throw new Error(saveData.error || 'Failed to save release notes text')
        }
      }

      // Summarize what was processed
      const screenshotCount = pdfResult?.screenshotCount || 0
      setUploadedSummary({
        version,
        hasText: !!releaseNotes.trim(),
        hasPdf: !!pdfFile,
        screenshotCount,
        pdfFileName: pdfFile?.name || null,
      })

      // Notify parent so it can render the screenshot doc panel
      if (onUploadComplete) {
        onUploadComplete({
          version,
          releaseNotes: releaseNotes.trim() || pdfResult?.text || '',
          screenshotCount,
        })
      }
    } catch (err) {
      console.error('Draft release notes upload error:', err)
      setError(err.message)
    } finally {
      setUploading(false)
      setProgress('')
    }
  }

  return (
    <details className="drns-section">
      <summary className="drns-summary">
        <span className="drns-summary-icon">📝</span>
        <span className="drns-summary-text">
          <strong>Draft release notes in Help Center</strong>
          <small>Optional — paste release notes text + Train the Trainer PDF to generate a draft article with screenshots embedded</small>
        </span>
      </summary>

      <div className="drns-content">
        <p className="drns-intro">
          This is the <strong>first step</strong> when prepping Help Center docs for a new release.
          Paste your release notes text and upload the <em>Train the Trainer</em> deck (PDF). Auto Doc Pilot
          will extract the screenshots, match them to customer-facing features, and create a draft
          Help Center article you can polish in Zendesk. Once the draft is created, paste its URL into
          the <strong>Release Notes Input</strong> section below to continue the analysis flow.
        </p>

        {/* Version */}
        <div className="drns-field">
          <label htmlFor="drns-version">
            <strong>Version / Release Label</strong>
            <span className="drns-required">*</span>
          </label>
          <input
            id="drns-version"
            type="text"
            className="drns-input"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="e.g., Release 2.86 or Platform 2026-Q1"
          />
        </div>

        {/* Release notes text */}
        <div className="drns-field">
          <label htmlFor="drns-text">
            <strong>Release Notes (paste text)</strong>
          </label>
          <textarea
            id="drns-text"
            className="drns-textarea"
            value={releaseNotes}
            onChange={(e) => setReleaseNotes(e.target.value)}
            placeholder="Paste the customer-facing release notes here — this is the source of truth for what shipped."
          />
          <small className="drns-help">
            💡 Paste the text version of release notes (from Jira, docs, etc.). The customer-facing release
            notes are the source of truth — only features mentioned here will appear in the draft.
          </small>
        </div>

        {/* Train the Trainer PDF */}
        <div className="drns-field">
          <label htmlFor="drns-pdf">
            <strong>Train the Trainer Deck (PDF)</strong>
          </label>
          <input
            id="drns-pdf"
            type="file"
            accept=".pdf"
            className="drns-file"
            onChange={(e) => setPdfFile(e.target.files[0])}
          />
          {pdfFile && (
            <div className="drns-pdf-selected">
              📄 <strong>{pdfFile.name}</strong> <small>({(pdfFile.size / 1024).toFixed(1)} KB)</small>
            </div>
          )}
          <small className="drns-help">
            📸 The Train the Trainer PowerPoint contains UI screenshots. Upload it as a PDF and Auto Doc
            Pilot will extract and match the screenshots to customer-facing features.
          </small>
        </div>

        {error && <div className="drns-error">❌ {error}</div>}

        <div className="drns-actions">
          <button
            className="btn btn-primary"
            onClick={handleProcess}
            disabled={uploading}
          >
            {uploading ? (
              <><span className="loading-spinner"></span> {progress || 'Processing…'}</>
            ) : (
              '🚀 Process & Build Draft'
            )}
          </button>
        </div>

        {uploadedSummary && (
          <div className="drns-summary-box">
            ✅ Processed for <strong>{uploadedSummary.version}</strong>
            {uploadedSummary.hasText && ' · release notes text saved'}
            {uploadedSummary.hasPdf && (
              <> · PDF <em>{uploadedSummary.pdfFileName}</em> ({uploadedSummary.screenshotCount} screenshot{uploadedSummary.screenshotCount !== 1 ? 's' : ''} extracted)</>
            )}
            {hasScreenshots && (
              <p className="drns-summary-next">
                ↓ Use the panel below to preview matches and create the draft in Zendesk.
              </p>
            )}
          </div>
        )}

        {/* Parent injects the screenshot-doc panel here so users stay inside this section */}
        {children}
      </div>
    </details>
  )
}

export default DraftReleaseNotesSection
