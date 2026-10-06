import { useState } from 'react'

/**
 * Suggests published Help Center articles that should be linked inside the
 * release notes, governed by Hi Marley's linking guidelines (config/link-governance.json).
 *
 * Two groups are returned:
 *   - inlineLinks   → contextual links to place inside a specific release-note section
 *   - relatedArticles → broader discovery links for a "Related articles" section
 *
 * Requires that an impact analysis has already run (it reuses the analysis search
 * queries to find candidate articles).
 */
function RelatedArticleLinks({ analysis }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null) // { inlineLinks, relatedArticles, candidatesSearched, queriesUsed }
  const [copiedKey, setCopiedKey] = useState(null)

  // Only show once an analysis exists — we need its search queries / features to find candidates.
  if (!analysis) return null

  const handleSuggest = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/release-notes/suggest-related-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}), // backend uses the release notes saved in the session
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to suggest related links')
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const copyLink = (link, key) => {
    // Copy a Zendesk-ready HTML anchor for pasting into the article Source view.
    const anchorText = link.anchorText || link.articleTitle
    const html = `<a href="${link.url}">${anchorText}</a>`
    navigator.clipboard.writeText(html).then(() => {
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 2000)
    })
  }

  const hasResults =
    result && (result.inlineLinks?.length > 0 || result.relatedArticles?.length > 0)

  return (
    <div className="related-links-section" style={{ marginTop: '1.5rem' }}>
      <div className="related-links-header">
        <h3>🔗 Related Article Links</h3>
        <p className="related-links-subtitle">
          Search your published Help Center for articles that should be linked in these release notes,
          following Hi Marley's linking guidelines. Inline links support required next steps;
          related articles are broader discovery reading.
        </p>
      </div>

      {!result && (
        <button className="btn btn-primary" onClick={handleSuggest} disabled={loading}>
          {loading ? <><span className="loading-spinner"></span> Searching Help Center…</> : '🔍 Suggest Related Links'}
        </button>
      )}

      {error && <p className="related-links-error" style={{ color: '#b91c1c', marginTop: '0.75rem' }}>⚠️ {error}</p>}

      {result && (
        <>
          <p className="related-links-stats" style={{ fontSize: '0.85rem', opacity: 0.8 }}>
            Searched {result.candidatesSearched} published article{result.candidatesSearched !== 1 ? 's' : ''} ·
            {' '}{result.inlineLinks?.length || 0} inline · {result.relatedArticles?.length || 0} related
          </p>

          {!hasResults && (
            <p className="related-links-empty">
              No published articles were a strong enough match to link. That's expected when the release
              introduces brand-new features with no existing documentation yet.
            </p>
          )}

          {result.inlineLinks?.length > 0 && (
            <div className="related-links-group">
              <h4>📌 Inline links (place inside the feature section)</h4>
              {result.inlineLinks.map((link, i) => {
                const key = `inline-${i}`
                return (
                  <div key={key} className="related-link-card" style={cardStyle}>
                    <div className="related-link-section" style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.03em', opacity: 0.75 }}>
                      {link.releaseSection}
                    </div>
                    <div className="related-link-anchor" style={{ fontWeight: 600 }}>
                      <a href={link.url} target="_blank" rel="noopener noreferrer">{link.anchorText || link.articleTitle}</a>
                    </div>
                    <div className="related-link-meta" style={{ fontSize: '0.85rem', opacity: 0.85 }}>
                      → {link.articleTitle}
                    </div>
                    {link.placement && <div className="related-link-placement" style={{ fontSize: '0.85rem' }}><strong>Where:</strong> {link.placement}</div>}
                    {link.reason && <div className="related-link-reason" style={{ fontSize: '0.85rem', opacity: 0.85 }}>{link.reason}</div>}
                    <button className="btn btn-ghost btn-sm" style={{ marginTop: '0.5rem' }} onClick={() => copyLink(link, key)}>
                      {copiedKey === key ? '✓ Copied HTML link' : '⟨/⟩ Copy HTML link'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {result.relatedArticles?.length > 0 && (
            <div className="related-links-group" style={{ marginTop: '1rem' }}>
              <h4>📚 Related articles (Zendesk "Related articles" section)</h4>
              {result.relatedArticles.map((link, i) => {
                const key = `related-${i}`
                return (
                  <div key={key} className="related-link-card" style={cardStyle}>
                    <div className="related-link-anchor" style={{ fontWeight: 600 }}>
                      <a href={link.url} target="_blank" rel="noopener noreferrer">{link.articleTitle}</a>
                    </div>
                    {link.reason && <div className="related-link-reason" style={{ fontSize: '0.85rem', opacity: 0.85 }}>{link.reason}</div>}
                    <button className="btn btn-ghost btn-sm" style={{ marginTop: '0.5rem' }} onClick={() => copyLink({ ...link, anchorText: link.articleTitle }, key)}>
                      {copiedKey === key ? '✓ Copied HTML link' : '⟨/⟩ Copy HTML link'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          <button className="btn btn-ghost btn-sm" style={{ marginTop: '0.75rem' }} onClick={handleSuggest} disabled={loading}>
            {loading ? 'Re-running…' : '↻ Re-run suggestion'}
          </button>
        </>
      )}
    </div>
  )
}

const cardStyle = {
  border: '1px solid var(--border-color, #e5e7eb)',
  borderRadius: '8px',
  padding: '0.75rem 1rem',
  marginTop: '0.5rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
}

export default RelatedArticleLinks
