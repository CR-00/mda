import { useEffect, useState } from 'react';
import { STRATEGY_BUCKETS, DEFAULT_BUCKET } from '../lib/strategyBuckets';

// --- tiny markdown renderer (headings, tables, lists, hr, code, bold) ---
function inline(text, keyBase) {
  // split on `code` and **bold**, keep order
  const parts = [];
  let rest = text;
  let i = 0;
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/;
  let m;
  while ((m = rest.match(re))) {
    if (m.index > 0) parts.push(rest.slice(0, m.index));
    const tok = m[0];
    if (tok.startsWith('`')) parts.push(<code key={`${keyBase}-c${i}`} className="sm-code">{tok.slice(1, -1)}</code>);
    else parts.push(<b key={`${keyBase}-b${i}`}>{tok.slice(2, -2)}</b>);
    rest = rest.slice(m.index + tok.length);
    i++;
  }
  if (rest) parts.push(rest);
  return parts;
}

function renderMarkdown(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  let key = 0;
  const push = (el) => out.push(el);

  while (i < lines.length) {
    const line = lines[i];

    // code fence
    if (line.startsWith('```')) {
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { buf.push(lines[i]); i++; }
      i++; // skip closing fence
      push(<pre key={key++} className="sm-pre"><code>{buf.join('\n')}</code></pre>);
      continue;
    }

    // horizontal rule
    if (/^---+\s*$/.test(line)) { push(<hr key={key++} className="sm-hr" />); i++; continue; }

    // headings
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length;
      const Tag = `h${Math.min(lvl + 1, 6)}`;
      push(<Tag key={key++} className={`sm-h sm-h${lvl}`}>{inline(h[2], `h${key}`)}</Tag>);
      i++; continue;
    }

    // table: header row followed by a |---|---| separator
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[ :|-]+\|[ :|-]+/.test(lines[i + 1])) {
      const splitRow = (r) => r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
      const header = splitRow(line);
      i += 2; // skip header + separator
      const body = [];
      while (i < lines.length && lines[i].includes('|')) { body.push(splitRow(lines[i])); i++; }
      push(
        <table key={key++} className="sm-table">
          <thead><tr>{header.map((c, j) => <th key={j}>{inline(c, `th${key}-${j}`)}</th>)}</tr></thead>
          <tbody>{body.map((row, ri) => (
            <tr key={ri}>{row.map((c, ci) => <td key={ci}>{inline(c, `td${key}-${ri}-${ci}`)}</td>)}</tr>
          ))}</tbody>
        </table>
      );
      continue;
    }

    // list block (- or 1.)
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const items = [];
      const ordered = /^\s*\d+\.\s+/.test(line);
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''));
        i++;
      }
      const Tag = ordered ? 'ol' : 'ul';
      push(<Tag key={key++} className="sm-list">{items.map((it, j) => <li key={j}>{inline(it, `li${key}-${j}`)}</li>)}</Tag>);
      continue;
    }

    // blank line
    if (line.trim() === '') { i++; continue; }

    // paragraph (gather consecutive non-blank, non-special lines)
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,4}\s|```|---+\s*$)/.test(lines[i]) && !lines[i].includes('|') && !/^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
      buf.push(lines[i]); i++;
    }
    push(<p key={key++} className="sm-p">{inline(buf.join(' '), `p${key}`)}</p>);
  }
  return out;
}

export default function SummaryPage() {
  const [bucket, setBucket] = useState(DEFAULT_BUCKET);
  const [md, setMd] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setMd(null); setError(null);
    fetch(`/api/summary?bucket=${encodeURIComponent(bucket)}`)
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(d => setMd(d.markdown))
      .catch(e => setError(String(e)));
  }, [bucket]);

  return (
    <div className="sm-page">
      <header className="sm-head">
        <div className="sm-title"><span className="sm-mark">✎</span> Strategy Summary</div>
        <div className="sm-controls">
          <select value={bucket} onChange={e => setBucket(e.target.value)}>
            {STRATEGY_BUCKETS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
          <a className="sm-home" href="/">← analyzer</a>
        </div>
      </header>

      {error && <div className="sm-error">{error}</div>}
      {!md && !error && <div className="sm-loading">loading…</div>}
      {md && <article className="sm-doc">{renderMarkdown(md)}</article>}
    </div>
  );
}
