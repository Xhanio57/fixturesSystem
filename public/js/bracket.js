/* ============================================
   SVG Tournament Bracket Renderer
   Supports Single Elimination & Double Repechage
   Pools A/B/C/D, Repechage tree, Bronze medals
   ============================================ */

/**
 * renderBracket(matches, category, containerEl?)
 * matches:     populated Match array
 * category:    Category object (or just a name string for backward compat)
 * containerEl: optional DOM element to render into (falls back to #bracket-container)
 */
function renderBracket(matches, category, containerEl) {
  const container = containerEl || document.getElementById('bracket-container');
  if (!container) return;
  if (!matches || !matches.length) {
    container.innerHTML = '<p class="text-muted">Fikstür verisi yok.</p>';
    return;
  }

  const isDoubleRep = typeof category === 'object'
    ? category.bracketType === 'DoubleRepechage'
    : false;

  // Separate main bracket from repechage/bronze
  const SPECIAL_POOLS = ['RepAB', 'RepCD', 'Bronze1', 'Bronze2'];
  const mainMatches = matches.filter((m) => !SPECIAL_POOLS.includes(m.pool));
  const repMatches = matches.filter((m) => SPECIAL_POOLS.includes(m.pool));

  // Build the main bracket SVG
  const mainSvg = buildMainBracketSvg(mainMatches);

  if (isDoubleRep && repMatches.length) {
    // Render repechage section below main bracket
    const repSvg = buildRepechageSvg(repMatches);
    container.innerHTML = '';
    container.appendChild(mainSvg);

    const divider = document.createElement('div');
    divider.className = 'bracket-repechage-title';
    divider.innerHTML = '<span>🔄 Repechage (Çift Eleme) Ağacı</span>';
    container.appendChild(divider);
    container.appendChild(repSvg);
  } else {
    container.innerHTML = '';
    container.appendChild(mainSvg);
  }
}

