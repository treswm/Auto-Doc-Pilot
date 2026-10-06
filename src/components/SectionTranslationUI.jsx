import { useState, useEffect } from 'react';

export default function SectionTranslationUI({ onClose, user }) {
  const [sections, setSections] = useState([]);
  const [selectedSectionId, setSelectedSectionId] = useState(null);
  const [manualMode, setManualMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [translatedArticles, setTranslatedArticles] = useState([]);
  const [manualStep, setManualStep] = useState(null); // null, 'prompt', 'import', 'results'
  const [manualPrompt, setManualPrompt] = useState('');
  const [manualPasteValue, setManualPasteValue] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchSections();
  }, []);

  async function fetchSections() {
    try {
      setLoading(true);
      const res = await fetch('/api/translations/sections', { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setSections(data.sections || []);
      }
    } catch (err) {
      setError('Failed to load sections: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAutoTranslate() {
    if (!selectedSectionId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/translations/auto-translate?sectionId=${selectedSectionId}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setTranslatedArticles(data.articles || []);
        if (data.quotaExceeded) {
          setError('OpenAI quota exceeded. Switch to Manual Mode to continue.');
        }
      } else {
        setError(data.error || 'Translation failed');
      }
    } catch (err) {
      setError('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGeneratePrompt() {
    if (!selectedSectionId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/translations/manual-prompt?sectionId=${selectedSectionId}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setManualPrompt(data.userMessage || '');
        setManualStep('prompt');
      } else {
        setError(data.error || 'Failed to generate prompt');
      }
    } catch (err) {
      setError('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleImportManual() {
    if (!manualPasteValue.trim()) {
      setError('Please paste ChatGPT response');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/translations/manual-import', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responseText: manualPasteValue }),
      });
      const data = await res.json();
      if (data.success) {
        setTranslatedArticles(data.articles || []);
        setManualStep('results');
        setManualPasteValue('');
      } else {
        setError(data.error || 'Failed to import translations');
      }
    } catch (err) {
      setError('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload() {
    try {
      setUploading(true);
      setError(null);
      const res = await fetch('/api/translations/upload-results', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        setError(null);
        alert(`✅ Uploaded ${data.uploaded} translations${data.failed > 0 ? ` (${data.failed} failed)` : ''}`);
        setTranslatedArticles([]);
        setManualStep(null);
        setSelectedSectionId(null);
      } else {
        setError(data.error || 'Upload failed');
      }
    } catch (err) {
      setError('Error: ' + err.message);
    } finally {
      setUploading(false);
    }
  }

  const selectedSection = sections.find(s => s.id === selectedSectionId);

  return (
    <div className="section-translation-ui">
      <div className="translation-card">
        <h3>Translate Help Center Sections</h3>

        {error && <div className="alert alert-error">{error}</div>}

        {/* Section Selector */}
        <div className="form-group">
          <label>Select Section:</label>
          <select
            value={selectedSectionId || ''}
            onChange={(e) => setSelectedSectionId(e.target.value)}
            disabled={loading}
          >
            <option value="">Choose a section...</option>
            {sections.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.articleCount} articles)
              </option>
            ))}
          </select>
        </div>

        {/* Mode Toggle */}
        {selectedSectionId && (
          <div className="mode-toggle">
            <button
              className={`mode-btn ${!manualMode ? 'active' : ''}`}
              onClick={() => { setManualMode(false); setManualStep(null); }}
            >
              ⚡ Auto Mode
            </button>
            <button
              className={`mode-btn ${manualMode ? 'active' : ''}`}
              onClick={() => { setManualMode(true); setManualStep(null); }}
            >
              🤖 Manual Mode
            </button>
          </div>
        )}

        {/* Auto Mode */}
        {selectedSectionId && !manualMode && !translatedArticles.length && (
          <button
            className="btn btn-primary"
            onClick={handleAutoTranslate}
            disabled={loading}
          >
            {loading ? 'Translating...' : '🚀 Translate All Articles'}
          </button>
        )}

        {/* Manual Mode - Step 1: Generate Prompt */}
        {selectedSectionId && manualMode && manualStep === null && (
          <button
            className="btn btn-primary"
            onClick={handleGeneratePrompt}
            disabled={loading}
          >
            {loading ? 'Generating...' : '📝 Generate ChatGPT Prompt'}
          </button>
        )}

        {/* Manual Mode - Step 2: Show Prompt */}
        {manualStep === 'prompt' && (
          <div className="prompt-section">
            <p className="help-text">Copy this prompt and paste it into ChatGPT:</p>
            <textarea
              value={manualPrompt}
              readOnly
              className="prompt-textarea"
            />
            <button
              className="btn btn-secondary"
              onClick={() => {
                navigator.clipboard.writeText(manualPrompt);
                alert('Prompt copied to clipboard!');
              }}
            >
              📋 Copy Prompt
            </button>
            <p className="help-text">After ChatGPT responds with JSON, paste it below:</p>
            <textarea
              value={manualPasteValue}
              onChange={(e) => setManualPasteValue(e.target.value)}
              placeholder="Paste ChatGPT response here..."
              className="paste-textarea"
            />
            <button
              className="btn btn-primary"
              onClick={handleImportManual}
              disabled={loading || !manualPasteValue.trim()}
            >
              {loading ? 'Importing...' : 'Continue'}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => setManualStep(null)}
            >
              Back
            </button>
          </div>
        )}

        {/* Results */}
        {translatedArticles.length > 0 && (
          <div className="results-section">
            <h4>✅ Translations Ready ({translatedArticles.length})</h4>
            <div className="articles-list">
              {translatedArticles.slice(0, 5).map(a => (
                <div key={a.articleId} className="article-item">
                  <div className="article-title">{a.title}</div>
                  <div className="article-translated">→ {a.translatedTitle}</div>
                </div>
              ))}
              {translatedArticles.length > 5 && (
                <div className="article-item">
                  <em>... and {translatedArticles.length - 5} more</em>
                </div>
              )}
            </div>
            <button
              className="btn btn-primary"
              onClick={handleUpload}
              disabled={uploading}
            >
              {uploading ? 'Uploading...' : '⬆️ Upload to Zendesk'}
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        .section-translation-ui {
          padding: 1.5rem;
        }

        .translation-card {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          padding: 1.5rem;
        }

        .translation-card h3 {
          margin-top: 0;
          margin-bottom: 1.5rem;
          font-size: 1.25rem;
        }

        .form-group {
          margin-bottom: 1.5rem;
        }

        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
        }

        .form-group select {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid var(--color-border);
          border-radius: 4px;
          background: var(--color-input);
          color: var(--color-text);
          font-size: 1rem;
        }

        .mode-toggle {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
        }

        .mode-btn {
          flex: 1;
          padding: 0.75rem;
          border: 2px solid var(--color-border);
          background: transparent;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s;
        }

        .mode-btn.active {
          border-color: rgb(59, 130, 246);
          background: rgba(59, 130, 246, 0.1);
          color: rgb(59, 130, 246);
        }

        .alert {
          padding: 1rem;
          border-radius: 4px;
          margin-bottom: 1rem;
        }

        .alert-error {
          background: rgba(239, 68, 68, 0.1);
          color: rgb(239, 68, 68);
          border: 1px solid rgb(239, 68, 68);
        }

        .prompt-section {
          margin-top: 1.5rem;
          padding: 1rem;
          background: var(--color-input);
          border-radius: 4px;
        }

        .prompt-textarea,
        .paste-textarea {
          width: 100%;
          min-height: 150px;
          padding: 0.75rem;
          border: 1px solid var(--color-border);
          border-radius: 4px;
          background: var(--color-surface);
          color: var(--color-text);
          font-family: monospace;
          font-size: 0.875rem;
          margin-bottom: 1rem;
        }

        .results-section {
          margin-top: 1.5rem;
          padding: 1rem;
          background: var(--color-input);
          border-radius: 4px;
        }

        .results-section h4 {
          margin-top: 0;
          margin-bottom: 1rem;
        }

        .articles-list {
          background: var(--color-surface);
          border-radius: 4px;
          padding: 0.75rem;
          margin-bottom: 1rem;
          max-height: 200px;
          overflow-y: auto;
        }

        .article-item {
          padding: 0.5rem 0;
          border-bottom: 1px solid var(--color-border);
          font-size: 0.875rem;
        }

        .article-item:last-child {
          border-bottom: none;
        }

        .article-title {
          font-weight: 500;
          color: var(--color-text);
        }

        .article-translated {
          color: var(--color-text-secondary);
          margin-top: 0.25rem;
        }

        .btn {
          padding: 0.75rem 1.5rem;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s;
          margin-right: 0.5rem;
          margin-bottom: 0.5rem;
        }

        .btn-primary {
          background: rgb(59, 130, 246);
          color: white;
        }

        .btn-primary:hover:not(:disabled) {
          background: rgb(37, 99, 235);
        }

        .btn-secondary {
          background: var(--color-border);
          color: var(--color-text);
        }

        .btn-secondary:hover:not(:disabled) {
          background: rgba(0, 0, 0, 0.1);
        }

        .btn-ghost {
          background: transparent;
          border: 1px solid var(--color-border);
          color: var(--color-text);
        }

        .btn-ghost:hover:not(:disabled) {
          background: var(--color-border);
        }

        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .help-text {
          font-size: 0.875rem;
          color: var(--color-text-secondary);
          margin-bottom: 0.75rem;
        }
      `}</style>
    </div>
  );
}
