import { useState, useEffect } from 'react'
import '../styles/ReleaseNotesInputSection.css'

/**
 * Release Notes Input Section
 * Paste release notes and auto-extract keywords for article scanning
 */
function ReleaseNotesInputSection({ onKeywordsExtracted, onAnalysisComplete, onManualSaveComplete, manualMode, flaggedArticles, releaseId, analysis: analysisFromParent }) {
  const [isAdding, setIsAdding] = useState(false)
  const [releaseNotes, setReleaseNotes] = useState('')
  const [version, setVersion] = useState('')
  const [extractedKeywords, setExtractedKeywords] = useState([])
  const [analysis, setAnalysis] = useState(null)
  const [addedAt, setAddedAt] = useState(null)
  const [processedAt, setProcessedAt] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingAndAnalyzing, setIsSavingAndAnalyzing] = useState(false)
  const [error, setError] = useState(null)
  const [pdfFile, setPdfFile] = useState(null)
  const [pdfImageData, setPdfImageData] = useState(null)
  const [inputMode, setInputMode] = useState('text') // 'text', 'pdf', or 'url'
  const [articleUrl, setArticleUrl] = useState('')
  const [successMessage, setSuccessMessage] = useState(null)
  const [progressStatus, setProgressStatus] = useState('')

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

  const handleSaveAndAnalyze = async () => {
    if (!version.trim()) {
      setError('Please enter a version number or label')
      setTimeout(() => {
        document.querySelector('.error-message')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
      return
    }

    if (!releaseNotes.trim()) {
      setError('Please paste release notes first')
      setTimeout(() => {
        document.querySelector('.error-message')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
      return
    }

    setIsSavingAndAnalyzing(true)
    setError(null)
    setSuccessMessage(null)
    setProgressStatus('Saving release notes...')

    try {
      // Step 1: Save release notes
      const saveRes = await fetch('/api/release-notes/input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ releaseNotes, version })
      })

      const saveData = await saveRes.json()
      if (!saveData.success) {
        setError(saveData.error || 'Failed to save release notes')
        setIsSavingAndAnalyzing(false)
        return
      }

      setAddedAt(saveData.addedAt)
      setIsAdding(false)

      if (manualMode) {
        // Manual mode: skip AI call, hand off to parent to show the prompt panel
        setSuccessMessage('✅ Saved! Generating prompt for ChatGPT...')
        setTimeout(() => setSuccessMessage(null), 4000)
        if (onManualSaveComplete) onManualSaveComplete({ version })
        return
      }

      setProgressStatus('Analyzing release impact with AI...')

      // Step 2: Analyze impact
      const analyzeRes = await fetch('/api/release-notes/analyze-impact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ releaseNotes })
      })

      const analyzeData = await analyzeRes.json()

      if (analyzeData.success) {
        setAnalysis({
          affectedFeatures: analyzeData.affectedFeatures || [],
          recommendedArticles: analyzeData.recommendedArticles || [],
          searchQueries: analyzeData.searchQueries || []
        })
        setSuccessMessage(`✨ Saved and analyzed! Searching for affected articles...`)
        if (onAnalysisComplete) {
          onAnalysisComplete({
            affectedFeatures: analyzeData.affectedFeatures,
            recommendedArticles: analyzeData.recommendedArticles,
            searchQueries: analyzeData.searchQueries,
            version
          })
        }
        setProgressStatus('')
        setTimeout(() => setSuccessMessage(null), 3000)
      } else {
        setProgressStatus('')
        setError(analyzeData.error || 'Failed to analyze release impact')
      }
    } catch (err) {
      console.error('Error in save and analyze:', err)
      setProgressStatus('')
      setError(err.message)
    } finally {
      setIsSavingAndAnalyzing(false)
    }
  }

  const handleCancel = () => {
    loadReleaseNotes()
    setIsAdding(false)
    setError(null)
    setPdfFile(null)
    setArticleUrl('')
    setInputMode('text')
  }

  const handleUrlFetchAndAnalyze = async () => {
    if (!version.trim()) {
      setError('Please enter a version number or label')
      setTimeout(() => {
        document.querySelector('.error-message')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
      return
    }
    if (!articleUrl.trim()) {
      setError('Please enter a Zendesk article URL')
      setTimeout(() => {
        document.querySelector('.error-message')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
      return
    }

    setIsSavingAndAnalyzing(true)
    setError(null)
    setSuccessMessage(null)
    setProgressStatus('Fetching article from Zendesk...')

    try {
      // Step 1: Fetch article via Zendesk API
      const fetchRes = await fetch('/api/release-notes/fetch-from-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url: articleUrl, version }),
      })

      const fetchData = await fetchRes.json()
      if (!fetchData.success) {
        setError(fetchData.error || 'Failed to fetch article')
        setIsSavingAndAnalyzing(false)
        return
      }

      setProgressStatus('Article fetched — detecting images...')
      setReleaseNotes(fetchData.text)
      setAddedAt(fetchData.addedAt)
      setPdfImageData({
        imageCount: fetchData.imageCount,
        totalPages: null,
        sectionsWithImages: fetchData.sectionsWithImages,
      })
      setIsAdding(false)

      if (manualMode) {
        const imgMsg = fetchData.imageCount > 0 ? ` (${fetchData.imageCount} images detected)` : ''
        setSuccessMessage(`✅ "${fetchData.title}" fetched${imgMsg}! Generating prompt for ChatGPT...`)
        setTimeout(() => setSuccessMessage(null), 5000)
        if (onManualSaveComplete) onManualSaveComplete({ version })
        return
      }

      setProgressStatus('Analyzing release impact with AI...')

      // Step 2: Analyze impact
      const analyzeRes = await fetch('/api/release-notes/analyze-impact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ releaseNotes: fetchData.text }),
      })

      const analyzeData = await analyzeRes.json()

      if (analyzeData.success) {
        setAnalysis({
          affectedFeatures: analyzeData.affectedFeatures || [],
          recommendedArticles: analyzeData.recommendedArticles || [],
          searchQueries: analyzeData.searchQueries || [],
        })
        const imgMsg = fetchData.imageCount > 0
          ? ` Detected ${fetchData.imageCount} images across ${fetchData.sectionsWithImages.length} sections.`
          : ''
        setSuccessMessage(`"${fetchData.title}" fetched and analyzed! Searching for affected articles.${imgMsg}`)

        if (onAnalysisComplete) {
          onAnalysisComplete({
            affectedFeatures: analyzeData.affectedFeatures,
            recommendedArticles: analyzeData.recommendedArticles,
            searchQueries: analyzeData.searchQueries,
            version,
          })
        }

        setProgressStatus('')
        setTimeout(() => setSuccessMessage(null), 6000)
      } else {
        setProgressStatus('')
        setError(analyzeData.error || 'Failed to analyze release impact')
      }
    } catch (err) {
      console.error('Error in URL fetch and analyze:', err)
      setProgressStatus('')
      setError(err.message)
    } finally {
      setIsSavingAndAnalyzing(false)
    }
  }

  const handlePdfUploadAndAnalyze = async () => {
    if (!version.trim()) {
      setError('Please enter a version number or label')
      setTimeout(() => {
        document.querySelector('.error-message')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
      return
    }
    if (!pdfFile) {
      setError('Please select a PDF file')
      setTimeout(() => {
        document.querySelector('.error-message')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
      return
    }

    setIsSavingAndAnalyzing(true)
    setError(null)
    setSuccessMessage(null)
    setProgressStatus('Uploading and processing PDF...')

    try {
      // Step 1: Upload and process PDF
      const formData = new FormData()
      formData.append('pdf', pdfFile)
      formData.append('version', version)

      const uploadRes = await fetch('/api/release-notes/upload-pdf', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })

      const uploadData = await uploadRes.json()
      if (!uploadData.success) {
        setError(uploadData.error || 'Failed to process PDF')
        setIsSavingAndAnalyzing(false)
        return
      }

      setProgressStatus('Extracting text and detecting images...')

      setReleaseNotes(uploadData.text)
      setAddedAt(uploadData.addedAt)
      setPdfImageData({
        imageCount: uploadData.imageCount,
        totalPages: uploadData.totalPages,
        sectionsWithImages: uploadData.sectionsWithImages,
      })
      setIsAdding(false)

      if (manualMode) {
        const imgMsg = uploadData.imageCount > 0 ? ` (${uploadData.imageCount} screenshots detected)` : ''
        setSuccessMessage(`✅ PDF processed${imgMsg}! Generating prompt for ChatGPT...`)
        setTimeout(() => setSuccessMessage(null), 5000)
        if (onManualSaveComplete) onManualSaveComplete({ version })
        return
      }

      setProgressStatus('Analyzing release impact with AI...')

      // Analyze impact (uses text stored in session from PDF upload)
      const analyzeRes = await fetch('/api/release-notes/analyze-impact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ releaseNotes: uploadData.text }),
      })

      const analyzeData = await analyzeRes.json()

      if (analyzeData.success) {
        setAnalysis({
          affectedFeatures: analyzeData.affectedFeatures || [],
          recommendedArticles: analyzeData.recommendedArticles || [],
          searchQueries: analyzeData.searchQueries || [],
        })
        const imgMsg = uploadData.imageCount > 0
          ? ` Detected ${uploadData.imageCount} screenshots across ${uploadData.sectionsWithImages.length} feature sections.`
          : ''
        setSuccessMessage(`PDF processed and analyzed! Searching for affected articles.${imgMsg}`)

        if (onAnalysisComplete) {
          onAnalysisComplete({
            affectedFeatures: analyzeData.affectedFeatures,
            recommendedArticles: analyzeData.recommendedArticles,
            searchQueries: analyzeData.searchQueries,
            version,
          })
        }

        setProgressStatus('')
        setTimeout(() => setSuccessMessage(null), 5000)
      } else {
        setProgressStatus('')
        setError(analyzeData.error || 'Failed to analyze release impact')
      }
    } catch (err) {
      console.error('Error in PDF upload and analyze:', err)
      setProgressStatus('')
      setError(err.message)
    } finally {
      setIsSavingAndAnalyzing(false)
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
          </div>

          <div className="notes-display">
            <pre className="notes-content">
              {releaseNotes || '[No release notes entered yet]'}
            </pre>
          </div>

          <div className="view-actions">
            {releaseNotes ? (
              <button
                className="btn btn-primary"
                onClick={() => setIsAdding(true)}
              >
                ✏️ Edit Release
              </button>
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

          <div className="input-mode-toggle">
            <button
              className={`toggle-btn ${inputMode === 'text' ? 'active' : ''}`}
              onClick={() => setInputMode('text')}
            >
              📝 Paste Text
            </button>
            <button
              className={`toggle-btn ${inputMode === 'pdf' ? 'active' : ''}`}
              onClick={() => setInputMode('pdf')}
            >
              📄 Upload PDF
            </button>
            <button
              className={`toggle-btn ${inputMode === 'url' ? 'active' : ''}`}
              onClick={() => setInputMode('url')}
            >
              🔗 Article Link
            </button>
          </div>

          {inputMode === 'url' ? (
            <div className="url-input-area">
              <label htmlFor="article-url-input">
                <strong>Zendesk Article URL</strong>
              </label>
              <p className="help-text" style={{ marginTop: '4px', marginBottom: '12px' }}>
                📸 Images in the article will automatically flag sections that may need screenshot updates in affected articles
              </p>
              <input
                id="article-url-input"
                type="url"
                className="url-input"
                value={articleUrl}
                onChange={(e) => setArticleUrl(e.target.value)}
                placeholder="https://himarley.zendesk.com/hc/en-us/articles/..."
              />
              <small>Paste the URL of the release notes article in your Zendesk Help Center</small>
            </div>
          ) : inputMode === 'text' ? (
            <>
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
            </>
          ) : (
            <div className="pdf-upload-area">
              <label htmlFor="pdf-input">
                <strong>Upload Release Notes PDF</strong>
              </label>
              <p className="help-text" style={{ marginTop: '4px', marginBottom: '12px' }}>
                📸 PDFs with screenshots will automatically flag articles that may need screenshot updates
              </p>
              <input
                id="pdf-input"
                type="file"
                accept=".pdf"
                className="pdf-file-input"
                onChange={(e) => setPdfFile(e.target.files[0])}
              />
              {pdfFile && (
                <div className="pdf-selected">
                  <span>📄 {pdfFile.name}</span>
                  <small>({(pdfFile.size / 1024).toFixed(1)} KB)</small>
                </div>
              )}
            </div>
          )}

          <div className="edit-actions">
            <button
              className="btn btn-success"
              onClick={
                inputMode === 'pdf' ? handlePdfUploadAndAnalyze :
                inputMode === 'url' ? handleUrlFetchAndAnalyze :
                handleSaveAndAnalyze
              }
              disabled={isSavingAndAnalyzing}
            >
              {isSavingAndAnalyzing ? (
                <>
                  <span className="loading-spinner"></span>
                  {inputMode === 'pdf' ? 'Processing PDF...' :
                   inputMode === 'url' ? 'Fetching Article...' :
                   'Saving...'}
                </>
              ) : manualMode ? (
                inputMode === 'pdf' ? '📄 Upload PDF & Get Prompt' :
                inputMode === 'url' ? '🔗 Fetch Article & Get Prompt' :
                '💾 Save & Get ChatGPT Prompt'
              ) : (
                inputMode === 'pdf' ? '📄 Upload & Analyze with AI' :
                inputMode === 'url' ? '🔗 Fetch & Analyze with AI' :
                '💾 Save & Analyze with AI'
              )}
            </button>
            <button
              className="btn btn-ghost"
              onClick={handleCancel}
              disabled={isSavingAndAnalyzing}
            >
              Cancel
            </button>
          </div>

          {isSavingAndAnalyzing && progressStatus && (
            <div className="progress-status">
              <span className="loading-spinner"></span>
              <p>{progressStatus}</p>
            </div>
          )}

          <p className="help-text">
            {inputMode === 'pdf'
              ? '💡 Upload a PDF of your release notes. The system will extract text, detect screenshots, and analyze which articles need updates.'
              : inputMode === 'url'
              ? '💡 Paste the URL of your Zendesk release notes article. The system fetches the content directly via the Help Center API — clean text with no formatting issues, plus automatic image detection.'
              : '💡 Paste your release notes and click "Save & Analyze" to identify affected features and recommend Help Center articles for review.'
            }
          </p>
        </div>
      )}

      {analysis && !isAdding && (
        <div className="analysis-section">
          <p className="analysis-status">
            ✅ Analysis complete — searching Help Center for affected articles...
          </p>
        </div>
      )}

      <div className="info-box">
        <p>
          <strong>📝 How this works:</strong> Enter your release notes (paste text, upload a PDF, or paste a Zendesk article URL), then click Analyze.
          Auto Doc Pilot will identify affected features, find the relevant Help Center articles, and generate exact suggested edits — all in one step.
        </p>
      </div>
    </div>
  )
}

export default ReleaseNotesInputSection
