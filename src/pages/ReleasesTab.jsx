import FeedbackForm from '../components/FeedbackForm'
import '../styles/Tabs.css'

function ReleasesTab({ user }) {
  return (
    <div className="tab-container">
      <div className="tab-header">
        <h2>Release Notes Analysis</h2>
      </div>

      <div className="info-box">
        <p>
          🚀 <strong>Phase 3:</strong> Upload release notes here to identify which Help Center articles
          need updating. The system will extract screenshots, match affected articles, and produce
          a list of direct links so your team can review and update them quickly.
        </p>
      </div>

      <div className="content-placeholder">
        <p>📝 Release notes analysis coming in Phase 3</p>
        <p className="help-text">
          Once Phase 1 is live, Phase 3 will let you paste or upload release notes,
          automatically identify affected articles, and flag them for your team with
          direct Help Center links.
        </p>
      </div>

      <FeedbackForm
        type="release"
        entityId="phase3-placeholder"
        label="Release Notes Feedback"
        hint="Have feedback on how release notes should map to Help Center articles? Share it here to improve future matching."
      />
    </div>
  )
}

export default ReleasesTab
