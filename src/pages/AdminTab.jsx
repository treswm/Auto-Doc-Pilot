import { useState, useEffect, useCallback, useRef } from 'react'
import '../styles/TranslationTab.css'
import '../styles/AdminTab.css'

function getInitials(name) {
  return name
    .split(' ')
    .map(p => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function AddApproverDialog({ dialogRef, onSubmit, submitting, error }) {
  const [formData, setFormData] = useState({ name: '', email: '', slack_user_id: '', role: 'reviewer' })

  const handleSubmit = async (e) => {
    e.preventDefault()
    const success = await onSubmit(formData)
    if (success) setFormData({ name: '', email: '', slack_user_id: '', role: 'reviewer' })
  }

  const handleClose = () => {
    setFormData({ name: '', email: '', slack_user_id: '', role: 'reviewer' })
    dialogRef.current?.close()
  }

  return (
    <dialog ref={dialogRef} className="admin-dialog" onClick={e => e.target === dialogRef.current && handleClose()}>
      <div className="admin-dialog-inner">
        <div className="admin-dialog-header">
          <h3>Add Approver</h3>
          <button type="button" className="admin-dialog-close" onClick={handleClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 3l10 10M13 3L3 13"/>
            </svg>
          </button>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom: 'var(--spacing-4)' }}>{error}</div>}

        <form onSubmit={handleSubmit} className="admin-dialog-form">
          <div className="admin-form-grid">
            <div className="form-field">
              <label>Full Name</label>
              <input
                type="text"
                placeholder="Jane Smith"
                value={formData.name}
                onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div className="form-field">
              <label>Email Address</label>
              <input
                type="email"
                placeholder="jane@company.com"
                value={formData.email}
                onChange={e => setFormData(f => ({ ...f, email: e.target.value }))}
                required
              />
            </div>
            <div className="form-field">
              <label>Slack User ID</label>
              <input
                type="text"
                placeholder="U0123ABCDEF"
                value={formData.slack_user_id}
                onChange={e => setFormData(f => ({ ...f, slack_user_id: e.target.value }))}
                required
              />
            </div>
            <div className="form-field">
              <label>Role</label>
              <select
                value={formData.role}
                onChange={e => setFormData(f => ({ ...f, role: e.target.value }))}
              >
                <option value="reviewer">Reviewer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>

          <div className="admin-dialog-actions">
            <button type="button" className="btn btn-ghost" onClick={handleClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Adding...' : 'Add Approver'}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  )
}

function AdminTab({ user }) {
  const [approvers, setApprovers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [dialogError, setDialogError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [removeConfirm, setRemoveConfirm] = useState(null)
  const dialogRef = useRef(null)

  const fetchApprovers = useCallback(async () => {
    try {
      const res = await fetch('/api/approvers')
      if (!res.ok) throw new Error('Failed to load approvers')
      const data = await res.json()
      setApprovers(data.approvers || [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchApprovers() }, [fetchApprovers])

  const handleAdd = async (formData) => {
    setSubmitting(true)
    setDialogError(null)
    try {
      const res = await fetch('/api/approvers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      if (res.status === 403) throw new Error('Admin access required')
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to add approver')
      }
      const data = await res.json()
      setApprovers(data.approvers)
      dialogRef.current?.close()
      return true
    } catch (err) {
      setDialogError(err.message)
      return false
    } finally {
      setSubmitting(false)
    }
  }

  const handleRoleChange = async (slackUserId, newRole) => {
    try {
      const res = await fetch(`/api/approvers/${slackUserId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })
      if (res.status === 403) throw new Error('Admin access required')
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update role')
      }
      const data = await res.json()
      setApprovers(data.approvers)
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleRemove = async (approver) => {
    const admins = approvers.filter(a => a.role === 'admin')
    if (approver.role === 'admin' && admins.length <= 1) {
      setError('Cannot remove the last admin')
      return
    }
    try {
      const res = await fetch(`/api/approvers/${approver.slack_user_id}`, { method: 'DELETE' })
      if (res.status === 403) throw new Error('Admin access required')
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to remove approver')
      }
      const data = await res.json()
      setApprovers(data.approvers)
      setRemoveConfirm(null)
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return (
    <div className="loading-container">
      <div className="spinner"></div>
      <p>Loading approvers...</p>
    </div>
  )

  const adminCount = approvers.filter(a => a.role === 'admin').length
  const reviewerCount = approvers.filter(a => a.role === 'reviewer').length

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <div>
          <h2 className="admin-title">Team Members</h2>
          <p className="admin-subtitle">
            {adminCount} admin{adminCount !== 1 ? 's' : ''} · {reviewerCount} reviewer{reviewerCount !== 1 ? 's' : ''}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => {
          setDialogError(null)
          dialogRef.current?.showModal()
        }}>
          + Add Approver
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="approvers-list">
        {approvers.map(approver => {
          const isSelf = approver.email === user.email
          const isLastAdmin = approver.role === 'admin' && approvers.filter(a => a.role === 'admin').length <= 1
          const isConfirming = removeConfirm === approver.slack_user_id

          return (
            <div className="approver-card" key={approver.slack_user_id}>
              <div className="approver-avatar">
                {getInitials(approver.name)}
              </div>
              <div className="approver-info">
                <div className="approver-name">
                  {approver.name}
                  {isSelf && <span className="approver-you-badge">you</span>}
                </div>
                <div className="approver-email">{approver.email}</div>
              </div>
              <div className="approver-controls">
                <select
                  className="role-select"
                  value={approver.role || 'reviewer'}
                  onChange={e => handleRoleChange(approver.slack_user_id, e.target.value)}
                  disabled={isSelf}
                  title={isSelf ? 'Cannot change your own role' : ''}
                >
                  <option value="reviewer">Reviewer</option>
                  <option value="admin">Admin</option>
                </select>

                {isConfirming ? (
                  <div className="remove-confirm">
                    <span className="remove-confirm-text">Remove?</span>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleRemove(approver)}
                    >
                      Yes
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setRemoveConfirm(null)}
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn btn-ghost btn-sm admin-remove-btn"
                    onClick={() => setRemoveConfirm(approver.slack_user_id)}
                    disabled={isSelf || isLastAdmin}
                    title={isSelf ? 'Cannot remove yourself' : isLastAdmin ? 'Cannot remove the last admin' : 'Remove approver'}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          )
        })}
        {approvers.length === 0 && (
          <div className="content-placeholder">
            <p>No approvers configured</p>
            <p className="help-text">Add team members who can approve translation workflows.</p>
          </div>
        )}
      </div>

      <AddApproverDialog
        dialogRef={dialogRef}
        onSubmit={handleAdd}
        submitting={submitting}
        error={dialogError}
      />
    </div>
  )
}

export default AdminTab