/* ─────────────────────────────────────────────
   MAIN BRACKET SVG
───────────────────────────────────────────── */
function buildMainBracketSvg(matches) {
  const MATCH_W = 210;
  const MATCH_H = 82;
  const MATCH_GAP_V = 18;
  const ROUND_GAP_H = 72;
  const PADDING = 40;
  const ROUND_LABEL_H = 34;

  // Group by roundNumber (exclude special pools)
  const rounds = {};
  matches.forEach((m) => {
    if (!rounds[m.roundNumber]) rounds[m.roundNumber] = [];
    rounds[m.roundNumber].push(m);
  });

  const roundKeys = Object.keys(rounds).map(Number).sort((a, b) => a - b);
  if (!roundKeys.length) return svgEl('svg', { width: 0, height: 0 });

  const numRounds = roundKeys.length;
  const round1Count = rounds[roundKeys[0]].length;
  const totalSlots = nextPow2Bracket(round1Count);

  const slotH = MATCH_H + MATCH_GAP_V;
  const totalH = PADDING * 2 + ROUND_LABEL_H + totalSlots * slotH;
  const totalW = PADDING * 2 + numRounds * MATCH_W + (numRounds - 1) * ROUND_GAP_H;

  const roundX = {};
  roundKeys.forEach((r, i) => {
    roundX[r] = PADDING + i * (MATCH_W + ROUND_GAP_H);
  });

  // Calculate match (x,y) positions
  const matchPos = {};
  roundKeys.forEach((r, ri) => {
    rounds[r].forEach((m) => {
      const groupSize = Math.pow(2, ri);
      const groupStart = m.matchIndex * groupSize * 2;
      const groupEnd = groupStart + groupSize * 2 - 1;
      const centerSlot = (groupStart + groupEnd) / 2;
      const y = PADDING + ROUND_LABEL_H + centerSlot * slotH + slotH / 2 - MATCH_H / 2;
      matchPos[`${r}-${m.matchIndex}`] = { x: roundX[r], y, w: MATCH_W, h: MATCH_H, match: m };
    });
  });

  const svg = svgEl('svg', {
    width: totalW, height: totalH,
    viewBox: `0 0 ${totalW} ${totalH}`,
    xmlns: 'http://www.w3.org/2000/svg',
  });
  svg.appendChild(svgEl('rect', { width: totalW, height: totalH, fill: 'var(--bg-secondary)' }));

  // Pool color bars (round 1)
  const poolColors = { A: '#3b82f6', B: '#10b981', C: '#f59e0b', D: '#ef4444' };
  if (rounds[roundKeys[0]]) {
    rounds[roundKeys[0]].forEach((m) => {
      const pos = matchPos[`${roundKeys[0]}-${m.matchIndex}`];
      if (!pos || !poolColors[m.pool]) return;
      const bar = svgEl('rect', {
        x: pos.x - 6, y: pos.y, width: 6, height: pos.h,
        rx: 3, fill: poolColors[m.pool],
      });
      svg.appendChild(bar);
    });
  }

  // Round labels
  roundKeys.forEach((r) => {
    const label = roundLabel(r, numRounds);
    const x = roundX[r] + MATCH_W / 2;
    const y = PADDING + ROUND_LABEL_H / 2 + 4;
    const text = svgEl('text', { x, y, 'text-anchor': 'middle', class: 'bracket-round-label' });
    text.textContent = label;
    svg.appendChild(text);
  });

  // Connector lines
  roundKeys.forEach((r, ri) => {
    if (ri >= roundKeys.length - 1) return;
    const nextR = roundKeys[ri + 1];
    rounds[r].forEach((m) => {
      const pos = matchPos[`${r}-${m.matchIndex}`];
      const nextPos = matchPos[`${nextR}-${Math.floor(m.matchIndex / 2)}`];
      if (!pos || !nextPos) return;
      const x1 = pos.x + pos.w, y1 = pos.y + pos.h / 2;
      const x2 = nextPos.x, y2 = nextPos.y + nextPos.h / 2;
      const midX = x1 + (x2 - x1) / 2;
      svg.appendChild(svgEl('path', {
        d: `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`,
        class: 'bracket-line',
      }));
    });
  });

  // Match boxes
  Object.values(matchPos).forEach(({ x, y, w, h, match }) => {
    const g = svgEl('g');
    g.setAttribute('data-match-id', match._id || '');
    const cls = match.winner ? 'bracket-match-rect highlight' : 'bracket-match-rect';
    g.appendChild(svgEl('rect', { x, y, width: w, height: h, rx: 6, class: cls }));
    g.appendChild(svgEl('line', { x1: x, y1: y + h / 2, x2: x + w, y2: y + h / 2, stroke: 'var(--border)', 'stroke-width': 1 }));

    // Invisible hit-rects for fly-to-bracket targeting
    const hitA = svgEl('rect', {
      x, y, width: w, height: h / 2,
      fill: 'transparent',
      id: `bracket-slot-${match._id}-A`,
      'data-match-id': match._id || '',
      'data-slot': 'A',
    });
    const hitB = svgEl('rect', {
      x, y: y + h / 2, width: w, height: h / 2,
      fill: 'transparent',
      id: `bracket-slot-${match._id}-B`,
      'data-match-id': match._id || '',
      'data-slot': 'B',
    });
    g.appendChild(hitA);
    g.appendChild(hitB);

    // Pool badge
    if (match.pool && ['A','B','C','D'].includes(match.pool)) {
      const badge = svgEl('rect', { x: x + w - 22, y: y + 4, width: 18, height: 16, rx: 3,
        fill: poolColors[match.pool] || '#666', opacity: 0.9 });
      const badgeTxt = svgEl('text', { x: x + w - 13, y: y + 16, 'text-anchor': 'middle',
        'font-size': 10, fill: '#fff', 'font-weight': 'bold' });
      badgeTxt.textContent = match.pool;
      g.appendChild(badge);
      g.appendChild(badgeTxt);
    }

    g.appendChild(athleteTextSvg(match.athleteA, match.isByeA, match.winner, x + 10, y + h / 4 + 6, match.slotNumberA));
    g.appendChild(athleteTextSvg(match.athleteB, match.isByeB, match.winner, x + 10, y + (3 * h) / 4 + 6, match.slotNumberB));

    // Match ID circle (bottom-right corner of each match box, like the reference image)
    if (match.matchID && match.roundNumber === 1) {
      const cx = x + w + 10;
      const cy = y + h / 2;
      g.appendChild(svgEl('circle', { cx, cy, r: 11, fill: 'var(--bg-secondary)', stroke: 'var(--accent)', 'stroke-width': 1.5 }));
      const numTxt = svgEl('text', {
        x: cx, y: cy + 4,
        'text-anchor': 'middle',
        'font-size': 9,
        fill: 'var(--accent)',
        'font-weight': '700',
      });
      numTxt.textContent = match.matchID;
      g.appendChild(numTxt);
    }

    svg.appendChild(g);
  });

  return svg;
}

