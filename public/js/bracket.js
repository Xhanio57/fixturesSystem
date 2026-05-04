/* ============================================
   SVG Tournament Bracket Renderer
   ============================================ */

/**
 * renderBracket(matches, categoryName)
 * matches: array of Match objects (populated with athleteA, athleteB, winner)
 * categoryName: string for the title
 */
function renderBracket(matches, categoryName) {
  const container = document.getElementById('bracket-container');
  if (!matches || !matches.length) {
    container.innerHTML = '<p class="text-muted">Fikstür verisi yok.</p>';
    return;
  }

  // Group by round
  const rounds = {};
  matches.forEach((m) => {
    if (!rounds[m.roundNumber]) rounds[m.roundNumber] = [];
    rounds[m.roundNumber].push(m);
  });

  const roundKeys = Object.keys(rounds)
    .map(Number)
    .sort((a, b) => a - b);
  const numRounds = roundKeys.length;

  // Layout constants
  const MATCH_W = 200;
  const MATCH_H = 80;
  const MATCH_GAP_V = 20; // vertical gap between matches in same round
  const ROUND_GAP_H = 80; // horizontal gap between rounds
  const PADDING = 40;
  const ROUND_LABEL_H = 32;

  // Calculate positions for each round
  // Round 1 has 2^(numRounds-1) matches displayed vertically
  const round1Count = rounds[roundKeys[0]].length;
  const totalMatchSlots = nextPow2(round1Count); // in case matches array is incomplete

  // Calculate total SVG dimensions
  const totalH =
    PADDING * 2 +
    ROUND_LABEL_H +
    totalMatchSlots * MATCH_H +
    (totalMatchSlots - 1) * MATCH_GAP_V;

  const totalW = PADDING * 2 + numRounds * MATCH_W + (numRounds - 1) * ROUND_GAP_H;

  // Assign x positions per round
  const roundX = {};
  roundKeys.forEach((r, i) => {
    roundX[r] = PADDING + i * (MATCH_W + ROUND_GAP_H);
  });

  // Assign y positions per round (centered vertically)
  const matchPositions = {}; // key: `${round}-${matchIndex}` => {x, y, w, h}

  roundKeys.forEach((r, ri) => {
    const matchesInRound = rounds[r];
    const groupSize = Math.pow(2, ri); // number of slots in the base round that this match covers
    const slotH = MATCH_H + MATCH_GAP_V;

    matchesInRound.forEach((m) => {
      const idx = m.matchIndex;
      // Center this match within its group of base slots
      const groupStart = idx * groupSize * 2; // starting slot index in round 1
      const groupEnd = groupStart + groupSize * 2 - 1;
      const centerSlot = (groupStart + groupEnd) / 2;
      const y = PADDING + ROUND_LABEL_H + centerSlot * slotH + slotH / 2 - MATCH_H / 2;
      const x = roundX[r];
      matchPositions[`${r}-${idx}`] = { x, y, w: MATCH_W, h: MATCH_H, match: m };
    });
  });

  // Build SVG
  const svg = svgEl('svg', {
    width: totalW,
    height: totalH,
    viewBox: `0 0 ${totalW} ${totalH}`,
    xmlns: 'http://www.w3.org/2000/svg',
  });

  // Background
  const bg = svgEl('rect', {
    width: totalW,
    height: totalH,
    fill: 'var(--bg-secondary)',
  });
  svg.appendChild(bg);

  // Round labels
  roundKeys.forEach((r, i) => {
    const label = roundLabel(r, numRounds);
    const x = roundX[r] + MATCH_W / 2;
    const y = PADDING + ROUND_LABEL_H / 2 + 4;
    const text = svgEl('text', {
      x,
      y,
      'text-anchor': 'middle',
      class: 'bracket-round-label',
    });
    text.textContent = label;
    svg.appendChild(text);
  });

  // Draw connector lines between rounds
  roundKeys.forEach((r, ri) => {
    if (ri >= roundKeys.length - 1) return;
    const nextR = roundKeys[ri + 1];
    const nextMatches = rounds[nextR] || [];

    rounds[r].forEach((m) => {
      const pos = matchPositions[`${r}-${m.matchIndex}`];
      if (!pos) return;

      const nextMatchIndex = Math.floor(m.matchIndex / 2);
      const nextPos = matchPositions[`${nextR}-${nextMatchIndex}`];
      if (!nextPos) return;

      // Line from right edge of current match to left edge of next match
      const x1 = pos.x + pos.w;
      const y1 = pos.y + pos.h / 2;
      const x2 = nextPos.x;
      const y2 = nextPos.y + nextPos.h / 2;
      const midX = x1 + (x2 - x1) / 2;

      const path = svgEl('path', {
        d: `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`,
        class: 'bracket-line',
      });
      svg.appendChild(path);
    });
  });

  // Draw match boxes
  Object.values(matchPositions).forEach(({ x, y, w, h, match }) => {
    const g = svgEl('g');

    // Match rectangle
    const rect = svgEl('rect', {
      x,
      y,
      width: w,
      height: h,
      rx: 6,
      class: `bracket-match-rect ${match.winner ? 'highlight' : ''}`,
    });
    g.appendChild(rect);

    // Divider line
    const divider = svgEl('line', {
      x1: x,
      y1: y + h / 2,
      x2: x + w,
      y2: y + h / 2,
      stroke: 'var(--border)',
      'stroke-width': 1,
    });
    g.appendChild(divider);

    // Athlete A text
    const textA = athleteText(match.athleteA, match.isByeA, match.winner, x + 10, y + h / 4 + 5);
    g.appendChild(textA);

    // Athlete B text
    const textB = athleteText(match.athleteB, match.isByeB, match.winner, x + 10, y + (3 * h) / 4 + 5);
    g.appendChild(textB);

    svg.appendChild(g);
  });

  container.innerHTML = '';
  container.appendChild(svg);
}

// ─── Helpers ─────────────────────────────────
function athleteText(athlete, isBye, winner, x, y) {
  const text = svgEl('text', { x, y, class: 'bracket-text' });

  let label = '—';
  let cls = 'bracket-text';

  if (isBye) {
    label = 'BYE';
    cls = 'bracket-text bye';
  } else if (athlete) {
    label = `${athlete.lastName}, ${athlete.firstName}`;
    if (athlete.isSeeded) cls = 'bracket-text seeded';
    if (winner && String(winner._id || winner) === String(athlete._id)) {
      cls += ' winner';
    }
  }

  text.setAttribute('class', cls);
  text.textContent = truncate(label, 22);
  return text;
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

function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
}

function nextPow2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}
