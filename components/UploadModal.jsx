import { useState } from 'react';
import { normalizeSnapBody } from '../lib/snapFormat';
import { isRiverLine } from '../lib/lines';
import { uploadDataKey, isKnownSpotKey } from '../lib/uploadKey';
import { isShortlisted } from '../lib/shortlist';

const POT_TYPES = [
  { id: 'srp', label: 'SRP' },
  { id: '3bp', label: '3BP' },
  { id: '4bp', label: '4BP' },
];

const SAVE_MODES = [
  { id: 'simple', label: 'Simple' },
  { id: 'advanced', label: 'Advanced' },
];

export default function UploadModal({ mode = 'simple', onClose, onSuccess }) {
  const [saveMode, setSaveMode] = useState(mode);
  const [preview, setPreview] = useState(null);
  const [potType, setPotType] = useState('srp');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const processText = (text) => {
    try {
      const parsed = normalizeSnapBody(JSON.parse(text));
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
      if (!line) throw new Error(`query.line is ${JSON.stringify(line)} (expected a string like "B-X-B")`);
      if (!isRiverLine(line)) {
        throw new Error(`Only river nodes can be imported. Line "${line}" is not a river line (expected e.g. "B-X-B").`);
      }
      if (!Array.isArray(parsed?.data)) throw new Error('Missing data array in JSON');
      const inferredPotType = (parsed?.query?.['Pot Type']?.[0] ?? '').toLowerCase().replace(/\s+/g, '');
      setError(null);
      setPotType(
        inferredPotType === '4bp' || inferredPotType === '4betpot' ? '4bp'
        : inferredPotType === '3bp' || inferredPotType === '3betpot' ? '3bp'
        : 'srp'
      );
      setPreview({ matchup, line, rowCount: parsed.data.length, raw: parsed });
    } catch (err) {
      setError(err.message);
    }
  };

  // The pot-type toggle changes the target configuration, so check the
  // shortlist against the current choice rather than at paste time.
  // A paste combining several snap matchups can only be saved grouped.
  const multiMatchup = (preview?.raw?.query?.matchups?.length ?? 0) > 1;
  const effectiveMode = multiMatchup ? 'simple' : saveMode;
  const dataKey = preview ? uploadDataKey({ ...preview.raw, _potType: potType }, effectiveMode) : null;
  const blockReason = !preview ? null
    : !dataKey ? 'Advanced mode needs an export of a single matchup.'
    : !isKnownSpotKey(dataKey) ? `${dataKey} isn't one of the app's ${effectiveMode} spots, so it can't be saved.`
    : !isShortlisted(dataKey, preview.line) ? `Line "${preview.line}" isn't on the upload shortlist for ${dataKey}, so it can't be saved.`
    : null;

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
        body: JSON.stringify({ ...preview.raw, _potType: potType, _mode: effectiveMode }),
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
              <span className="um-label">Save as</span>
              <div className="um-seg">
                {SAVE_MODES.map(m => {
                  const disabled = m.id === 'advanced' && multiMatchup;
                  return (
                    <button
                      key={m.id}
                      className={`um-seg-btn${effectiveMode === m.id ? ' active' : ''}`}
                      onClick={() => setSaveMode(m.id)}
                      disabled={disabled}
                      title={disabled ? 'This export combines several matchups, so it can only be saved grouped' : undefined}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="um-meta-row">
              <span className="um-label">Saves to</span>
              <span className="um-val mono">{dataKey ?? '—'}</span>
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

        {blockReason && !error && <div className="um-error">{blockReason}</div>}
        {error && <div className="um-error">{error}</div>}

        <div className="um-actions">
          <button className="ghost-btn" onClick={onClose}>Cancel</button>
          <button
            className="um-upload-btn"
            onClick={handleUpload}
            disabled={!preview || loading || !!blockReason}
          >
            {loading ? 'Saving…' : 'Save spot'}
          </button>
        </div>
      </div>
    </div>
  );
}
