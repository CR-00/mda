import { describe, it, expect } from 'vitest';
import { getBoardTextures } from '../lib/boardTextures.js';

// "AsKs7d6d2d" → [{rank:'A',suit:'s'}, ...]
function board(str) {
  const cards = [];
  for (let i = 0; i < str.length; i += 2) {
    cards.push({ rank: str[i], suit: str[i + 1] });
  }
  return cards;
}

function textures(str, opts) {
  return getBoardTextures(board(str), opts);
}

function hasTexture(str, label, opts) {
  return textures(str, opts).includes(label);
}

// ─── Flop suitedness ─────────────────────────────────────────────────────────

describe('flop suitedness', () => {
  it('monotone flop', () => {
    expect(hasTexture('AhKhTh', 'Flop Monotone')).toBe(true);
    expect(hasTexture('AhKhTh', 'Flop Two-Tone')).toBe(false);
    expect(hasTexture('AhKhTh', 'Flop Rainbow')).toBe(false);
  });

  it('two-tone flop', () => {
    expect(hasTexture('AhKdTh', 'Flop Two-Tone')).toBe(true);
    expect(hasTexture('AhKdTh', 'Flop Monotone')).toBe(false);
    expect(hasTexture('AhKdTh', 'Flop Rainbow')).toBe(false);
  });

  it('rainbow flop', () => {
    expect(hasTexture('AhKdTc', 'Flop Rainbow')).toBe(true);
    expect(hasTexture('AhKdTc', 'Flop Monotone')).toBe(false);
    expect(hasTexture('AhKdTc', 'Flop Two-Tone')).toBe(false);
  });
});

// ─── Turn flush progression ───────────────────────────────────────────────────

describe('turn flush progression', () => {
  it('Turn 4-flush: all 4 cards same suit', () => {
    // monotone flop + matching turn
    expect(hasTexture('AhKhTh9h', 'Turn 4-flush')).toBe(true);
  });

  it('Turn BDFD Comes: rainbow flop, turn matches one suit', () => {
    // Ah Kd Tc = rainbow, 9d = 2nd diamond
    expect(hasTexture('AhKdTc9d', 'Turn BDFD Comes')).toBe(true);
  });

  it('Turn Flush Hits: two-tone flop becomes 3-of-suit on turn', () => {
    // Ah Kd Th = two-tone (2 hearts), 6h = 3rd heart
    expect(hasTexture('AhKdTh6h', 'Turn Flush Hits')).toBe(true);
  });

  it('Turn Double Flush Draw: two-tone flop stays two-tone with 2+2', () => {
    // As Ks = spades, 7d 6d = diamonds; allMost=2 each
    expect(hasTexture('AsKs7d6d', 'Turn Double Flush Draw')).toBe(true);
  });

  it('Turn Flush Stays: monotone flop, turn adds off-suit card', () => {
    // Ah Kh Th = monotone (3 hearts), 9s = off-suit
    expect(hasTexture('AhKhTh9s', 'Turn Flush Stays')).toBe(true);
  });

  it('Turn Flush Bricks: two-tone flop, turn adds 3rd suit', () => {
    // Ah Kd = two-tone, Tc = 3rd suit
    expect(hasTexture('AhKdTh9c', 'Turn Flush Bricks')).toBe(true);
  });

  it('Turn Rainbow: rainbow flop, turn adds 4th suit', () => {
    expect(hasTexture('AhKdTc9s', 'Turn Rainbow')).toBe(true);
  });
});

// ─── River flush — the critical section ──────────────────────────────────────

describe('river flush: reported bugs', () => {
  it('AsKs7d6d2d — flush hits (3 diamonds) should be Flush Hits not Bricks', () => {
    expect(hasTexture('AsKs7d6d2d', 'River Flush Hits (flop two-tone)')).toBe(true);
    expect(hasTexture('AsKs7d6d2d', 'River Flush Bricks (flop two-tone)')).toBe(false);
  });

  it('AsKs7d6d2c — no flush (adds 3rd suit) should be Flush Bricks not Hits', () => {
    expect(hasTexture('AsKs7d6d2c', 'River Flush Bricks (flop two-tone)')).toBe(true);
    expect(hasTexture('AsKs7d6d2c', 'River Flush Hits (flop two-tone)')).toBe(false);
  });
});