/* ─────────────────────────────────────────────
   REPECHAGE + BRONZE SVG
───────────────────────────────────────────── */
function buildRepechageSvg(repMatches) {
  const MATCH_W = 210;
  const MATCH_H = 82;
  const MATCH_GAP_V = 30;
  const ROUND_GAP_H = 90;
  const PADDING = 40;
  const LABEL_H = 34;

  // Layout: RepAB | RepCD → Bronze1 | Bronze2
  // Pool order: RepAB (0,0), RepCD (0,1), Bronze1 (1,0), Bronze2 (1,1)
  const poolOrder = { RepAB: { col: 0, row: 0 }, RepCD: { col: 0, row: 1 }, Bronze1: { col: 1, row: 0 }, Bronze2: { col: 1, row: 1 } };
  const poolLabels = { RepAB: 'Repechage A/B', RepCD: 'Repechage C/D', Bronze1: '🥉 Bronz Madalya 1', Bronze2: '🥉 Bronz Madalya 2' };

  const slotH = MATCH_H + MATCH_GAP_V;
  const numCols = 2;
  const numRows = 2;
  const totalW = PADDING * 2 + numCols * MATCH_W + (numCols - 1) * ROUND_GAP_H;
  const totalH = PADDING * 2 + LABEL_H + numRows * MATCH_H + (numRows - 1) * MATCH_GAP_V;

  const posMap = {};
  repMatches.forEach((m) => {
    const layout = poolOrder[m.pool];
    if (!layout) return;
    const x = PADDING + layout.col * (MATCH_W + ROUND_GAP_H);
    const y = PADDING + LABEL_H + layout.row * slotH;
    posMap[m.pool] = { x, y, w: MATCH_W, h: MATCH_H, match: m };
  });

  const svg = svgEl('svg', {
    width: totalW, height: totalH + 20,
    viewBox: `0 0 ${totalW} ${totalH + 20}`,
    xmlns: 'http://www.w3.org/2000/svg',
  });
  svg.appendChild(svgEl('rect', { width: totalW, height: totalH + 20, fill: 'var(--bg-elevated)' }));

  // Column headers
  ['Repechage Turu', 'Bronz Madalya Maçları'].forEach((label, col) => {
    const x = PADDING + col * (MATCH_W + ROUND_GAP_H) + MATCH_W / 2;
    const t = svgEl('text', { x, y: PADDING + LABEL_H / 2 + 4, 'text-anchor': 'middle', class: 'bracket-round-label' });
    t.textContent = label;
    svg.appendChild(t);
  });

  // Connector: RepAB winner → Bronze1 slot B
  const repABPos = posMap['RepAB'];
  const bronze1Pos = posMap['Bronze1'];
  if (repABPos && bronze1Pos) {
    const x1 = repABPos.x + repABPos.w, y1 = repABPos.y + repABPos.h / 2;
    const x2 = bronze1Pos.x, y2 = bronze1Pos.y + (3 * bronze1Pos.h) / 4;
    const midX = x1 + (x2 - x1) / 2;
    svg.appendChild(svgEl('path', { d: `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`, class: 'bracket-line bracket-line--rep' }));
  }

  // Connector: RepCD winner → Bronze2 slot B
  const repCDPos = posMap['RepCD'];
  const bronze2Pos = posMap['Bronze2'];
  if (repCDPos && bronze2Pos) {
    const x1 = repCDPos.x + repCDPos.w, y1 = repCDPos.y + repCDPos.h / 2;
    const x2 = bronze2Pos.x, y2 = bronze2Pos.y + (3 * bronze2Pos.h) / 4;
    const midX = x1 + (x2 - x1) / 2;
    svg.appendChild(svgEl('path', { d: `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`, class: 'bracket-line bracket-line--rep' }));
  }

  // Match boxes
  Object.entries(posMap).forEach(([pool, { x, y, w, h, match }]) => {
    const g = svgEl('g');
    const cls = match.winner
      ? 'bracket-match-rect bracket-match-rect--rep highlight'
      : 'bracket-match-rect bracket-match-rect--rep';
    g.appendChild(svgEl('rect', { x, y, width: w, height: h, rx: 6, class: cls }));
    g.appendChild(svgEl('line', { x1: x, y1: y + h / 2, x2: x + w, y2: y + h / 2, stroke: 'var(--border)', 'stroke-width': 1 }));

    // Pool label
    const labelTxt = svgEl('text', { x: x + 6, y: y - 6, class: 'bracket-pool-label' });
    labelTxt.textContent = poolLabels[pool] || pool;
    g.appendChild(labelTxt);

    g.appendChild(athleteTextSvg(match.athleteA, match.isByeA, match.winner, x + 10, y + h / 4 + 6, null));
    g.appendChild(athleteTextSvg(match.athleteB, match.isByeB, match.winner, x + 10, y + (3 * h) / 4 + 6, null));

    // Match ID circle
    if (match.matchID) {
      const cx = x + w - 12;
      const cy = y + h - 12;
      g.appendChild(svgEl('circle', { cx, cy, r: 10, fill: 'var(--bg-elevated)', stroke: '#8b5cf6', 'stroke-width': 1.5 }));
      const numTxt = svgEl('text', { x: cx, y: cy + 4, 'text-anchor': 'middle', 'font-size': 9, fill: '#8b5cf6', 'font-weight': '700' });
      numTxt.textContent = match.matchID;
      g.appendChild(numTxt);
    }

    svg.appendChild(g);
  });

  return svg;
}

