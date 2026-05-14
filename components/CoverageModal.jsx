import { useState, useEffect, useCallback } from 'react';
import { ALL_LINES } from '../lib/lines';
import UploadModal from './UploadModal';

const POT_LABELS = { srp: 'SRP', '3bp': '3BP' };
const PLAYER_TYPES = ['reg', 'fish'];

const GROUP_MATCHUPS = [
  { id: 'LP_vs_BB_srp', label: 'LP vs BB', potType: 'srp', base: 'BB_vs_LP' },
  { id: 'EP_vs_BB_srp', label: 'EP vs BB', potType: 'srp', base: 'BB_vs_EP' },
  { id: 'BB_vs_SB_srp', label: 'BB vs SB', potType: 'srp', base: 'SB_vs_BB' },
  { id: 'LP_vs_BB_3bp', label: 'LP vs BB', potType: '3bp', base: 'BB_vs_LP' },
  { id: 'LP_vs_SB_3bp', label: 'LP vs SB', potType: '3bp', base: 'SB_vs_LP' },
  { id: 'EP_vs_BB_3bp', label: 'EP vs BB', potType: '3bp', base: 'BB_vs_EP' },
  { id: 'EP_vs_SB_3bp', label: 'EP vs SB', potType: '3bp', base: 'SB_vs_EP' },
  { id: 'LP_vs_EP_3bp', label: 'LP vs EP', potType: '3bp', base: 'EP_vs_LP' },
  { id: 'LP_vs_LP_3bp', label: 'LP vs LP', potType: '3bp', base: 'LP_vs_LP' },
  { id: 'BB_vs_SB_3bp', label: 'BB vs SB', potType: '3bp', base: 'SB_vs_BB' },
];

// Segment starting with X then another letter = OOP-only code (check-then-act)
const isOopLine = (line) => line.split('-').some(seg => /^X[A-Z]/.test(seg));

const IP_LINES = {
  flop:  ALL_LINES.flop.filter(l => !isOopLine(l)),
  turn:  ALL_LINES.turn.filter(l => !isOopLine(l)),
  river: ALL_LINES.river.filter(l => !isOopLine(l)),
};
const OOP_LINES = {
  flop:  ALL_LINES.flop.filter(isOopLine),
  turn:  ALL_LINES.turn.filter(isOopLine),
  river: ALL_LINES.river.filter(isOopLine),
};
const IP_TOTAL  = Object.values(IP_LINES).flat().length;
const OOP_TOTAL = Object.values(OOP_LINES).flat().length;

// Sidebar entries: matchup × playerType (no perspective — both shown in detail)
function buildEntries() {
  return GROUP_MATCHUPS.flatMap(gm =>
    PLAYER_TYPES.map(playerType => ({
      key:         `${gm.id}_${playerType}`,
      label:       gm.label,
      potType:     gm.potType,
      playerType,
      ipDataKey:   `${gm.base}_${gm.potType}_${playerType}_ip`,
      oopDataKey:  `${gm.base}_${gm.potType}_${playerType}_oop`,
    }))
  );
}

const ENTRIES = buildEntries();

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

export default function CoverageModal({ onClose }) {
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
      .then(d => {
        setUploads(d.uploads ?? {});
        setSelected(prev => {
          if (prev) return prev;
          const firstUploaded = ENTRIES.find(e => d.uploads[e.ipDataKey] || d.uploads[e.oopDataKey]);
          return firstUploaded?.key ?? ENTRIES[0].key;
        });
      })
      .catch(() => { setUploads({}); setSelected(s => s ?? ENTRIES[0].key); });
  }, []);

  useEffect(() => { fetchCoverage(); }, [fetchCoverage]);

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
  const ipUploadedSet  = new Set(uploads && selInfo ? (uploads[selInfo.ipDataKey]?.lines  ?? []) : []);
  const oopUploadedSet = new Set(uploads && selInfo ? (uploads[selInfo.oopDataKey]?.lines ?? []) : []);

  const totalUploaded = uploads
    ? ENTRIES.reduce((sum, e) =>
        sum +
        (uploads[e.ipDataKey]?.lines.length  ?? 0) +
        (uploads[e.oopDataKey]?.lines.length ?? 0), 0)
    : 0;
  const totalPossible = ENTRIES.length * (IP_TOTAL + OOP_TOTAL);

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
              {['all', 'srp', '3bp'].map(v => (
                <button
                  key={v}
                  className={'cov-pf-btn' + (potFilter === v ? ' active' : '')}
                  onClick={() => setPotFilter(v)}
                >
                  {v === 'all' ? 'All' : POT_LABELS[v]}
                </button>
              ))}
            </div>
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
                const count = (uploads[e.ipDataKey]?.lines.length ?? 0) + (uploads[e.oopDataKey]?.lines.length ?? 0);
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
                  <PillSection
                    heading="IP (PFR)"
                    linesByStreet={IP_LINES}
                    uploadedSet={ipUploadedSet}
                    total={IP_TOTAL}
                    copiedLine={copiedLine}
                    onCopy={copyLine}
                  />
                  <PillSection
                    heading="OOP (PFC)"
                    linesByStreet={OOP_LINES}
                    uploadedSet={oopUploadedSet}
                    total={OOP_TOTAL}
                    copiedLine={copiedLine}
                    onCopy={copyLine}
                  />
                </>
              )}
            </div>

          </div>
        )}
      </div>

      {uploadOpen && (
        <div onClick={e => e.stopPropagation()}>
          <UploadModal
            onClose={() => setUploadOpen(false)}
            onSuccess={() => { setUploadOpen(false); fetchCoverage(); }}
          />
        </div>
      )}
    </div>
  );
}
