import { useEffect } from 'react';

// One entry per toggleable preference. Add rows here as more settings land.
const TOGGLES = [
  {
    key: 'clearBoardOnReset',
    label: 'Clear board on reset',
    desc: 'Empty the board when you return to the root node or change the spot.',
  },
];

export default function SettingsModal({ settings, setSetting, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <div className="cov-head">
          <div>
            <div className="cp-eyebrow">Preferences</div>
            <div className="cp-title">Settings</div>
          </div>
          <button className="cp-close" onClick={onClose}>esc</button>
        </div>

        <div className="settings-body">
          {TOGGLES.map(t => (
            <div
              key={t.key}
              className="settings-row"
              onClick={() => setSetting(t.key, !settings[t.key])}
            >
              <div className="settings-row-text">
                <span className="settings-row-label">{t.label}</span>
                <span className="settings-row-desc">{t.desc}</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={!!settings[t.key]}
                aria-label={t.label}
                className={'settings-switch' + (settings[t.key] ? ' on' : '')}
                onClick={(e) => { e.stopPropagation(); setSetting(t.key, !settings[t.key]); }}
              ><i /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
