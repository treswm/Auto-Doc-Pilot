import { useState, useEffect } from 'react'
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
  const [articleTitle, setArticleTitle] = useState('')
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [zendeskSections, setZendeskSections] = useState([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState(null)
  const [draftResult, setDraftResult] = useState(null)

  const handleProcess = async () => {
    setError(null)
    setDraftResult(null)

    // Validation
    if (!version.trim()) {
      setError('Please enter a version / release label (e.g. "Release 2.86").')
      return
    }
    if (!releaseNotes.trim() && !pdfFile) {
      setError('Provide release notes text and/or a Train the Trainer PDF before processing.')
      return
    }
    if (!articleTitle.trim()) {
      setError('Please enter an article title for the Zendesk draft.')
      return
    }
    if (!selectedSectionId) {
      setError('Please select a target Help Center section.')
      return
    }

    setUploading(true)
    setProgress('Uploading PDF and extracting screenshots…')

    try {
      let screenshotCount = 0

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
        const pdfResult = await res.json()
        if (!pdfResult.success) {
          throw new Error(pdfResult.error || 'Failed to process PDF')
        }
        screenshotCount = pdfResult.screenshotCount || 0
      }

      // Step 2 — Save release notes text (user's pasted text is source of truth)
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

      // Step 3 — Build screenshot doc (matches screenshots to features)
      if (screenshotCount > 0) {
        setProgress('Building screenshot document preview…')
        const docRes = await fetch('/api/release-notes/build-screenshot-doc', {
          method: 'POST',
          credentials: 'include',
        })
        const docData = await docRes.json()
        if (!docData.success) {
          throw new Error(docData.error || 'Failed to build screenshot document')
        }

        // Step 4 — Create draft in Zendesk with all screenshots included
        setProgress('Creating draft in Zendesk with embedded screenshots…')
        const payloadSections = (docData.sections || []).map(sec => ({
          feature: sec.feature,
          description: sec.description,
          content: sec.content,
          // Include all screenshots by default
          screenshots: (sec.screenshots || []).map(sh => ({
            file: sh.file,
            page: sh.page,
            width: sh.width,
            height: sh.height,
          })),
        }))

        const draftRes = await fetch('/api/release-notes/create-screenshot-draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            sectionId: selectedSectionId,
            title: articleTitle.trim(),
            sections: payloadSections,
          }),
        })
        const draftData = await draftRes.json()
        if (!draftData.success) {
          throw new Error(draftData.error || 'Failed to create draft in Zendesk')
        }

        setDraftResult(draftData)
        setProgress('')
      } else {
        // No screenshots — just save and notify parent
        if (onUploadComplete) {
          onUploadComplete({
            version,
            releaseNotes: releaseNotes.trim(),
            screenshotCount: 0,
          })
        }
      }
    } catch (err) {
      console.error('Draft release notes error:', err)
      setError(err.message)
    } finally {
      setUploading(false)
      setProgress('')
    }
  }

  // Load available Help Center sections
  const loadSections = async () => {
    try {
      const res = await fetch('/api/release-notes/zendesk-sections', {
        credentials: 'include',
      })
      const data = await res.json()
      if (data.success && Array.isArray(data.sections)) {
        setZendeskSections(data.sections)
      }
    } catch (err) {
      console.error('Failed to load Zendesk sections:', err)
    }
  }

  // Load sections on mount
  useEffect(() => {
    loadSections()
  }, [])

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

        {/* Article title */}
        <div className="drns-field">
          <label htmlFor="drns-title">
            <strong>Article Title</strong>
            <span className="drns-required">*</span>
          </label>
          <input
            id="drns-title"
            type="text"
            className="drns-input"
            value={articleTitle}
            onChange={(e) => setArticleTitle(e.target.value)}
            placeholder="e.g., Release 2.86 — What's New"
          />
          <small className="drns-help">
            This will be the title of the draft article created in Zendesk.
          </small>
        </div>

        {/* Target Help Center section */}
        <div className="drns-field">
          <label htmlFor="drns-section">
            <strong>Target Help Center Section</strong>
            <span className="drns-required">*</span>
          </label>
          <select
            id="drns-section"
            className="drns-input"
            value={selectedSectionId}
            onChange={(e) => setSelectedSectionId(e.target.value)}
          >
            <option value="">Choose a section…</option>
            {zendeskSections.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <small className="drns-help">
            Where should the draft article be created in Help Center?
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
              '🚀 Process & Create Draft in Zendesk'
            )}
          </button>
        </div>

        {draftResult && (
          <div className="drns-success-box">
            ✅ <strong>Draft created successfully!</strong>
            <p>
              📄 <strong>{draftResult.brand}</strong> with {draftResult.uploadedImages} embedded screenshot{draftResult.uploadedImages !== 1 ? 's' : ''}.
            </p>
            {draftResult.editUrl && (
              <p>
                <a href={draftResult.editUrl} target="_blank" rel="noopener noreferrer" className="drns-draft-link">
                  → Open draft in Zendesk
                </a>
              </p>
            )}
            <p className="drns-next-step">
              Now copy the draft URL and paste it into the <strong>"Release Notes Input"</strong> section below to analyze which Help Center articles need updating.
            </p>
          </div>
        )}

        {/* Parent injects the screenshot-doc panel here so users stay inside this section */}
        {children}
      </div>
    </details>
  )
}

export default DraftReleaseNotesSection