describe('river flush: flush hits', () => {
  it('Flush Hits (flop two-tone): double flush draw resolves — spades hit', () => {
    // As Ks Jd 7s = 3 spades on turn (Turn Flush Hits from Ks As Jd + 7s)
    // Actually let's do: As Ks 7d 6s 2s = flop two-tone (As Ks 7d), turn 6s = 3 spades, river 2s = 4... that's 4-flush
    // Use: Kh 9h 7d 3h 2d = flop: Kh 9h 7d (two-tone, 2 hearts), turn: 3h (3 hearts = Flush Hits), river: 2d
    // Wait river would be Flush Stays then. Let me use: Kh 9h 7d 4d 2h
    // flop: Kh 9h 7d (two-tone), turn: 4d (2+2 = Double Flush Draw), river: 2h (3 hearts → Flush Hits)
    expect(hasTexture('Kh9h7d4d2h', 'River Flush Hits (flop two-tone)')).toBe(true);
    expect(hasTexture('Kh9h7d4d2h', 'River Flush Bricks (flop two-tone)')).toBe(false);
  });

  it('Flush Hits (flop two-tone): other suit of draw resolves — diamonds hit', () => {
    // Kh 9h 7d 4d 2d = flop: Kh 9h 7d (two-tone), turn: 4d (2+2), river: 2d (3 diamonds)
    expect(hasTexture('Kh9h7d4d2d', 'River Flush Hits (flop two-tone)')).toBe(true);
  });

  it('Flush Hits (flop rainbow): BDFD on turn, completes on river', () => {
    // Ah Kd Tc 9d 2d = rainbow flop, turn 9d = BDFD, river 2d = 3 diamonds
    expect(hasTexture('AhKdTc9d2d', 'River Flush Hits (flop rainbow)')).toBe(true);
    expect(hasTexture('AhKdTc9d2d', 'River Flush Bricks (flop rainbow)')).toBe(false);
  });
});

describe('river flush: flush stays', () => {
  it('Flush Stays (flop monotone): flush survives both turn and river', () => {
    // Ah Kh Th = monotone flop, 9c turn (flush stays), 2c river (still 3 hearts)
    expect(hasTexture('AhKhTh9c2c', 'River Flush Stays (flop monotone)')).toBe(true);
    expect(hasTexture('AhKhTh9c2c', 'River Flush Hits (flop two-tone)')).toBe(false);
  });

  it('Flush Stays (flop two-tone): flush came in on turn, stays on river', () => {
    // Ah Kd Th = two-tone (2 hearts), 6h turn = 3 hearts (Flush Hits), 3d river = stays
    expect(hasTexture('AhKdTh6h3d', 'River Flush Stays (flop two-tone)')).toBe(true);
    expect(hasTexture('AhKdTh6h3d', 'River Flush Stays (flop monotone)')).toBe(false);
  });
});

describe('river flush: flush bricks', () => {
  it('Flush Bricks (flop two-tone): double flush draw fails to complete', () => {
    // As Ks 7d 6d 2c = two-tone flop, double flush draw on turn, neither suit adds 3rd on river
    expect(hasTexture('AsKs7d6d2c', 'River Flush Bricks (flop two-tone)')).toBe(true);
    expect(hasTexture('AsKs7d6d2c', 'River Flush Hits (flop two-tone)')).toBe(false);
  });

  it('Flush Bricks (flop two-tone): flush draw stays at 2', () => {
    // Kh 9h 7d 4d 2c = flop two-tone, double flush draw on turn, river off-suit
    expect(hasTexture('Kh9h7d4d2c', 'River Flush Bricks (flop two-tone)')).toBe(true);
  });

  it('Flush Bricks (flop rainbow): BDFD on turn, bricks on river', () => {
    // Ah Kd Tc 9d 2c = rainbow flop, BDFD (2 diamonds) on turn, river 2c = no improvement
    expect(hasTexture('AhKdTc9d2c', 'River Flush Bricks (flop rainbow)')).toBe(true);
    expect(hasTexture('AhKdTc9d2c', 'River Flush Hits (flop rainbow)')).toBe(false);
  });
});

describe('river flush: 4-flush early exits', () => {
  it('River 4-flush (mono flop): monotone flop + 4th of suit anywhere', () => {
    // Ah Kh Th 9h on turn (Turn 4-flush) then 2c on river
    // Actually river exit: allMost=4 meaning 4 cards of same suit in 5 cards
    // Ah Kh Th 9s 2h = flop monotone (Ah Kh Th), turn 9s (Flush Stays), river 2h (4 hearts)
    expect(hasTexture('AhKhTh9s2h', 'River 4-flush (mono flop)')).toBe(true);
  });

  it('River 4-flush (two-tone flop): flush came in on turn then 4th on river', () => {
    // Ah Kd Th = two-tone, 6h = Flush Hits (3 hearts on turn), 2h = 4 hearts
    expect(hasTexture('AhKdTh6h2h', 'River 4-flush (two-tone flop)')).toBe(true);
  });
});

