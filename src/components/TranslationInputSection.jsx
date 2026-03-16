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

Hi Marley Comprehensive Glossary:

A
AI Case Summary - Automatically generated summary of a conversation thread, allowing adjusters and supervisors to quickly review case history and next steps without reading every message.
AI Coaching - Real-time coaching alerts that help operators prioritize next actions, maintain consistency, and improve performance.
AI Photo Assist / AI Photo Analysis - AI capabilities that help interpret claim photos to support triage and guide next steps.
AI Suggested Response / Writing Assistant - AI-generated reply suggestions surfaced within the conversation thread to help operators respond faster and more consistently.
Alerts - System-generated, proactive signals that automatically detect when a conversation needs attention — such as delays, unanswered questions, or a shift in customer sentiment.
Auto Replies - Automated responses triggered by conditions such as out-of-office, inactivity, or away-from-desk status.
Away Message - An automatic reply sent to a policyholder when an operator is unavailable.

B
Branded Messaging - Customer-facing message experience aligned to the carrier's brand identity and tone.
Brands - An option available when creating a case that allows the operator to associate the conversation with a specific carrier brand.

C
Case (Conversation Thread) - A unified, secure communication stream associated with a specific claim or service interaction.
Case Reassignment - The transfer of case ownership from one operator to another without losing conversation context, history, or media.
Case Transcripts - Exportable records of the full conversation for compliance, documentation, and audit purposes.
Case Visibility (Public/Private) - Controls that determine whether certain content is visible to the policyholder or kept as internal-only notes.
Configurable Opt-In - Flexible consent flow options for how customers are enrolled in and confirm their willingness to receive text messages.
Conversational FNOL - A text-enabled claim intake experience that captures the customer's account of a loss and seamlessly continues as an ongoing conversation thread.

D
Dashboards - Reporting views that summarize performance metrics, team activity, and operational trends for supervisors and leaders.
Deliverability Monitoring & Alerts - System monitoring that detects and flags messaging delivery issues and anomalies.

E
Email Notifications - Optional notifications delivered via email for platform updates, alerts, or workflow events.
Escalation Signals - Indicators that help teams identify conversations at risk due to negative sentiment, prolonged delays, or unanswered questions.

F
Focused Operator - An inbox mode that reduces noise and helps operators concentrate on their highest-priority conversations.

G
Group Management - Admin capability to create and manage teams, groups, and case assignment structures.

H
Hi Marley Connect - A lightweight way to bring Hi Marley capabilities into an insurance professional's existing workflow.
Hi Marley Insurance Cloud - The platform foundation powering Hi Marley's Claims, Service, and Sales solutions.

I
Image Redaction - Automated masking or removal of sensitive information detected within images shared in the conversation.
Inbound Media - Photos, videos, and documents received from customers or partners directly within the conversation thread.
Inactivity Message - An automated message triggered when a conversation has been inactive for a configured period.
Intelligent Translation - Real-time, bidirectional message translation supporting up to 25 languages.

M
Message Delivery Rate - A measure of how reliably messages are being delivered to policyholders.
Message Intelligence - AI-driven analysis that surfaces risk, urgency, and operational signals within conversations.
Message Prefix - An identifier displayed in the conversation showing which user or team sent a message.
Message Templates - Pre-built or configurable messages for common claim and service scenarios.
Mobile App - Mobile access for operators and field users to manage conversations, cases, and workflows from any device.
Multi-Party Texting - The ability to include vendors, third-party partners, or other external participants within the same conversation thread.
Multi-User Collaboration - The ability for multiple internal users to view and collaborate on a single case simultaneously.

N
Needs Action Label - A conversation indicator that signals a follow-up or response is required from the operator.
Needs Attention Label - An AI-generated indicator that flags conversations that may be at risk.

O
One-Way Notifications - Outbound updates sent to policyholders that do not require a response.
OOO (Out-of-Office) Settings - Configuration that allows operators to set coverage periods and automatic replies during planned absences.
Opt-In / Opt-Out Management - Consent handling that tracks policyholder preferences and automatically respects opt-out requests.
Organizational Dashboard - A high-level view of operational performance, adoption, and activity across the entire organization.
Outbound Media - The ability to send photos, documents, or other files to customers or partners securely within the conversation thread.

P
Permission Management / Role-Based Access Control - Admin controls that govern which users can access specific settings, data, and platform features.
Policyholder Profile - Customer profile data connected to core systems of record.
Policyholder Pulse Survey - An embedded customer satisfaction survey delivered within the conversation thread.
Primary Operator - The main user assigned to manage and own a case.

Q
Queue Management - Routing configuration that distributes cases across teams based on rules, workload, or ownership models.

R
Recipient Number Lookup - Validation that checks whether a number is reachable before sending.
Redaction (Text & Image) - Automated masking or removal of sensitive information from message content and images.

S
Scheduled Messages - Messages configured to send at a specific time or cadence.
Secondary Operator - An additional internal user assigned to support a case.
Sentiment Analysis / Negative Sentiment Alerting - AI-driven evaluation of a policyholder's tone and emotional signals.
Single Sign-On (SSO) - Authentication integration that allows users to log in using their existing enterprise credentials.
Suggested Actions - System recommendations that guide operators toward the best next step within a conversation.

T
Tags / Labels / Badges - Visual indicators applied to conversations that help operators quickly filter and identify cases by status or condition.
Team Routing Rules - Rules that control which users or teams receive incoming cases.
Time to First Contact (TTFC) - A key performance metric measuring the elapsed time between claim intake and first outreach.
Total Loss Assist (TLA) - A solution that integrates with total loss workflows to reduce cycle time.
Two-Way Texting - Real-time SMS communication between policyholders and carrier representatives.

U
Unaddressed Badges - Visual indicators on a conversation showing that a message requires a response or follow-up action.
Unified Conversation Thread - A single, continuous communication stream connecting adjusters, policyholders, and third-party partners.

V
Verisk XactAnalysis Integration - A real-time integration that centralizes property claim updates and communications.
Voice to Text - A capability that converts voice content into text to accelerate case handling.

W
Warm Transfer - The reassignment of a case to another operator with full context preserved.
Welcome Flow - A configurable onboarding workflow that defines the welcome message and follow-up messages at the start of a new conversation.`
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
