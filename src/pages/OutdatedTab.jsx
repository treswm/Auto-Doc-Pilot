import FeedbackForm from '../components/FeedbackForm'
import '../styles/Tabs.css'

function OutdatedTab({ user }) {
  return (
    <div className="tab-container">
      <div className="tab-header">
        <h2>Outdated Documentation</h2>
      </div>

      <div className="info-box">
        <p>
          ⏰ <strong>Phase 2:</strong> Articles flagged as potentially outdated will appear here.
          Review each one, mark it "Needs Updating" or "Still Good", and a Jira ticket will be created automatically.
          Each article links directly to the Help Center so you can review the current content.
        </p>
      </div>

      <div className="content-placeholder">
        <p>📚 Outdated article detection coming in Phase 2</p>
        <p className="help-text">
          Phase 2 will scan every 2 weeks for articles that may be out of date based on
          age, product changes, and terminology drift. Check back after Phase 1 is live.
        </p>
      </div>

      <FeedbackForm
        type="outdated"
        entityId="phase2-placeholder"
        label="Outdated Detection Feedback"
        hint="Have a suggestion for what makes an article 'outdated'? Share it here and we'll factor it into the detection criteria."
      />
    </div>
  )
}

export default OutdatedTab
