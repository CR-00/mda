import { useState, useEffect, useCallback } from 'react';
import { shortlistFor, isShortlisted } from '../lib/shortlist';
import { spotsForMode, isOopPfr } from '../lib/spots';
import { SHOW_FISH } from '../lib/flags';
import UploadModal from './UploadModal';

const POT_LABELS = { srp: 'SRP', '3bp': '3BP', '4bp': '4BP' };
const PLAYER_TYPES = SHOW_FISH ? ['reg', 'fish'] : ['reg'];


// Sidebar entries: matchup × playerType (no perspective — both shown in detail)
function buildEntries(mode) {
  return spotsForMode(mode).flatMap(spot =>
    PLAYER_TYPES.map(playerType => ({
      key:         `${spot.id}_${playerType}`,
      label:       spot.label,
      potType:     spot.pot,
      playerType,
      oopIsPfr:    isOopPfr(spot.ip, spot.oop, spot.pot),
      ipDataKey:   `${spot.keyBase}_${playerType}_ip`,
      oopDataKey:  `${spot.keyBase}_${playerType}_oop`,
    }))
  );
}

const ENTRIES_BY_MODE = { simple: buildEntries('simple'), advanced: buildEntries('advanced') };
const VIEW_MODES = [{ id: 'simple', label: 'Simple' }, { id: 'advanced', label: 'Advanced' }];

// Uploaded lines for a data key that are on its shortlist (anything else
// stored, e.g. older flop/turn or rare river uploads, is ignored here).
const riverLines = (uploads, key) => (uploads?.[key]?.lines ?? []).filter(l => isShortlisted(key, l));
const linesFor = (key) => ({ river: shortlistFor(key) });