// ─── Filter: implied textures are removed ────────────────────────────────────

describe('filterImplied: flush textures remove their implied predecessors', () => {
  it('River Flush Hits (two-tone) removes Flop Two-Tone and Turn Flush Bricks from output', () => {
    const out = textures('AsKs7d6d2d'); // filter=true by default
    expect(out).toContain('River Flush Hits (flop two-tone)');
    expect(out).not.toContain('Flop Two-Tone');
    expect(out).not.toContain('Turn Flush Bricks');
  });

  it('River Flush Stays (two-tone) removes Flop Two-Tone and Turn Flush Hits', () => {
    const out = textures('AhKdTh6h3d');
    expect(out).toContain('River Flush Stays (flop two-tone)');
    expect(out).not.toContain('Flop Two-Tone');
    expect(out).not.toContain('Turn Flush Hits');
  });

  it('River Flush Stays (monotone) removes Flop Monotone and Turn Flush Stays', () => {
    const out = textures('AhKhTh9c2c');
    expect(out).toContain('River Flush Stays (flop monotone)');
    expect(out).not.toContain('Flop Monotone');
    expect(out).not.toContain('Turn Flush Stays');
  });

  it('filter: false preserves all textures including implied ones', () => {
    const out = textures('AsKs7d6d2d', { filter: false });
    expect(out).toContain('River Flush Hits (flop two-tone)');
    expect(out).toContain('Flop Two-Tone');
  });
});

// ─── River blank ─────────────────────────────────────────────────────────────

describe('River blank', () => {
  it('flush completing river is never blank', () => {
    // Two-tone flop, double flush draw, diamonds complete on river
    expect(hasTexture('AsKs7d6d2d', 'River blank')).toBe(false);
    // Two-tone flop, flush came in on turn, bricks on river (blank can fire here, not a flush hit)
    expect(hasTexture('AsKs7d6d2d', 'River Flush Hits (flop two-tone)')).toBe(true);
  });

  it('flush-completing river (rainbow → BDFD → hits) is never blank', () => {
    expect(hasTexture('AhKdTc9d2d', 'River blank')).toBe(false);
  });

  it('genuinely blank river: undercard, no pair, no straight, no flush change', () => {
    // Ah Kd Th 6h = flop two-tone, Turn Flush Hits (3 hearts); river 3s = undercard, nothing new
    expect(hasTexture('AhKdTh6h3s', 'River blank')).toBe(true);
  });

  it('overcard river is not blank', () => {
    // Kd Th 7c 5s Ah = Ah is overcard
    expect(hasTexture('KdTh7c5sAh', 'River blank')).toBe(false);
  });

  it('pairing river is not blank', () => {
    // Ah Kd Th 6s Kh = river pairs K
    expect(hasTexture('AhKdTh6sKh', 'River blank')).toBe(false);
  });
});

// ─── No false positives: mutually exclusive flush labels ─────────────────────

describe('mutually exclusive flush labels', () => {
  const flushLabels = [
    'River Flush Hits (flop two-tone)',
    'River Flush Hits (flop rainbow)',
    'River Flush Bricks (flop two-tone)',
    'River Flush Bricks (flop rainbow)',
    'River Flush Stays (flop two-tone)',
    'River Flush Stays (flop monotone)',
    'River 4-flush (mono flop)',
    'River 4-flush (two-tone flop)',
  ];

  const cases = [
    'AsKs7d6d2d', // Flush Hits (two-tone)
    'AsKs7d6d2c', // Flush Bricks (two-tone)
    'AhKdTc9d2d', // Flush Hits (rainbow)
    'AhKdTc9d2c', // Flush Bricks (rainbow)
    'AhKdTh6h3d', // Flush Stays (two-tone)
    'AhKhTh9c2c', // Flush Stays (monotone)
    'AhKhTh9s2h', // 4-flush (mono flop)
    'AhKdTh6h2h', // 4-flush (two-tone flop)
  ];

  for (const b of cases) {
    it(`exactly one flush label for ${b}`, () => {
      const out = textures(b, { filter: false });
      const matches = flushLabels.filter(l => out.includes(l));
      expect(matches).toHaveLength(1);
    });
  }
});
