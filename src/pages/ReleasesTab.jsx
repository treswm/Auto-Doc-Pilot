import { useState, useCallback, useEffect, useRef } from 'react'
import FeedbackForm from '../components/FeedbackForm'
import ReleaseNotesInputSection from '../components/ReleaseNotesInputSection'
import ProductKnowledgePanel from '../components/ProductKnowledgePanel'
import '../styles/Tabs.css'

function ReleasesTab({ user }) {
  const [selectedArticle, setSelectedArticle] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [releaseId, setReleaseId] = useState(null)
  const [releaseTitle, setReleaseTitle] = useState(null)
  const [flaggedArticles, setFlaggedArticles] = useState([])
  const [totalArticlesFound, setTotalArticlesFound] = useState(0)
  const [flaggingLoading, setFlaggingLoading] = useState(false)
  const [articleStatuses, setArticleStatuses] = useState({})
  const [previousReleases, setPreviousReleases] = useState([])
  const [selectedReleaseHistory, setSelectedReleaseHistory] = useState(null)
  const [articleReasons, setArticleReasons] = useState({})
  const [copiedSection, setCopiedSection] = useState(null)
  const [scanWarnings, setScanWarnings] = useState([])
  const [createNewArticles, setCreateNewArticles] = useState([])
  const [copiedDraftKey, setCopiedDraftKey] = useState(null)
  // Rule-prompt state — keyed by 'create-new:{title}', 'no-update:{articleId}', 'updated-feedback:{articleId}', 'added-create-new:{title}', or 'unflagged:{idx}'
  // Value: { text, saving, saved }
  const [rulePrompts, setRulePrompts] = useState({})
  // Tracks which create-new cards have been marked as added (keyed by title)
  const [addedCreateNew, setAddedCreateNew] = useState({})
  // Features from the release notes that produced no article output
  const [unflaggedFeatures, setUnflaggedFeatures] = useState([])
  const [unflaggedOpen, setUnflaggedOpen] = useState(false)
  const autoSearchRef = useRef(false)

  // ── Screenshot doc → Zendesk draft ───────────────────────────────────────
  const [screenshotCount, setScreenshotCount] = useState(0)
  const [docLoading, setDocLoading] = useState(false)
  const [docError, setDocError] = useState(null)
  const [docTitle, setDocTitle] = useState('')
  const [docSections, setDocSections] = useState(null) // [{feature, description, screenshots:[{file,page,url,width,height,included}]}]
  const [docStats, setDocStats] = useState(null)
  const [zendeskSections, setZendeskSections] = useState([])
  const [selectedSectionId, setSelectedSectionId] = useState('')
  const [draftLoading, setDraftLoading] = useState(false)
  const [draftError, setDraftError] = useState(null)
  const [draftResult, setDraftResult] = useState(null)

  const handleBuildScreenshotDoc = async () => {
    setDocLoading(true)
    setDocError(null)
    setDraftResult(null)
    try {
      const [docRes, secRes] = await Promise.all([
        fetch('/api/release-notes/build-screenshot-doc', { method: 'POST', credentials: 'include' }),
        fetch('/api/release-notes/zendesk-sections', { credentials: 'include' }),
      ])
      const docData = await docRes.json()
      if (!docData.success) throw new Error(docData.error || 'Failed to build screenshot doc')
      const secData = await secRes.json().catch(() => ({ sections: [] }))

      // mark every screenshot as included by default
      const sections = (docData.sections || []).map(s => ({
        ...s,
        screenshots: (s.screenshots || []).map(sh => ({ ...sh, included: true })),
      }))
      setDocSections(sections)
      setDocTitle(docData.title || `Release ${releaseTitle || ''} — What's New`)
      setDocStats(docData.stats || null)
      if (secData.success && Array.isArray(secData.sections)) {
        setZendeskSections(secData.sections)
      }
    } catch (err) {
      setDocError(err.message)
    } finally {
      setDocLoading(false)
    }
  }

  const toggleDocShot = (si, shi) => {
    setDocSections(prev => prev.map((sec, i) => {
      if (i !== si) return sec
      return {
        ...sec,
        screenshots: sec.screenshots.map((sh, j) => j === shi ? { ...sh, included: !sh.included } : sh),
      }
    }))
  }

  const handleCreateScreenshotDraft = async () => {
    if (!selectedSectionId) { setDraftError('Please choose a target section first.'); return }
    if (!docTitle.trim()) { setDraftError('Please enter an article title.'); return }
    setDraftLoading(true)
    setDraftError(null)
    try {
      const payloadSections = docSections.map(sec => ({
        feature: sec.feature,
        description: sec.description,
        content: sec.content,
        screenshots: sec.screenshots.filter(sh => sh.included).map(sh => ({ file: sh.file, page: sh.page, width: sh.width, height: sh.height })),
      }))
      const res = await fetch('/api/release-notes/create-screenshot-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sectionId: selectedSectionId, title: docTitle.trim(), sections: payloadSections }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to create draft')
      setDraftResult(data)
    } catch (err) {
      setDraftError(err.message)
    } finally {
      setDraftLoading(false)
    }
  }

  // ── Convert plain proposedText to Zendesk-ready HTML ─────────────────────
  function textToZendeskHtml(text) {
    if (!text) return ''

    // Escape HTML special chars, then convert **bold** markers to <strong>
    function inlineFmt(s) {
      return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    }

    const lines = text.split('\n')
    const out = []
    let listType = null   // 'ul' | 'ol' | null
    let tableRows = []

    function flushList() {
      if (listType) { out.push(`</${listType}>`); listType = null }
    }
    function flushTable() {
      if (tableRows.length) {
        out.push('<table><tbody>')
        tableRows.forEach(r => out.push(r))
        out.push('</tbody></table>')
        tableRows = []
      }
    }

    for (const raw of lines) {
      const line = raw.trim()

      // Pipe-delimited table row (from table_update changeType)
      if (line.startsWith('|') && line.includes('|', 1)) {
        flushList()
        if (/^\|[\s\-\|:]+\|$/.test(line)) continue  // separator row
        const cells = line.split('|').slice(1, -1).map(c => c.trim())
        tableRows.push('<tr>' + cells.map(c => `<td>${inlineFmt(c)}</td>`).join('') + '</tr>')
        continue
      }
      if (tableRows.length) flushTable()

      if (!line) { flushList(); continue }

      // Numbered list
      if (/^\d+[.)]\s+/.test(line)) {
        if (listType === 'ul') flushList()
        if (!listType) { out.push('<ol>'); listType = 'ol' }
        out.push(`  <li>${inlineFmt(line.replace(/^\d+[.)]\s+/, ''))}</li>`)
        continue
      }

      // Bullet — matches •, -, or * followed by a space (not **bold**)
      if (/^[•\-]\s+/.test(line) || /^\*\s+/.test(line)) {
        if (listType === 'ol') flushList()
        if (!listType) { out.push('<ul>'); listType = 'ul' }
        out.push(`  <li>${inlineFmt(line.replace(/^[•\-\*]\s+/, ''))}</li>`)
        continue
      }

      flushList()
      out.push(`<p>${inlineFmt(line)}</p>`)
    }
    flushList()
    flushTable()
    return out.join('\n')
  }

  // Strip **bold** markers for plain-text copy (Zendesk rich editor mode)
  function stripMarkdownBold(text) {
    if (!text) return ''
    return text.replace(/\*\*(.+?)\*\*/g, '$1')
  }

  // Manual mode state
  const [manualMode, setManualMode] = useState(false)
  const [manualStep, setManualStep] = useState(null) // null | 1 | 'fetching' | 2 | 'followup'
  const [manualPromptText, setManualPromptText] = useState('')
  const [manualPasteValue, setManualPasteValue] = useState('')
  const [manualLoading, setManualLoading] = useState(false)
  const [manualError, setManualError] = useState(null)
  const [manualArticleCount, setManualArticleCount] = useState(0)
  const [manualArticleTitles, setManualArticleTitles] = useState([])
  const [manualUserMessage, setManualUserMessage] = useState('')
  const [manualCopied, setManualCopied] = useState(null) // null | 'step1' | 'project' | 'full' | 'followup-project' | 'followup-full'
  // Follow-up state (Option C — missing articles from truncated Step 2 response)
  const [missingArticles, setMissingArticles] = useState([]) // [{id, title}]
  const [manualFollowupPromptText, setManualFollowupPromptText] = useState('')
  const [manualFollowupUserMessage, setManualFollowupUserMessage] = useState('')
  const [manualFollowupPasteValue, setManualFollowupPasteValue] = useState('')

  const handleAnalysisComplete = (analysisData) => {
    autoSearchRef.current = false
    setFlaggedArticles([])
    setAnalysis(analysisData)
    setScreenshotCount(analysisData.screenshotCount || 0)
    setDocSections(null)
    setDraftResult(null)
    setDocError(null)
    const id = `release_${Date.now()}`
    setReleaseId(id)
    if (analysisData.version) {
      setReleaseTitle(`Release ${analysisData.version}`)
    }
  }

  // Manual mode: called after notes are saved (skip AI call)
  const handleManualSaveComplete = async ({ version, screenshotCount: sc }) => {
    const id = `release_${Date.now()}`
    setReleaseId(id)
    setFlaggedArticles([])
    setScreenshotCount(sc || 0)
    setDocSections(null)
    setDraftResult(null)
    setDocError(null)
    if (version) setReleaseTitle(`Release ${version}`)
    setManualLoading(true)
    setManualError(null)
    setManualStep(1)
    try {
      const res = await fetch('/api/release-notes/manual-prompt', { credentials: 'include' })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to generate prompt')
      setManualPromptText(data.combined)
      setManualPasteValue('')
    } catch (err) {
      setManualError(err.message)
      setManualStep(null)
    } finally {
      setManualLoading(false)
    }
  }

  // Manual mode Step 1: import analyze-impact response from ChatGPT
  const handleManualStep1Continue = async () => {
    if (!manualPasteValue.trim()) {
      setManualError('Please paste the ChatGPT response before continuing.')
      return
    }
    setManualLoading(true)
    setManualError(null)
    try {
      const importRes = await fetch('/api/release-notes/manual-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ responseText: manualPasteValue }),
      })
      const importData = await importRes.json()
      if (!importData.success) throw new Error(importData.error)

      // Store analysis in component state (same shape as normal flow)
      setAnalysis({
        affectedFeatures: importData.affectedFeatures,
        recommendedArticles: importData.recommendedArticles,
        searchQueries: importData.searchQueries,
      })

      // Transition to fetching-articles step
      setManualStep('fetching')
      setManualPasteValue('')

      const promptRes = await fetch('/api/scanners/manual-article-prompt', { credentials: 'include' })
      const promptData = await promptRes.json()
      if (!promptData.success) throw new Error(promptData.error || 'Failed to search Help Center')

      setManualPromptText(promptData.combined)
      setManualUserMessage(promptData.userMessage || '')
      setManualArticleCount(promptData.articleCount || 0)
      setManualArticleTitles(promptData.articleTitles || [])
      setManualStep(2)
    } catch (err) {
      setManualError(err.message)
      setManualStep(1)
    } finally {
      setManualLoading(false)
    }
  }

  // Manual mode Step 2: import article analysis batch response from ChatGPT
  const handleManualStep2ShowResults = async () => {
    if (!manualPasteValue.trim()) {
      setManualError('Please paste the ChatGPT response before continuing.')
      return
    }
    setManualLoading(true)
    setManualError(null)
    try {
      const res = await fetch('/api/scanners/manual-article-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ responseText: manualPasteValue, releaseId }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)

      const articlesWithReasons = (data.foundArticles || []).map(article => {
        let recommendation = (analysis?.recommendedArticles || []).find(rec => {
          const recTitle = typeof rec === 'string' ? rec : rec.title
          return recTitle?.toLowerCase() === article.title?.toLowerCase()
        })
        return {
          ...article,
          reason: article.reason || (recommendation && typeof recommendation === 'object' ? recommendation.reason : null),
          affectedFeatures: (recommendation && typeof recommendation === 'object' ? recommendation.relatedFeatures : null) || article.affectedFeatures || []
        }
      })

      setFlaggedArticles(articlesWithReasons)
      setTotalArticlesFound(articlesWithReasons.length)
      setScanWarnings(data.warnings || [])
      setCreateNewArticles(data.createNewArticles || [])
      setUnflaggedFeatures(data.unflaggedFeatures || [])
      setUnflaggedOpen(false)
      setManualPasteValue('')

      // Check if ChatGPT truncated the response (Option B + C)
      if (data.missingArticles && data.missingArticles.length > 0) {
        setMissingArticles(data.missingArticles)
        // Automatically fetch the follow-up prompt for the missing articles
        try {
          const followupRes = await fetch('/api/scanners/manual-article-followup-prompt', { credentials: 'include' })
          const followupData = await followupRes.json()
          if (followupData.success) {
            setManualFollowupPromptText(followupData.combined)
            setManualFollowupUserMessage(followupData.userMessage || '')
          }
        } catch (err) {
          console.warn('Could not fetch follow-up prompt:', err.message)
        }
        setManualStep('followup')
      } else {
        setManualStep(null)
      }
    } catch (err) {
      setManualError(err.message)
    } finally {
      setManualLoading(false)
    }
  }

  // Manual mode follow-up: merge missing articles from a second ChatGPT response
  const handleManualFollowupImport = async () => {
    if (!manualFollowupPasteValue.trim()) {
      setManualError('Please paste the ChatGPT response before continuing.')
      return
    }
    setManualLoading(true)
    setManualError(null)
    try {
      const res = await fetch('/api/scanners/manual-article-followup-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ responseText: manualFollowupPasteValue }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)

      setFlaggedArticles(data.foundArticles || [])
      setTotalArticlesFound((data.foundArticles || []).length)
      setCreateNewArticles(data.createNewArticles || [])
      setUnflaggedFeatures(data.unflaggedFeatures || [])
      setUnflaggedOpen(false)
      setMissingArticles([])
      setManualFollowupPasteValue('')
      setManualFollowupPromptText('')
      setManualFollowupUserMessage('')
      setManualStep(null)
    } catch (err) {
      setManualError(err.message)
    } finally {
      setManualLoading(false)
    }
  }

  const handleManualCopy = (type, text) => {
    navigator.clipboard.writeText(text).then(() => {
      setManualCopied(type)
      setTimeout(() => setManualCopied(null), 2000)
    })
  }

  // Auto-trigger article search once analysis + releaseId are both set (normal mode only)
  useEffect(() => {
    if (analysis && releaseId && !autoSearchRef.current && !flaggingLoading && !manualMode) {
      autoSearchRef.current = true
      searchAndFlagArticles()
    }
  }, [analysis, releaseId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCopyText = (text, key) => {
    // Copy as Zendesk-ready HTML — paste into Zendesk article Source view
    const html = textToZendeskHtml(text)
    navigator.clipboard.writeText(html).then(() => {
      setCopiedSection(key)
      setTimeout(() => setCopiedSection(null), 2000)
    })
  }

  const handleCopyRawText = (text, key) => {
    navigator.clipboard.writeText(stripMarkdownBold(text)).then(() => {
      setCopiedSection('raw-' + key)
      setTimeout(() => setCopiedSection(null), 2000)
    })
  }

  const handleCopyDraftPrompt = (prompt, key) => {
    navigator.clipboard.writeText(prompt).then(() => {
      setCopiedDraftKey(key)
      setTimeout(() => setCopiedDraftKey(null), 2500)
    })
  }

  // ── Rule-prompt helpers ──────────────────────────────────────────────────────
  const openRulePrompt = (key, suggestedText) => {
    setRulePrompts(prev => ({
      ...prev,
      [key]: { text: suggestedText, saving: false, saved: false }
    }))
  }

  const updateRuleText = (key, text) => {
    setRulePrompts(prev => ({ ...prev, [key]: { ...prev[key], text } }))
  }

  const saveContextRule = async (key) => {
    const rule = rulePrompts[key]?.text?.trim()
    if (!rule) return
    setRulePrompts(prev => ({ ...prev, [key]: { ...prev[key], saving: true } }))
    try {
      await fetch('/api/scanners/add-context-rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ rule }),
      })
      setRulePrompts(prev => ({ ...prev, [key]: { ...prev[key], saving: false, saved: true } }))
      // For create-new dismissals: remove the card after confirming save
      if (key.startsWith('create-new:')) {
        const title = key.slice('create-new:'.length)
        setTimeout(() => {
          setCreateNewArticles(prev => prev.filter(r => r.title !== title))
          setRulePrompts(prev => { const n = { ...prev }; delete n[key]; return n })
        }, 1400)
      }
    } catch (err) {
      console.warn('Failed to save context rule:', err.message)
      setRulePrompts(prev => ({ ...prev, [key]: { ...prev[key], saving: false } }))
    }
  }

  const skipRulePrompt = (key) => {
    if (key.startsWith('create-new:')) {
      const title = key.slice('create-new:'.length)
      setCreateNewArticles(prev => prev.filter(r => r.title !== title))
    }
    setRulePrompts(prev => { const n = { ...prev }; delete n[key]; return n })
  }

  const handleDismissCreateNew = async (title) => {
    // Optimistically fire server-side removal (non-blocking)
    fetch('/api/scanners/dismiss-create-new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ title }),
    }).catch(err => console.warn('Could not dismiss on server:', err.message))
    // Show rule prompt (card stays visible until user saves or skips)
    const key = `create-new:${title}`
    openRulePrompt(
      key,
      `The "${title}" feature does not require a new standalone Help Center article because [explain why — e.g., it is already covered by an existing article, it is a developer/IT-facing change already documented in API or integration docs, it is a minor enhancement that doesn't warrant separate documentation, etc.].`
    )
  }

  const handleOpenNoUpdateRule = (articleId, articleTitle) => {
    const key = `no-update:${articleId}`
    if (rulePrompts[key]) return // already open
    openRulePrompt(
      key,
      `The "${articleTitle}" article does not need updating for this release because [explain why — e.g., the release change is in a different product area, this article covers a separate workflow that is unaffected, the feature is developer/integration-facing and this is an operator-facing article, etc.].`
    )
  }
  // ── End rule-prompt helpers ──────────────────────────────────────────────────

  const searchAndFlagArticles = useCallback(async () => {
    if (!analysis || !releaseId) {
      console.error('Please analyze the release first')
      return
    }

    setFlaggingLoading(true)

    try {
      const res = await fetch('/api/scanners/search-and-flag', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          releaseNotes: '', // Frontend doesn't have this, backend uses the analysis
          releaseId,
          releaseTitle: releaseTitle || 'Release Analysis'
        })
      })

      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to search articles')

      // Enhance articles with reason descriptions from the analysis recommendations
      const articlesWithReasons = (data.foundArticles || []).map(article => {
        // Try to find matching recommendation by title first
        let recommendation = analysis.recommendedArticles.find(
          rec => {
            const recTitle = typeof rec === 'string' ? rec : rec.title
            return recTitle.toLowerCase() === article.title.toLowerCase()
          }
        )
        
        // If no title match, try to match by relatedFeatures overlap
        if (!recommendation && article.affectedFeatures && article.affectedFeatures.length > 0) {
          recommendation = analysis.recommendedArticles.find(rec => {
            if (typeof rec === 'string') return false
            const relatedFeatures = rec.relatedFeatures || []
            // Check if any of the article's affected features are in the recommendation's related features
            return article.affectedFeatures.some(feature =>
              relatedFeatures.some(relFeature =>
                feature.toLowerCase().includes(relFeature.toLowerCase()) ||
                relFeature.toLowerCase().includes(feature.toLowerCase())
              )
            )
          })
        }
        
        return {
          ...article,
          reason: recommendation && typeof recommendation === 'object' ? recommendation.reason : null,
          affectedFeatures: (recommendation && typeof recommendation === 'object' && recommendation.relatedFeatures) ? recommendation.relatedFeatures : article.affectedFeatures || []
        }
      })

      setFlaggedArticles(articlesWithReasons)
      setTotalArticlesFound(articlesWithReasons.length || 0)
      setScanWarnings(data.warnings || [])
      setCreateNewArticles(data.createNewArticles || [])
      setUnflaggedFeatures(data.unflaggedFeatures || [])
      setUnflaggedOpen(false)

      // Articles are now displayed in session but NOT persisted to database yet
      // They will only be persisted when user marks the release as processed
    } catch (err) {
      console.error('Error searching and flagging articles:', err.message)
    } finally {
      setFlaggingLoading(false)
    }
  }, [analysis, releaseId, releaseTitle])

  const handleArticleStatus = (articleId, status) => {
    setArticleStatuses(prev => ({
      ...prev,
      [articleId]: status
    }))
  }

  const updateArticleStatus = async (articleId, status) => {
    try {
      await fetch(`/api/articles/flag/${releaseId}_${articleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          reviewStatus: status,
          reviewedBy: user?.name || 'Unknown'
        })
      })
      handleArticleStatus(articleId, status)
    } catch (err) {
      console.error('Failed to update article status:', err)
    }
  }

  const fetchPreviousReleases = useCallback(async () => {
    try {
      const res = await fetch('/api/articles/releases-history', {
        credentials: 'include'
      })
      const data = await res.json()
      if (data.success) {
        setPreviousReleases(data.releases || [])
      }
    } catch (err) {
      console.error('Failed to fetch releases history:', err)
    }
  }, [])

  const loadReleaseHistory = (release) => {
    setSelectedReleaseHistory(release)
  }

  const handleMarkAsProcessed = async () => {
    try {
      if (!flaggedArticles || flaggedArticles.length === 0 || !releaseId || !analysis) {
        console.error('Missing required data to process release')
        return
      }

      const articleIds = flaggedArticles.map(a => a.id)

      // Persist articles to database
      const flagRes = await fetch('/api/articles/flag-by-release', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          releaseId,
          releaseTitle: releaseTitle || 'Release Analysis',
          affectedAreas: analysis.affectedFeatures || [],
          articleIds
        })
      })

      const flagData = await flagRes.json()
      if (!flagData.success) throw new Error(flagData.error || 'Failed to flag articles')

      // Clear current view after successful processing
      setFlaggedArticles([])
      setTotalArticlesFound(0)
      setAnalysis(null)
      setReleaseId(null)
      setArticleStatuses({})

      // Refresh previous releases list
      await fetchPreviousReleases()
    } catch (err) {
      console.error('Error marking release as processed:', err.message)
    }
  }

  return (
    <div className="tab-container">
      <div className="tab-header">
        <h2>Release Notes Analysis</h2>
        <button
          className={`btn manual-mode-toggle ${manualMode ? 'manual-mode-active' : 'btn-ghost'}`}
          onClick={() => {
            setManualMode(m => !m)
            setManualStep(null)
            setManualError(null)
            setManualPasteValue('')
          }}
          title={manualMode ? 'Switch to automatic AI mode' : 'Switch to manual ChatGPT mode (OpenAI quota workaround)'}
        >
          {manualMode ? '🤖 Manual Mode: ON' : '⚡ Manual Mode'}
        </button>
      </div>

      <div className="info-box">
        <p>
          Paste your release notes to analyze the impact and find which Help Center articles need updating.
        </p>
      </div>

      {manualMode && (
        <div className="info-box manual-mode-banner">
          <p><strong>Manual Mode is ON.</strong> Instead of calling the OpenAI API directly, Auto Doc Pilot will generate prompts for you to run in your <a href="https://chatgpt.com/g/g-p-69e7c1e796988191b20675b622f6a535-help-center-article-writer/project" target="_blank" rel="noopener noreferrer">Hi Marley ChatGPT project</a>. Paste the responses back here to continue.</p>
        </div>
      )}

      <ReleaseNotesInputSection
        onAnalysisComplete={handleAnalysisComplete}
        onManualSaveComplete={handleManualSaveComplete}
        manualMode={manualMode}
        flaggedArticles={flaggedArticles}
        releaseId={releaseId}
        analysis={analysis}
      />

      {/* ── Build Release Notes Doc with Screenshots → Zendesk Draft ──────── */}
      {/* Shows in: (1) Auto mode after analysis completes, OR (2) Manual Mode Step 1 as optional feature */}
      {(analysis || (manualMode && manualStep === 1)) && screenshotCount > 0 && (
        <div className="screenshot-doc-panel">
          <div className="sdoc-header">
            <h3>📸 Build Release Notes Doc with Screenshots</h3>
            <p className="sdoc-subtitle">
              {manualMode && manualStep === 1 && '✨ Optional: '}
              {screenshotCount} screenshot{screenshotCount !== 1 ? 's' : ''} were extracted from the deck.
              {manualMode && manualStep === 1 ? ' Create a draft Help Center article with screenshots embedded' : ' Match them to the customer-facing features in this release and create a draft Help Center article — screenshots embedded — for review'}.
              {manualMode && manualStep === 1 && ' Or continue to Step 2 for traditional article analysis.'}
            </p>
          </div>

          {!docSections && (
            <button className="btn btn-primary" onClick={handleBuildScreenshotDoc} disabled={docLoading}>
              {docLoading ? 'Building preview…' : '🔍 Build Preview'}
            </button>
          )}
          {docError && <p className="sdoc-error">⚠️ {docError}</p>}

          {docSections && (
            <>
              {docStats && (
                <p className="sdoc-stats">
                  {docStats.features} feature section{docStats.features !== 1 ? 's' : ''} ·
                  {' '}{docStats.matched} of {docStats.extracted} screenshots matched to a customer-facing feature
                  {' '}(unmatched/internal slides excluded).
                </p>
              )}

              <div className="sdoc-sections">
                {docSections.map((sec, si) => (
                  <div key={si} className="sdoc-section">
                    <h4 className="sdoc-feature">{sec.feature}</h4>
                    {sec.description && <p className="sdoc-desc">{sec.description}</p>}
                    {sec.screenshots.length === 0 ? (
                      <p className="sdoc-noshot">No screenshot matched — this section will be text only.</p>
                    ) : (
                      <div className="sdoc-shots">
                        {sec.screenshots.map((sh, shi) => (
                          <label key={shi} className={`sdoc-shot ${sh.included ? 'included' : 'excluded'}`}>
                            <input type="checkbox" checked={sh.included} onChange={() => toggleDocShot(si, shi)} />
                            <img src={sh.url} alt={`${sec.feature} screenshot`} loading="lazy" />
                            <span className="sdoc-shot-meta">p{sh.page} · {sh.width}×{sh.height}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="sdoc-create">
                <div className="sdoc-field">
                  <label htmlFor="sdoc-title">Article title</label>
                  <input
                    id="sdoc-title"
                    type="text"
                    value={docTitle}
                    onChange={e => setDocTitle(e.target.value)}
                    placeholder="Release 2.86 — What's New"
                  />
                </div>
                <div className="sdoc-field">
                  <label htmlFor="sdoc-section">Target Help Center section</label>
                  <select id="sdoc-section" value={selectedSectionId} onChange={e => setSelectedSectionId(e.target.value)}>
                    <option value="">Choose a section…</option>
                    {zendeskSections.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={handleCreateScreenshotDraft}
                  disabled={draftLoading || !selectedSectionId}
                >
                  {draftLoading ? 'Creating draft in Zendesk…' : '📝 Create Draft in Zendesk'}
                </button>
                <button className="btn btn-ghost" onClick={handleBuildScreenshotDoc} disabled={docLoading}>
                  ↻ Rebuild Preview
                </button>
              </div>

              {draftError && <p className="sdoc-error">⚠️ {draftError}</p>}
              {draftResult && (
                <div className="sdoc-success">
                  ✅ Draft created in <strong>{draftResult.brand}</strong> with {draftResult.uploadedImages} embedded screenshot{draftResult.uploadedImages !== 1 ? 's' : ''}.
                  {draftResult.editUrl && (
                    <> <a href={draftResult.editUrl} target="_blank" rel="noopener noreferrer">Open draft in Zendesk →</a></>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Manual Step 1: Copy analyze-impact prompt to ChatGPT */}
      {manualMode && manualStep === 1 && (
        <div className="manual-step-panel">
          <div className="manual-step-header">
            <span className="manual-step-badge">Step 1 of 2</span>
            <h3>Identify Affected Articles</h3>
          </div>
          <p className="manual-step-desc">📌 <strong>Use the <a href="https://chatgpt.com/g/g-p-69e7c1e796988191b20675b622f6a535-help-center-article-writer/project" target="_blank" rel="noopener noreferrer">Article Writer ChatGPT project</a> for this prompt only.</strong> Do not use this project for Step 2. Alternatively, you can copy and paste into plain ChatGPT.com if you prefer. ChatGPT will return a JSON object — paste it back below.</p>
          <button className="btn btn-primary manual-copy-btn" onClick={() => handleManualCopy('step1', manualPromptText)} disabled={!manualPromptText}>
            {manualCopied === 'step1' ? '✓ Copied!' : '📋 Copy Prompt for ChatGPT'}
          </button>
          {manualPromptText && (
            <details className="manual-prompt-preview">
              <summary>Preview prompt</summary>
              <textarea className="manual-prompt-textarea" readOnly value={manualPromptText} />
            </details>
          )}
          <label className="manual-paste-label">Paste ChatGPT's JSON response here:</label>
          <textarea
            className="manual-paste-textarea"
            placeholder={'{\n  "featureChanges": [...],\n  "recommendedArticles": [...],\n  "searchQueries": [...]\n}'}
            value={manualPasteValue}
            onChange={e => { setManualPasteValue(e.target.value); setManualError(null) }}
          />
          {manualError && <p className="manual-step-error">❌ {manualError}</p>}
          <button className="btn btn-success" onClick={handleManualStep1Continue} disabled={manualLoading || !manualPasteValue.trim()}>
            {manualLoading ? <><span className="loading-spinner"></span> Searching Help Center...</> : 'Continue →'}
          </button>
        </div>
      )}

      {/* Between steps: Zendesk search in progress */}
      {manualMode && manualStep === 'fetching' && (
        <div className="search-progress-banner">
          <span className="search-spinner"></span>
          <p>Searching your Help Center for affected articles — no AI needed for this step...</p>
        </div>
      )}

      {/* Manual Step 2: Copy batch article-analysis prompt to ChatGPT */}
      {manualMode && manualStep === 2 && (
        <div className="manual-step-panel">
          <div className="manual-step-header">
            <span className="manual-step-badge">Step 2 of 2</span>
            <h3>Analyze Articles ({manualArticleCount} found)</h3>
          </div>
          {manualArticleTitles.length > 0 && (
            <p className="manual-step-desc">
              Found: {manualArticleTitles.slice(0, 5).map((t, i) => <em key={i}>"{t}"</em>).reduce((a, b) => [a, ', ', b])}
              {manualArticleTitles.length > 5 ? ` and ${manualArticleTitles.length - 5} more` : ''}.
            </p>
          )}
          <p className="manual-step-desc">This prompt includes all {manualArticleCount} article(s). ChatGPT will return a JSON array — paste it back below.</p>
          <div className="scan-warnings-box">
            <strong>✅ Do NOT use the Article Writer project for this step. Start a new conversation in plain ChatGPT.com instead.</strong>
            <p className="scan-warnings-desc">The article analysis context will cause the ChatGPT project to misinterpret the request and write full articles instead of returning JSON. Always use plain ChatGPT for Step 2 analysis.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button className="btn btn-primary manual-copy-btn" onClick={() => handleManualCopy('full', manualPromptText)} disabled={!manualPromptText}>
              {manualCopied === 'full' ? '✓ Copied!' : '📋 Copy Full Prompt for ChatGPT'}
            </button>
          </div>
          {manualPromptText && (
            <details className="manual-prompt-preview">
              <summary>Preview prompt ({Math.round(manualPromptText.length / 1000)}k characters)</summary>
              <textarea className="manual-prompt-textarea" readOnly value={manualPromptText} />
            </details>
          )}
          <label className="manual-paste-label">Paste ChatGPT's JSON array response here:</label>
          <textarea
            className="manual-paste-textarea"
            placeholder={'[\n  { "articleId": 123, "alreadyCovered": false, ... },\n  ...\n]'}
            value={manualPasteValue}
            onChange={e => { setManualPasteValue(e.target.value); setManualError(null) }}
          />
          {manualError && <p className="manual-step-error">❌ {manualError}</p>}
          <button className="btn btn-success" onClick={handleManualStep2ShowResults} disabled={manualLoading || !manualPasteValue.trim()}>
            {manualLoading ? <><span className="loading-spinner"></span> Processing...</> : 'Show Results →'}
          </button>
        </div>
      )}

      {/* Manual follow-up: some articles were missing from Step 2 response */}
      {manualMode && manualStep === 'followup' && (
        <div className="manual-step-panel">
          <div className="manual-step-header">
            <span className="manual-step-badge" style={{ background: '#b45309' }}>⚠ Incomplete Response</span>
            <h3>Follow-up Needed ({missingArticles.length} article{missingArticles.length !== 1 ? 's' : ''} missing)</h3>
          </div>
          <div className="scan-warnings-box">
            <strong>ChatGPT's response was cut off before covering all articles.</strong>
            <p className="scan-warnings-desc">
              The results above are partial. The following {missingArticles.length === 1 ? 'article was' : 'articles were'} not included in ChatGPT's response:
            </p>
            <ul className="scan-warnings-list">
              {missingArticles.map(a => <li key={a.id}>{a.title}</li>)}
            </ul>
          </div>
          <p className="manual-step-desc">A follow-up prompt has been generated for {missingArticles.length} article{missingArticles.length !== 1 ? 's' : ''}. Paste it into <strong>the same ChatGPT conversation as Step 2</strong> (not a new conversation). ChatGPT will maintain context about which articles are missing and analyze them correctly.</p>
          <div className="scan-warnings-box">
            <strong>📌 Paste into the same Step 2 conversation.</strong>
            <p className="scan-warnings-desc">Do NOT start a new conversation. The context from Step 2 helps ChatGPT focus only on the missing articles.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button className="btn btn-primary manual-copy-btn" onClick={() => handleManualCopy('followup-full', manualFollowupPromptText)} disabled={!manualFollowupPromptText}>
              {manualCopied === 'followup-full' ? '✓ Copied!' : '📋 Copy Full Prompt for ChatGPT'}
            </button>
          </div>
          {manualFollowupPromptText && (
            <details className="manual-prompt-preview">
              <summary>Preview prompt ({Math.round(manualFollowupPromptText.length / 1000)}k characters)</summary>
              <textarea className="manual-prompt-textarea" readOnly value={manualFollowupPromptText} />
            </details>
          )}
          <label className="manual-paste-label">Paste ChatGPT's JSON array response here:</label>
          <textarea
            className="manual-paste-textarea"
            placeholder={'[\n  { "articleId": 123, "alreadyCovered": false, ... },\n  ...\n]'}
            value={manualFollowupPasteValue}
            onChange={e => { setManualFollowupPasteValue(e.target.value); setManualError(null) }}
          />
          {manualError && <p className="manual-step-error">❌ {manualError}</p>}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-success" onClick={handleManualFollowupImport} disabled={manualLoading || !manualFollowupPasteValue.trim()}>
              {manualLoading ? <><span className="loading-spinner"></span> Processing...</> : 'Merge Results →'}
            </button>
            <button className="btn btn-ghost" onClick={() => { setManualStep(null); setMissingArticles([]) }} style={{ fontSize: '0.85rem' }}>
              Skip (show partial results only)
            </button>
          </div>
        </div>
      )}

      {/* Normal mode: search-and-flag in progress */}
      {!manualMode && analysis && !flaggedArticles.length && flaggingLoading && (
        <div className="search-progress-banner">
          <span className="search-spinner"></span>
          <p>Searching your Help Center and generating suggested edits — this may take a minute...</p>
        </div>
      )}

      {flaggedArticles.length > 0 && (
        <>
          <div className="scan-info">
            <p>
              ✅ Found <strong>{totalArticlesFound}</strong> article{totalArticlesFound !== 1 ? 's' : ''} to update
              {createNewArticles.length > 0 && (
                <> · <strong>{createNewArticles.length}</strong> new to create</>
              )}.
              {' '}Review all, mark their status, then click "Mark as Processed" below.
            </p>
          </div>
          <div className="action-buttons">
            <button
              className="btn btn-primary"
              onClick={() => window.open('/api/scanners/export-full-pdf', '_blank')}
            >
              📄 Download Full Report (PDF)
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                if (!releaseId) {
                  console.error('No releaseId available');
                  return;
                }
                window.location.href = `/api/scanners/export-results?releaseId=${releaseId}`;
              }}
            >
              📥 Download CSV (All Results)
            </button>
          </div>
          {/* ── New Articles to Create (shown above articles-to-update) ──── */}
          {createNewArticles.length > 0 && (
            <div className="create-new-section">
              <div className="create-new-header">
                <h3 className="create-new-title">🆕 New Articles to Create</h3>
                <p className="create-new-subtitle">
                  The following features have no existing Help Center article.
                  Use the draft prompt below with the Hi Marley ChatGPT project to write each article from scratch.
                </p>
              </div>
              {createNewArticles.map((rec, idx) => {
                const ruleKey = `create-new:${rec.title}`
                const ruleState = rulePrompts[ruleKey]
                const isAdded = !!addedCreateNew[rec.title]
                const isDismissed = !isAdded && !!ruleState
                return (
                  <div key={idx} className={`create-new-card ${isDismissed ? 'create-new-card-dismissed' : ''} ${isAdded ? 'create-new-card-added' : ''}`}>
                    <div className="create-new-card-header">
                      <span className="badge badge-create-new">🆕 New Article</span>
                      <h4 className="create-new-card-title">{rec.title}</h4>
                      {rec.confidence != null && (
                        <span
                          className={`confidence-badge ${rec.confidence >= 0.8 ? 'confidence-high' : rec.confidence >= 0.55 ? 'confidence-medium' : 'confidence-low'}`}
                          title="Confidence score: how strongly the evidence supports creating this new article"
                        >
                          {Math.round(rec.confidence * 100)}% confident
                        </span>
                      )}
                      {rec.suggestedPlacement && (
                        <span className="create-new-placement">📁 {rec.suggestedPlacement}</span>
                      )}
                    </div>

                    {rec.relatedFeatures && rec.relatedFeatures.length > 0 && (
                      <p className="create-new-features">
                        <strong>Features covered:</strong> {rec.relatedFeatures.join(', ')}
                      </p>
                    )}

                    <div className="create-new-reason">
                      <strong>Why this article is needed:</strong>
                      <p>{rec.reason}</p>
                    </div>

                    {isAdded ? (
                      /* ── Added state: green badge + undo + optional feedback ── */
                      <div className="article-resolved">
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span className="badge badge-success">✓ Added</span>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setAddedCreateNew(prev => { const n = { ...prev }; delete n[rec.title]; return n })}
                          >
                            Undo
                          </button>
                          {!rulePrompts[`added-create-new:${rec.title}`] && (
                            <button
                              className="btn btn-ghost btn-sm rule-prompt-trigger"
                              onClick={() => openRulePrompt(
                                `added-create-new:${rec.title}`,
                                `Feedback on the "${rec.title}" article recommendation: [e.g., the draft prompt was on target, or: the suggested scope was slightly off because…]`
                              )}
                            >
                              💡 Improve future scans
                            </button>
                          )}
                        </div>
                        {rulePrompts[`added-create-new:${rec.title}`] && (() => {
                          const fbKey = `added-create-new:${rec.title}`
                          const rs = rulePrompts[fbKey]
                          return (
                            <div className="rule-prompt-panel">
                              <p className="rule-prompt-header">
                                💡 <strong>Improve future scans</strong> — leave optional feedback on this new article recommendation:
                              </p>
                              <textarea
                                className="rule-prompt-textarea"
                                value={rs.text}
                                onChange={e => updateRuleText(fbKey, e.target.value)}
                                rows={3}
                                disabled={rs.saving || rs.saved}
                              />
                              {rs.saved ? (
                                <p className="rule-prompt-saved">✓ Feedback saved! Future scans will take this into account.</p>
                              ) : (
                                <div className="rule-prompt-actions">
                                  <button
                                    className="btn btn-primary btn-sm"
                                    onClick={() => saveContextRule(fbKey)}
                                    disabled={rs.saving || !rs.text?.trim()}
                                  >
                                    {rs.saving ? 'Saving…' : '💾 Save Feedback'}
                                  </button>
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => skipRulePrompt(fbKey)}
                                  >
                                    Skip
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    ) : isDismissed ? (
                      /* ── Dismissed state: show rule prompt ── */
                      <div className="dismissed-state">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className="badge-dismissed">✕ Dismissed</span>
                          {!ruleState.saved && (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => setRulePrompts(prev => { const n = { ...prev }; delete n[ruleKey]; return n })}
                            >
                              ← Undo
                            </button>
                          )}
                        </div>
                        <div className="rule-prompt-panel">
                          <p className="rule-prompt-header">
                            💡 <strong>Improve future scans</strong> — optionally save a rule explaining why this feature doesn't need a new article:
                          </p>
                          <textarea
                            className="rule-prompt-textarea"
                            value={ruleState.text}
                            onChange={e => updateRuleText(ruleKey, e.target.value)}
                            rows={3}
                            disabled={ruleState.saving || ruleState.saved}
                          />
                          {ruleState.saved ? (
                            <p className="rule-prompt-saved">✓ Rule saved! Future scans will take this into account.</p>
                          ) : (
                            <div className="rule-prompt-actions">
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => saveContextRule(ruleKey)}
                                disabled={ruleState.saving || !ruleState.text?.trim()}
                              >
                                {ruleState.saving ? 'Saving…' : '💾 Save Rule'}
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => skipRulePrompt(ruleKey)}
                              >
                                Skip
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* ── Normal state: actions + dismiss ── */
                      <>
                        <div className="create-new-actions">
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => setAddedCreateNew(prev => ({ ...prev, [rec.title]: true }))}
                          >
                            ✓ Mark as Added
                          </button>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleCopyDraftPrompt(rec.draftPrompt, idx)}
                          >
                            {copiedDraftKey === idx ? '✓ Prompt Copied!' : '📋 Copy Draft Prompt'}
                          </button>
                          <a
                            href="https://chatgpt.com/g/g-p-69e7c1e796988191b20675b622f6a535-help-center-article-writer/project"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-ghost btn-sm"
                          >
                            Open ChatGPT Project ↗
                          </a>
                          <button
                            className="btn btn-ghost btn-sm btn-dismiss"
                            onClick={() => handleDismissCreateNew(rec.title)}
                            title="Dismiss this recommendation"
                          >
                            ✕ Dismiss
                          </button>
                        </div>
                        <p className="create-new-instructions">
                          Copy the draft prompt → open the ChatGPT project → start a new conversation → paste the prompt.
                          Then paste the resulting HTML into the Zendesk article editor's Source view.
                        </p>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <div className="articles-grid">
            {flaggedArticles.map(article => (
              <div
                key={article.id}
                className={`article-card ${selectedArticle?.id === article.id ? 'selected' : ''}`}
                onClick={() => setSelectedArticle(article)}
              >
                <div className="article-header">
                  <h4>{article.title}</h4>
                  <span className="article-id">ID: {article.id}</span>
                  <span className="status-badge flagged">Flagged for Review</span>
                  {article.action && (
                    <span className={`status-badge ${article.action === 'create_new' ? 'badge-create' : 'badge-update'}`}>
                      {article.action === 'create_new' ? '🆕 New Article Needed' : '✏️ Update Existing'}
                    </span>
                  )}
                  {article.confidence != null && (
                    <span
                      className={`confidence-badge ${article.confidence >= 0.8 ? 'confidence-high' : article.confidence >= 0.55 ? 'confidence-medium' : 'confidence-low'}`}
                      title="Confidence score: how strongly the evidence supports this recommendation"
                    >
                      {Math.round(article.confidence * 100)}% confident
                    </span>
                  )}
                </div>
                <div className="article-meta">
                  <p>📅 Last updated: {new Date(article.updated_at).toLocaleString()}</p>
                  {article.reason && (
                    <p className="article-flag-reason">
                      {article.reason}
                    </p>
                  )}
                  {article.affectedSections && (
                    <div className="affected-sections-box">
                      <strong>Affected Sections:</strong>
                      <p>{article.affectedSections}</p>
                    </div>
                  )}

                  {article.sectionToUpdate && (
                    <div className="section-to-update-box">
                      <strong>📍 Section(s) to Update:</strong>
                      <p>{Array.isArray(article.sectionToUpdate) ? article.sectionToUpdate.join(' · ') : article.sectionToUpdate}</p>
                    </div>
                  )}
                  {article.screenshotsToUpdate && article.screenshotsToUpdate.length > 0 ? (() => {
                    const videos = article.screenshotsToUpdate.filter(s => s.type === 'video');
                    const gifs = article.screenshotsToUpdate.filter(s => s.type === 'gif');
                    const images = article.screenshotsToUpdate.filter(s => s.type === 'image' || !s.type);
                    return (
                      <div className="screenshot-flag-box">
                        {videos.length > 0 && (
                          <>
                            <strong className="media-label-video">🎬 Videos to Review</strong>
                            <ul className="screenshot-update-list">
                              {videos.map((v, si) => (
                                <li key={si} className="screenshot-update-item media-item-video">
                                  <span className="screenshot-section">📍 {v.section}</span>
                                  {v.filename && <span className="screenshot-filename">"{v.filename}"</span>}
                                  {v.reason && <span className="screenshot-reason">{v.reason}</span>}
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                        {gifs.length > 0 && (
                          <>
                            <strong className="media-label-gif">📹 GIF Animations to Update</strong>
                            <ul className="screenshot-update-list">
                              {gifs.map((g, si) => (
                                <li key={si} className="screenshot-update-item media-item-gif">
                                  <span className="screenshot-section">📍 {g.section}</span>
                                  {g.filename && <span className="screenshot-filename">"{g.filename}"</span>}
                                  {g.reason && <span className="screenshot-reason">{g.reason}</span>}
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                        {images.length > 0 && (
                          <>
                            <strong>📸 Screenshots to Update</strong>
                            <ul className="screenshot-update-list">
                              {images.map((shot, si) => (
                                <li key={si} className="screenshot-update-item">
                                  <span className="screenshot-section">📍 {shot.section}</span>
                                  {shot.filename && <span className="screenshot-filename">"{shot.filename}"</span>}
                                  {shot.reason && <span className="screenshot-reason">{shot.reason}</span>}
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                    );
                  })() : article.screenshotUpdateNeeded ? (
                    <div className="screenshot-flag-box">
                      <strong>📸 Screenshots May Need Updating</strong>
                      <p>This feature includes UI changes detected in the release notes. Review and update article screenshots to match the new interface.</p>
                    </div>
                  ) : null}
                  {article.proposedCopy && article.proposedCopy.length > 0 && (
                    <div className="proposed-copy-section">
                      <div className="proposed-copy-label">✏️ Suggested Edits</div>
                      {article.proposedCopy.map((entry, ei) => {
                        const copyKey = `${article.id}-${ei}`
                        return (
                          <div key={ei} className={`proposed-copy-block ${entry.changeType === 'table_update' ? 'proposed-table-update' : ''}`}>
                            <div className="proposed-copy-meta">
                              <span className="proposed-section-name">📍 {entry.section}</span>
                              {entry.changeType === 'table_update' && (
                                <span className="proposed-table-badge">⚠ Table Update</span>
                              )}
                              {entry.instruction && (
                                <span className={`proposed-instruction ${entry.changeType === 'table_update' ? 'proposed-instruction-table' : ''}`}>{entry.instruction}</span>
                              )}
                            </div>
                            {entry.proposedText && (
                              <div className="proposed-text-wrapper">
                                <div
                                  className="proposed-text proposed-text-html"
                                  dangerouslySetInnerHTML={{ __html: textToZendeskHtml(entry.proposedText) }}
                                />
                                <div className="proposed-copy-actions">
                                  <button
                                    className="copy-btn copy-btn-html"
                                    title="Copies Zendesk-ready HTML — paste into article Source view"
                                    onClick={() => handleCopyText(entry.proposedText, copyKey)}
                                  >
                                    {copiedSection === copyKey ? '✓ Copied HTML' : '⟨/⟩ Copy HTML'}
                                  </button>
                                  <button
                                    className="copy-btn copy-btn-raw"
                                    title="Copies plain text"
                                    onClick={() => handleCopyRawText(entry.proposedText, copyKey)}
                                  >
                                    {copiedSection === 'raw-' + copyKey ? '✓ Copied' : 'Copy text'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                {articleStatuses[article.id] ? (
                  <div className="article-resolved">
                    <div className="resolved-audit-info">
                      <span className="badge badge-success">✓ {articleStatuses[article.id] === 'updated' ? 'Updated' : articleStatuses[article.id] === 'no_update' ? 'Does Not Require Updating' : 'Review Later'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleArticleStatus(article.id, null)}
                      >
                        Undo
                      </button>
                      {articleStatuses[article.id] === 'no_update' && !rulePrompts[`no-update:${article.id}`] && (
                        <button
                          className="btn btn-ghost btn-sm rule-prompt-trigger"
                          onClick={() => handleOpenNoUpdateRule(article.id, article.title)}
                          title="Add a product context rule explaining why this article doesn't need updating"
                        >
                          💡 Improve future scans
                        </button>
                      )}
                      {articleStatuses[article.id] === 'updated' && !rulePrompts[`updated-feedback:${article.id}`] && (
                        <button
                          className="btn btn-ghost btn-sm rule-prompt-trigger"
                          onClick={() => openRulePrompt(
                            `updated-feedback:${article.id}`,
                            `Feedback on the copy suggestions for "${article.title}": [e.g., the suggested edits were accurate, or: the AI flagged the wrong section because…]`
                          )}
                          title="Leave feedback on the copy suggestions to improve future scan accuracy"
                        >
                          💡 Improve future scans
                        </button>
                      )}
                    </div>
                    {rulePrompts[`no-update:${article.id}`] && (() => {
                      const ruleKey = `no-update:${article.id}`
                      const rs = rulePrompts[ruleKey]
                      return (
                        <div className="rule-prompt-panel">
                          <p className="rule-prompt-header">
                            💡 <strong>Add a product context rule</strong> — explain why this article doesn't need updating, so future scans don't flag it unnecessarily:
                          </p>
                          <textarea
                            className="rule-prompt-textarea"
                            value={rs.text}
                            onChange={e => updateRuleText(ruleKey, e.target.value)}
                            rows={3}
                            disabled={rs.saving || rs.saved}
                          />
                          {rs.saved ? (
                            <p className="rule-prompt-saved">✓ Rule saved! Future scans will take this into account.</p>
                          ) : (
                            <div className="rule-prompt-actions">
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => saveContextRule(ruleKey)}
                                disabled={rs.saving || !rs.text?.trim()}
                              >
                                {rs.saving ? 'Saving…' : '💾 Save Rule'}
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => skipRulePrompt(ruleKey)}
                              >
                                Skip
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                    {rulePrompts[`updated-feedback:${article.id}`] && (() => {
                      const fbKey = `updated-feedback:${article.id}`
                      const rs = rulePrompts[fbKey]
                      return (
                        <div className="rule-prompt-panel">
                          <p className="rule-prompt-header">
                            💡 <strong>Improve future scans</strong> — leave optional feedback on the copy suggestions for this article:
                          </p>
                          <textarea
                            className="rule-prompt-textarea"
                            value={rs.text}
                            onChange={e => updateRuleText(fbKey, e.target.value)}
                            rows={3}
                            disabled={rs.saving || rs.saved}
                          />
                          {rs.saved ? (
                            <p className="rule-prompt-saved">✓ Feedback saved! Future scans will take this into account.</p>
                          ) : (
                            <div className="rule-prompt-actions">
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => saveContextRule(fbKey)}
                                disabled={rs.saving || !rs.text?.trim()}
                              >
                                {rs.saving ? 'Saving…' : '💾 Save Feedback'}
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => skipRulePrompt(fbKey)}
                              >
                                Skip
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                ) : (
                  <div className="article-actions">
                    <a
                      href={article.helpCenterUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary btn-sm"
                    >
                      Review Article ↗
                    </a>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => updateArticleStatus(article.id, 'updated')}
                    >
                      Mark as Updated
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => updateArticleStatus(article.id, 'review_later')}
                    >
                      Review Later
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => updateArticleStatus(article.id, 'no_update')}
                    >
                      Does Not Require Updating
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {Object.keys(articleStatuses).length > 0 && (
          <div className="process-release-section">
            <button
              className="btn btn-success"
              onClick={handleMarkAsProcessed}
            >
              ✅ Mark as Processed
            </button>
            <p className="process-info">Click when you're done reviewing articles. This will save the release to your Previous Releases history.</p>
          </div>
          )}
        </>
      )}

      {scanWarnings.length > 0 && (
        <div className="scan-warnings-box">
          <strong>⚠ Scan Warnings</strong>
          <p className="scan-warnings-desc">The following issues occurred during analysis. Affected articles were excluded from results and may need manual review.</p>
          <ul className="scan-warnings-list">
            {scanWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Release Notes Sections With No Articles Flagged ───────────── */}
      {unflaggedFeatures.length > 0 && (
        <div className="unflagged-section">
          <button
            className="unflagged-toggle"
            onClick={() => setUnflaggedOpen(o => !o)}
          >
            <span className="unflagged-toggle-icon">{unflaggedOpen ? '▼' : '▶'}</span>
            <span>🔍 Release Notes Sections With No Articles Flagged</span>
            <span className="unflagged-badge">{unflaggedFeatures.length}</span>
            <span className="unflagged-toggle-hint">— Review these to catch gaps</span>
          </button>
          {unflaggedOpen && (
            <div className="unflagged-body">
              <p className="unflagged-desc">
                These sections from the release notes had no Help Center articles flagged for update or creation.
                If the scanner missed something, use "Add context rule" to teach it for future runs.
              </p>
              {unflaggedFeatures.map((item, idx) => {
                const rpKey = `unflagged:${idx}`
                const rs = rulePrompts[rpKey]
                return (
                  <div key={idx} className="unflagged-item">
                    <div className="unflagged-item-header">
                      <span className="unflagged-item-title">{item.title || item}</span>
                    </div>
                    {item.noOutputReason && (
                      <p className="unflagged-item-reason">{item.noOutputReason}</p>
                    )}
                    {item.searchQueriesUsed && item.searchQueriesUsed.length > 0 && (
                      <p className="unflagged-item-queries">
                        <span className="unflagged-item-queries-label">Searches used:</span>{' '}
                        {item.searchQueriesUsed.map((q, qi) => (
                          <span key={qi} className="unflagged-query-chip">"{q}"</span>
                        ))}
                      </p>
                    )}
                    {!rs ? (
                      <button
                        className="btn btn-ghost btn-sm rule-prompt-trigger"
                        style={{ marginTop: '8px' }}
                        onClick={() => openRulePrompt(
                          rpKey,
                          `For the "${item.title || item}" release note section, the following Help Center article should be flagged for update: [article title] because [reason — e.g., this article documents the affected feature/API/setting and needs to reflect this change].`
                        )}
                      >
                        💡 Add context rule
                      </button>
                    ) : (
                      <div className="rule-prompt-panel" style={{ marginTop: '8px' }}>
                        <p className="rule-prompt-header">
                          💡 <strong>Improve future scans</strong> — describe which article should be flagged and why:
                        </p>
                        <textarea
                          className="rule-prompt-textarea"
                          value={rs.text}
                          onChange={e => updateRuleText(rpKey, e.target.value)}
                          rows={3}
                          disabled={rs.saving || rs.saved}
                        />
                        {rs.saved ? (
                          <p className="rule-prompt-saved">✓ Rule saved! Future scans will take this into account.</p>
                        ) : (
                          <div className="rule-prompt-actions">
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => saveContextRule(rpKey)}
                              disabled={rs.saving || !rs.text?.trim()}
                            >
                              {rs.saving ? 'Saving…' : '💾 Save Rule'}
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => skipRulePrompt(rpKey)}
                            >
                              Skip
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {selectedArticle && (
        <FeedbackForm
          type="release"
          entityId={selectedArticle.id}
          label={`Release Update Needed: ${selectedArticle.title}`}
          hint="Mark if this article needs updating for the release, and provide any specific feedback."
        />
      )}

      {/* Product Knowledge Panel */}
      <ProductKnowledgePanel />

      {/* Previous Releases Section */}
      <div className="previous-releases-section">
        <div className="releases-header">
          <h3>📚 Previous Releases</h3>
          <button className="btn btn-ghost btn-sm" onClick={fetchPreviousReleases}>
            Load Release History
          </button>
        </div>

        {previousReleases.length === 0 && (
          <div className="content-placeholder">
            <p>No previous releases found</p>
            <p className="help-text">Releases you've analyzed and reviewed will appear here</p>
          </div>
        )}

        {previousReleases.length > 0 && !selectedReleaseHistory && (
          <div className="releases-list">
            {previousReleases.map(release => (
              <div key={release.releaseId} className="release-item">
                <div className="release-info">
                  <h4>{release.releaseTitle || release.releaseId}</h4>
                  <p className="release-meta">
                    {release.flaggedCount} articles flagged • {release.updatedCount} updated • {release.pendingCount} pending
                  </p>
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => loadReleaseHistory(release)}
                >
                  View Details
                </button>
              </div>
            ))}
          </div>
        )}

        {selectedReleaseHistory && (
          <div className="release-detail">
            <button className="btn btn-ghost btn-sm" onClick={() => setSelectedReleaseHistory(null)}>
              ← Back to Releases
            </button>
            <h3>{selectedReleaseHistory.releaseTitle || selectedReleaseHistory.releaseId}</h3>
            <div className="release-stats">
              <div className="stat">
                <span className="stat-label">Flagged</span>
                <span className="stat-value">{selectedReleaseHistory.flaggedCount}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Updated</span>
                <span className="stat-value updated">{selectedReleaseHistory.updatedCount}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Pending</span>
                <span className="stat-value pending">{selectedReleaseHistory.pendingCount}</span>
              </div>
            </div>
            <div className="release-audit-log">
              <h4>📋 Review Audit Log</h4>
              <div className="audit-entries">
                {selectedReleaseHistory.articles && selectedReleaseHistory.articles.map(article => (
                  <div key={article.id} className="audit-entry">
                    <div className="entry-header">
                      <span className="entry-title">{article.title}</span>
                      <span className={`status-badge ${article.reviewStatus}`}>
                        {article.reviewStatus === 'updated' ? '✓ Updated' :
                         article.reviewStatus === 'no_update' ? '✓ Does Not Require Updating' :
                         article.reviewStatus === 'review_later' ? '⏱ Review Later' :
                         '⏳ Pending'}
                      </span>
                    </div>
                    <div className="entry-details">
                      <p className="entry-id">Article ID: {article.id}</p>
                      {article.reviewedAt && (
                        <p className="entry-timestamp">
                          Reviewed: {new Date(article.reviewedAt).toLocaleString()} by {article.reviewedBy || 'Unknown'}
                        </p>
                      )}
                      {article.flaggedAt && (
                        <p className="entry-timestamp">
                          Flagged: {new Date(article.flaggedAt).toLocaleString()}
                        </p>
                      )}
                      {article.notes && (
                        <p className="entry-notes"><strong>Notes:</strong> {article.notes}</p>
                      )}
                    </div>
                    <a
                      href={article.helpCenterUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-ghost btn-xs"
                    >
                      View Article ↗
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ReleasesTab
