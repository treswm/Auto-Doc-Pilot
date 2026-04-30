import { useState, useEffect } from 'react'

/**
 * ProductKnowledgePanel
 * Lets users view, add, edit, and delete rules in config/product-context.json.
 * Appears in the Releases tab so teams can teach Auto Doc Pilot over time.
 */
function ProductKnowledgePanel() {
  const [isOpen, setIsOpen] = useState(false)
  const [rules, setRules] = useState([])
  const [lastUpdated, setLastUpdated] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [newRule, setNewRule] = useState('')
  const [addingRule, setAddingRule] = useState(false)
  const [editingIndex, setEditingIndex] = useState(null)
  const [editingText, setEditingText] = useState('')
  const [savingIndex, setSavingIndex] = useState(null)
  const [deletingIndex, setDeletingIndex] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  const showSuccess = (msg) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 3000)
  }

  const fetchRules = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/product-context', { credentials: 'include' })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to load rules')
      setRules(data.rules || [])
      setLastUpdated(data.lastUpdated)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen && rules.length === 0 && !loading) {
      fetchRules()
    }
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddRule = async () => {
    if (!newRule.trim()) return
    setAddingRule(true)
    setError(null)
    try {
      const res = await fetch('/api/product-context/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ rule: newRule.trim() })
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to add rule')
      setRules(data.rules)
      setNewRule('')
      showSuccess('Rule added!')
    } catch (err) {
      setError(err.message)
    } finally {
      setAddingRule(false)
    }
  }

  const handleEditSave = async (index) => {
    if (!editingText.trim()) return
    setSavingIndex(index)
    setError(null)
    try {
      const res = await fetch(`/api/product-context/rules/${index}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ rule: editingText.trim() })
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to update rule')
      setRules(data.rules)
      setEditingIndex(null)
      setEditingText('')
      showSuccess('Rule updated!')
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingIndex(null)
    }
  }

  const handleDelete = async (index) => {
    if (!window.confirm('Delete this rule?')) return
    setDeletingIndex(index)
    setError(null)
    try {
      const res = await fetch(`/api/product-context/rules/${index}`, {
        method: 'DELETE',
        credentials: 'include'
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to delete rule')
      setRules(data.rules)
      showSuccess('Rule removed.')
    } catch (err) {
      setError(err.message)
    } finally {
      setDeletingIndex(null)
    }
  }

  return (
    <div className="product-knowledge-panel">
      <button
        className="pkp-toggle"
        onClick={() => setIsOpen(o => !o)}
      >
        <span className="pkp-toggle-icon">{isOpen ? '▾' : '▸'}</span>
        🧠 Product Knowledge Context
        <span className="pkp-toggle-hint">
          {isOpen ? 'collapse' : `teach Auto Doc Pilot about your product`}
        </span>
      </button>

      {isOpen && (
        <div className="pkp-body">
          <p className="pkp-description">
            These plain-English rules are injected into every release scan. Use them to teach Auto Doc Pilot patterns like <em>"inbox changes don't affect integration docs."</em> The more specific the better — changes take effect immediately.
          </p>

          {lastUpdated && (
            <p className="pkp-last-updated">Last updated: {lastUpdated}</p>
          )}

          {error && <div className="pkp-error">{error}</div>}
          {successMsg && <div className="pkp-success">{successMsg}</div>}

          {loading ? (
            <p className="pkp-loading">Loading rules…</p>
          ) : (
            <>
              {rules.length === 0 ? (
                <p className="pkp-empty">No rules yet. Add one below to get started.</p>
              ) : (
                <ul className="pkp-rules-list">
                  {rules.map((rule, i) => (
                    <li key={i} className="pkp-rule-item">
                      {editingIndex === i ? (
                        <div className="pkp-edit-row">
                          <textarea
                            className="pkp-edit-textarea"
                            value={editingText}
                            onChange={e => setEditingText(e.target.value)}
                            rows={3}
                            autoFocus
                          />
                          <div className="pkp-edit-actions">
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => handleEditSave(i)}
                              disabled={savingIndex === i}
                            >
                              {savingIndex === i ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => { setEditingIndex(null); setEditingText('') }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="pkp-rule-row">
                          <span className="pkp-rule-number">{i + 1}.</span>
                          <span className="pkp-rule-text">{rule}</span>
                          <div className="pkp-rule-actions">
                            <button
                              className="btn btn-ghost btn-xs"
                              onClick={() => { setEditingIndex(i); setEditingText(rule) }}
                            >
                              Edit
                            </button>
                            <button
                              className="btn btn-ghost btn-xs pkp-delete-btn"
                              onClick={() => handleDelete(i)}
                              disabled={deletingIndex === i}
                            >
                              {deletingIndex === i ? '…' : 'Delete'}
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <div className="pkp-add-section">
                <p className="pkp-add-label">Add a new rule</p>
                <textarea
                  className="pkp-add-textarea"
                  placeholder="e.g. Changes to the inbox badge only affect the Inbox article, not API docs."
                  value={newRule}
                  onChange={e => setNewRule(e.target.value)}
                  rows={3}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddRule()
                  }}
                />
                <button
                  className="btn btn-primary"
                  onClick={handleAddRule}
                  disabled={addingRule || !newRule.trim()}
                >
                  {addingRule ? 'Adding…' : '+ Add Rule'}
                </button>
                <span className="pkp-kbd-hint">⌘↵ to add</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default ProductKnowledgePanel
