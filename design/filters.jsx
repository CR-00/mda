// Filters panel — board-aware auto-matching
const { useState: useState_F, useMemo: useMemo_F } = React;

function FiltersPanel({ filters, setFilters, board, autoMatch, setAutoMatch }) {
  // Auto-detect filters that apply given the current board
  const autoActive = useMemo_F(() => {
    if (!autoMatch) return new Set();
    const matched = new Set();
    window.PokerData.FILTERS.texture.forEach(f => {
      if (f.auto && f.auto(board)) matched.add(f.id);
    });
    return matched;
  }, [board, autoMatch]);

  const toggle = (group, id) => {
    const cur = new Set(filters[group] || []);
    if (cur.has(id)) cur.delete(id); else cur.add(id);
    setFilters({ ...filters, [group]: [...cur] });
  };

  const isActive = (group, id) => {
    if (group === "texture" && autoActive.has(id)) return true;
    return (filters[group] || []).includes(id);
  };

  const isAuto = (group, id) => group === "texture" && autoActive.has(id);

  const totalActive =
    (filters.texture || []).length +
    (filters.pool || []).length +
    autoActive.size;

  return (
    <div className="filters-panel">
      <div className="fp-head">
        <div className="fp-title">Filters
          <span className="fp-count">{totalActive}</span>
        </div>
        <label className="auto-toggle">
          <input
            type="checkbox"
            checked={autoMatch}
            onChange={(e) => setAutoMatch(e.target.checked)}
          />
          <span className="at-track"><span className="at-thumb" /></span>
          <span className="at-label">Board-aware</span>
        </label>
      </div>

      {autoMatch && autoActive.size > 0 && (
        <div className="auto-banner">
          <span className="ab-dot" />
          {autoActive.size} filter{autoActive.size > 1 ? "s" : ""} auto-applied from board
        </div>
      )}

      <FilterGroup
        title="Board texture"
        items={window.PokerData.FILTERS.texture}
        isActive={(id) => isActive("texture", id)}
        isAuto={(id) => isAuto("texture", id)}
        onToggle={(id) => toggle("texture", id)}
      />

      <FilterGroup
        title="Player pool"
        items={window.PokerData.FILTERS.pool}
        isActive={(id) => isActive("pool", id)}
        isAuto={() => false}
        onToggle={(id) => toggle("pool", id)}
        single
      />

      <div className="compound-note">
        Filters compound. Sample size shrinks with each.
      </div>
    </div>
  );
}

function FilterGroup({ title, items, isActive, isAuto, onToggle, single }) {
  return (
    <div className="filter-group">
      <div className="fg-title">{title}</div>
      <div className="fg-chips">
        {items.map(it => (
          <button
            key={it.id}
            className={"f-chip" + (isActive(it.id) ? " active" : "") + (isAuto(it.id) ? " auto" : "")}
            onClick={() => onToggle(it.id)}
          >
            {isAuto(it.id) && <span className="fc-auto-dot" />}
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}

window.FiltersPanel = FiltersPanel;
