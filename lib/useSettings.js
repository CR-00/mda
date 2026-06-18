import { useState, useCallback } from 'react';

// User-facing UI preferences, persisted to localStorage. Keep this small and
// purely about local UI behaviour — anything that belongs in a shareable URL
// (spot, line, board) stays in the query string, not here.
const STORAGE_KEY = 'mda.settings';

export const SETTINGS_DEFAULTS = {
  // Empty the board when returning to the root node or switching spots.
  clearBoardOnReset: false,
};

function load() {
  if (typeof window === 'undefined') return SETTINGS_DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...SETTINGS_DEFAULTS, ...JSON.parse(raw) } : SETTINGS_DEFAULTS;
  } catch {
    return SETTINGS_DEFAULTS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState(load);
  const setSetting = useCallback((key, value) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);
  return [settings, setSetting];
}