function PillSection({ heading, linesByStreet, uploadedSet, total, copiedLine, onCopy }) {
  const uploaded = Object.values(linesByStreet).flat().filter(l => uploadedSet.has(l)).length;
  return (
    <div className="cov-persp-section">
      <div className="cov-persp-head">
        <span className="cov-persp-label">{heading}</span>
        <span className="cov-persp-count">{uploaded} / {total}</span>
        <div className="cov-pct-bar cov-persp-bar">
          <div className="cov-pct-fill" style={{ width: `${(uploaded / total) * 100}%` }} />
        </div>
      </div>
      <div className="cov-grid-wrap">
        {Object.entries(linesByStreet).map(([street, lines]) => (
          <div key={street} className="cov-section">
            <div className="cov-section-label">{street}</div>
            <div className="cov-pills">
              {lines.map(line => (
                <button
                  key={line}
                  className={'cov-pill' + (uploadedSet.has(line) ? ' uploaded' : '') + (copiedLine === line ? ' copied' : '')}
                  title={uploadedSet.has(line) ? `${line} — uploaded` : `${line} — missing`}
                  onClick={() => onCopy(line)}
                >
                  {copiedLine === line ? '✓' : line}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CoverageModal({ mode = 'simple', onClose, onUploaded }) {
  const [viewMode, setViewMode] = useState(mode);
  const ENTRIES = ENTRIES_BY_MODE[viewMode];
  const [uploads, setUploads] = useState(null);
  const [selected, setSelected] = useState(null);
  const [potFilter, setPotFilter] = useState('all');
  const [playerFilter, setPlayerFilter] = useState('all');
  const [copiedLine, setCopiedLine] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const copyLine = useCallback((line) => {
    navigator.clipboard.writeText(line);
    setCopiedLine(line);
    setTimeout(() => setCopiedLine(null), 1000);
  }, []);

  const fetchCoverage = useCallback(() => {
    fetch('/api/coverage')
      .then(r => r.json())
      .then(d => setUploads(d.uploads ?? {}))
      .catch(() => setUploads({}));
  }, []);

  useEffect(() => { fetchCoverage(); }, [fetchCoverage]);

  // Keep a selection from the current view: first entry with data, else the first.
  useEffect(() => {
    if (uploads === null) return;
    setSelected(prev => {
      if (prev && ENTRIES.some(e => e.key === prev)) return prev;
      const firstUploaded = ENTRIES.find(e => riverLines(uploads, e.ipDataKey).length || riverLines(uploads, e.oopDataKey).length);
      return firstUploaded?.key ?? ENTRIES[0].key;
    });
  }, [uploads, ENTRIES]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const visible = ENTRIES.filter(e =>
    (potFilter === 'all' || e.potType === potFilter) &&
    (playerFilter === 'all' || e.playerType === playerFilter)
  );

  const selInfo = ENTRIES.find(e => e.key === selected);
  const ipUploadedSet  = new Set(selInfo ? riverLines(uploads, selInfo.ipDataKey)  : []);
  const oopUploadedSet = new Set(selInfo ? riverLines(uploads, selInfo.oopDataKey) : []);

  // Sections are keyed by position (which perspective file the data lives in),
  // labelled by role. PFR shown first.
  const sections = selInfo ? (() => {
    const oop = { key: 'oop', heading: selInfo.oopIsPfr ? 'OOP (PFR)' : 'OOP (PFC)', linesByStreet: linesFor(selInfo.oopDataKey), uploadedSet: oopUploadedSet, total: shortlistFor(selInfo.oopDataKey).length };
    const ip  = { key: 'ip',  heading: selInfo.oopIsPfr ? 'IP (PFC)'  : 'IP (PFR)',  linesByStreet: linesFor(selInfo.ipDataKey),  uploadedSet: ipUploadedSet,  total: shortlistFor(selInfo.ipDataKey).length };
    return selInfo.oopIsPfr ? [oop, ip] : [ip, oop];
  })() : [];

  const totalUploaded = uploads
    ? ENTRIES.reduce((sum, e) =>
        sum +
        riverLines(uploads, e.ipDataKey).length +
        riverLines(uploads, e.oopDataKey).length, 0)
    : 0;
  const totalPossible = ENTRIES.reduce((sum, e) =>
    sum + shortlistFor(e.ipDataKey).length + shortlistFor(e.oopDataKey).length, 0);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="coverage-modal" onClick={e => e.stopPropagation()}>

        <div className="cov-head">
          <div>
            <div className="cp-eyebrow">Data coverage</div>
            <div className="cp-title">Uploaded spots</div>
          </div>
          <div className="cov-head-right">
            <div className="cov-pot-filter">
              {VIEW_MODES.map(m => (
                <button
                  key={m.id}
                  className={'cov-pf-btn' + (viewMode === m.id ? ' active' : '')}
                  onClick={() => setViewMode(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="cov-pot-filter">
              {['all', 'srp', '3bp', '4bp'].map(v => (
                <button
                  key={v}
                  className={'cov-pf-btn' + (potFilter === v ? ' active' : '')}
                  onClick={() => setPotFilter(v)}
                >
                  {v === 'all' ? 'All' : POT_LABELS[v]}
                </button>
              ))}
            </div>
            {SHOW_FISH && (
              <div className="cov-pot-filter">
                {['all', 'reg', 'fish'].map(v => (
                  <button
                    key={v}
                    className={'cov-pf-btn' + (playerFilter === v ? ' active' : '')}
                    onClick={() => setPlayerFilter(v)}
                  >
                    {v === 'all' ? 'All' : v.charAt(0).toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
            )}
            <button className="cov-import-btn" onClick={() => setUploadOpen(true)}>Import</button>
            <button className="cp-close" onClick={onClose}>esc</button>
          </div>
        </div>

        {uploads !== null && (
          <div className="cov-global-bar">
            <div className="cov-global-stats">
              <span className="cov-global-count">{totalUploaded.toLocaleString()}</span>
              <span className="cov-global-of"> / {totalPossible.toLocaleString()} lines across all matchups</span>
            </div>
            <div className="cov-pct-bar">
              <div className="cov-pct-fill" style={{ width: `${(totalUploaded / totalPossible) * 100}%` }} />
            </div>
          </div>
        )}

        {uploads === null ? (
          <div className="cov-loading">Loading…</div>
        ) : (
          <div className="cov-body">

            <div className="cov-sidebar">
              {visible.map((e) => {
                const count = riverLines(uploads, e.ipDataKey).length + riverLines(uploads, e.oopDataKey).length;
                const hasData = count > 0;
                return (
                  <button
                    key={e.key}
                    className={'cov-row' + (selected === e.key ? ' active' : '') + (hasData ? ' has-data' : '')}
                    onClick={() => setSelected(e.key)}
                  >
                    <div className="cov-row-main">
                      <span className="cov-row-pos">{e.label}</span>
                      <span className="cov-row-meta">{POT_LABELS[e.potType]} · {e.playerType}</span>
                    </div>
                    {hasData
                      ? <span className="cov-row-badge">{count}</span>
                      : <span className="cov-row-empty">—</span>
                    }
                  </button>
                );
              })}
            </div>

            <div className="cov-detail">
              {selInfo && (
                <div className="cov-detail-head">
                  <span className="cov-dh-pos">{selInfo.label}</span>
                  <span className="cov-dh-meta">{POT_LABELS[selInfo.potType]} · {selInfo.playerType}</span>
                </div>
              )}
              {selInfo && (
                <>
                  {sections.map(s => (
                    <PillSection
                      key={s.key}
                      heading={s.heading}
                      linesByStreet={s.linesByStreet}
                      uploadedSet={s.uploadedSet}
                      total={s.total}
                      copiedLine={copiedLine}
                      onCopy={copyLine}
                    />
                  ))}
                </>
              )}
            </div>

          </div>
        )}
      </div>

      {uploadOpen && (
        <div onClick={e => e.stopPropagation()}>
          <UploadModal
            mode={viewMode}
            onClose={() => setUploadOpen(false)}
            onSuccess={() => { setUploadOpen(false); fetchCoverage(); onUploaded?.(); }}
          />
        </div>
      )}
    </div>
  );
}
