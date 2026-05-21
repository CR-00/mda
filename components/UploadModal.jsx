import { useState } from 'react';

const POT_TYPES = [
  { id: 'srp', label: 'SRP' },
  { id: '3bp', label: '3BP' },
];

export default function UploadModal({ onClose, onSuccess }) {
  const [preview, setPreview] = useState(null);
  const [potType, setPotType] = useState('srp');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const processText = (text) => {
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object') throw new Error('Pasted text is not a JSON object');
      if (!parsed.query) {
        throw new Error(`No "query" key. Top-level keys found: ${Object.keys(parsed).join(', ') || '(none)'}`);
      }
      const matchup = parsed.query.matchups?.[0];
      const line = parsed.query.line;
      if (!matchup) {
        throw new Error(
          `query.matchups is ${JSON.stringify(parsed.query.matchups)}. ` +
          `query keys: ${Object.keys(parsed.query).join(', ')}`
        );
      }
      if (!line) throw new Error(`query.line is ${JSON.stringify(line)} (expected a string like "B")`);
      if (!Array.isArray(parsed?.data)) throw new Error('Missing data array in JSON');
      const inferredPotType = (parsed?.query?.['Pot Type']?.[0] ?? '').toLowerCase().replace(/\s+/g, '');
      setError(null);
      setPotType(inferredPotType === '3bp' || inferredPotType === '3betpot' ? '3bp' : 'srp');
      setPreview({ matchup, line, rowCount: parsed.data.length, raw: parsed });
    } catch (err) {
      setError(err.message);
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    processText(e.clipboardData.getData('text'));
  };

  const handleUpload = async () => {
    if (!preview) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...preview.raw, _potType: potType }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Upload failed');
      onSuccess({ matchup: d.matchup, line: d.line });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="upload-modal" onClick={(e) => e.stopPropagation()}>
        <div className="um-head">
          <div>
            <div className="cp-eyebrow">Spot data</div>
            <div className="cp-title">Paste JSON</div>
          </div>
          <button className="cp-close" onClick={onClose}>esc</button>
        </div>

        {preview ? (
          <div className="um-preview">
            <div className="um-meta-row">
              <span className="um-label">Matchup</span>
              <span className="um-val mono">{preview.matchup}</span>
            </div>
            <div className="um-meta-row">
              <span className="um-label">Line</span>
              <span className="um-val mono">{preview.line}</span>
            </div>
            <div className="um-meta-row">
              <span className="um-label">Pot type</span>
              <div className="um-seg">
                {POT_TYPES.map(pt => (
                  <button
                    key={pt.id}
                    className={`um-seg-btn${potType === pt.id ? ' active' : ''}`}
                    onClick={() => setPotType(pt.id)}
                  >
                    {pt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="um-meta-row">
              <span className="um-label">Rows</span>
              <span className="um-val mono">{preview.rowCount}</span>
            </div>
            <button
              className="um-clear-btn"
              onClick={() => { setPreview(null); setError(null); }}
            >
              Clear
            </button>
          </div>
        ) : (
          <textarea
            className="um-textarea"
            placeholder="Paste JSON here…"
            onPaste={handlePaste}
            autoFocus
            readOnly
          />
        )}

        {error && <div className="um-error">{error}</div>}

        <div className="um-actions">
          <button className="ghost-btn" onClick={onClose}>Cancel</button>
          <button
            className="um-upload-btn"
            onClick={handleUpload}
            disabled={!preview || loading}
          >
            {loading ? 'Saving…' : 'Save spot'}
          </button>
        </div>
      </div>
    </div>
  );
}