/* ─────────────────────────────────────────────
   SHARED HELPERS
───────────────────────────────────────────── */
function athleteTextSvg(athlete, isBye, winner, x, y, slotNumber) {
  const g = svgEl('g');

  // Draw position number circle (like "9." in the reference)
  // NOTE: `x` here is already matchBoxX + 10 (passed by caller as `x + 10`),
  // so circleX = x + 5 = matchBoxX + 15; left edge = matchBoxX + 6 — safely inside the box.
  if (slotNumber && !isBye && athlete) {
    // Circle sits inside the match box, to the left of the athlete name text
    const circleX = x + 5;
    const circleY = y - 6;
    g.appendChild(svgEl('circle', { cx: circleX, cy: circleY, r: 9, fill: 'var(--bg-secondary)', stroke: 'var(--border)', 'stroke-width': 1 }));
    const numTxt = svgEl('text', {
      x: circleX, y: circleY + 4,
      'text-anchor': 'middle',
      'font-size': 8,
      fill: 'var(--text-secondary)',
      'font-weight': '600',
    });
    numTxt.textContent = slotNumber;
    g.appendChild(numTxt);
    x += 18; // indent text to the right of the circle
  }

  const text = svgEl('text', { x, y });

  let label = '—';
  let cls = 'bracket-text';

  if (isBye) {
    label = 'BYE';
    cls = 'bracket-text bye';
  } else if (athlete) {
    // Format: "LASTNAME Firstname, COUNTRY/Club"  (mimic Baltic Judo Championships style)
    const last = (athlete.lastName || '').toUpperCase();
    const first = athlete.firstName || '';
    const country = athlete.country || '';
    const club = athlete.club || '';
    const suffix = [country, club].filter(Boolean).join('/');
    label = suffix ? `${last} ${first}, ${suffix}` : `${last} ${first}`;
    if (athlete.seedIndex) cls = 'bracket-text seeded';
    if (winner && String(winner._id || winner) === String(athlete._id)) cls += ' winner';
  }

  text.setAttribute('class', cls);
  text.textContent = truncateBracket(label, slotNumber ? 24 : 28);
  g.appendChild(text);
  return g;
}

function roundLabel(roundNumber, totalRounds) {
  const remaining = totalRounds - roundNumber + 1;
  if (remaining === 1) return 'Final';
  if (remaining === 2) return 'Yarı Final';
  if (remaining === 3) return 'Çeyrek Final';
  return `Tur ${roundNumber}`;
}

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

function truncateBracket(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
}

function nextPow2Bracket(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

