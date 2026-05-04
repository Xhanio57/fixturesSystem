/* ============================================
   PDF Export Engine
   Generates A4-format fixture sheet matching
   the Baltic Judo Championships style.
   Uses jsPDF (loaded from npm build) loaded
   via CDN fallback at window.jspdf.
   ============================================ */

/* global jspdf */

/**
 * Main export function. Called from draw.js and spectator.js.
 * @param {Object} category  - Category object {name, gender, ageGroup}
 * @param {Array}  matches   - Populated match array
 * @param {Array}  athletes  - Athlete array for results table
 */
async function exportPDF(category, matches, athletes) {
  if (!category || !matches || !matches.length) {
    alert('Kura henüz çekilmemiş. PDF oluşturulamadı.');
    return;
  }

  // Load jsPDF from the CDN if it's not already bundled
  await ensureJsPDF();

  const { jsPDF } = window.jspdf;
  if (!jsPDF) {
    alert('jsPDF yüklenemedi.');
    return;
  }

  // ── Build an off-screen print element ──
  const el = buildPrintElement(category, matches, athletes);
  document.body.appendChild(el);

  try {
    // html2canvas fallback: if available use it for high-fidelity, else plain jsPDF text
    if (window.html2canvas) {
      const canvas = await window.html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });
      const imgData = canvas.toDataURL('image/png');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 8;
      const imgW = pageW - margin * 2;
      const imgH = (canvas.height * imgW) / canvas.width;
      doc.addImage(imgData, 'PNG', margin, margin, imgW, Math.min(imgH, pageH - margin * 2));
      doc.save(`${category.name.replace(/\s+/g, '_')}-fikstür.pdf`);
    } else {
      // Fallback: text-only PDF
      buildTextPDF(jsPDF, category, matches, athletes);
    }
  } finally {
    document.body.removeChild(el);
  }
}

// ─── Ensure jsPDF is loaded (CDN fallback) ───
async function ensureJsPDF() {
  if (window.jspdf && window.jspdf.jsPDF) return;
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ─── Build the HTML bracket print element ────
function buildPrintElement(category, matches, athletes) {
  const SPECIAL_POOLS = ['RepAB', 'RepCD', 'Bronze1', 'Bronze2'];
  const mainMatches = matches.filter((m) => !SPECIAL_POOLS.includes(m.pool));
  const repMatches  = matches.filter((m) => SPECIAL_POOLS.includes(m.pool));

  const now = new Date();
  const dateStr = `${now.getDate().toString().padStart(2,'0')}.${(now.getMonth()+1).toString().padStart(2,'0')}.${now.getFullYear()}`;

  // Gather R1 matches for slot-number labelling
  const r1 = mainMatches.filter((m) => m.roundNumber === 1);
  let slotCounter = 1;
  // Build slot-number map: matchId+slot → slotNumber
  const slotNumbers = {};
  r1.forEach((m) => {
    slotNumbers[`${m._id}-A`] = slotCounter++;
    slotNumbers[`${m._id}-B`] = slotCounter++;
  });

  const poolColors = { A: '#3b82f6', B: '#10b981', C: '#f59e0b', D: '#ef4444' };
  const poolLabels = { A: 'A', B: 'B', C: 'C', D: 'D' };

  // Group rounds
  const rounds = {};
  mainMatches.forEach((m) => {
    if (!rounds[m.roundNumber]) rounds[m.roundNumber] = [];
    rounds[m.roundNumber].push(m);
  });
  const roundKeys = Object.keys(rounds).map(Number).sort((a, b) => a - b);
  const numRounds = roundKeys.length;

  function fmtAthlete(ath, isBye, slot, matchId) {
    if (isBye) return '<span style="color:#aaa;font-style:italic;">BYE</span>';
    if (!ath) return '<span style="color:#aaa;">—</span>';
    const num = slotNumbers[`${matchId}-${slot}`] || '';
    const last = (ath.lastName || '').toUpperCase();
    const first = ath.firstName || '';
    const country = ath.country || '';
    const club = ath.club || '';
    const suffix = [country, club].filter(Boolean).join('/');
    const label = suffix ? `${last} ${first}, ${suffix}` : `${last} ${first}`;
    const seed = ath.seedIndex ? `<sup style="color:#e6b800;">${ath.seedIndex}</sup>` : '';
    return `${num ? `<b>${num}.</b> ` : ''}${escHtmlPdf(label)}${seed}`;
  }

  function matchHtml(m, w = 220) {
    const isWinnerA = m.winner && m.athleteA && String(m.winner._id || m.winner) === String(m.athleteA._id || m.athleteA);
    const isWinnerB = m.winner && m.athleteB && String(m.winner._id || m.winner) === String(m.athleteB._id || m.athleteB);
    const poolColor = poolColors[m.pool] || '#888';
    const poolLabel = poolLabels[m.pool] || '';
    return `
      <div style="border:1px solid #ccc;border-radius:4px;width:${w}px;display:inline-block;vertical-align:top;margin:4px 2px;font-size:10px;position:relative;overflow:hidden;">
        ${poolLabel ? `<div style="position:absolute;top:0;left:0;width:5px;height:100%;background:${poolColor};"></div>` : ''}
        <div style="padding:4px 8px 4px ${poolLabel ? '12px' : '8px'};border-bottom:1px solid #eee;${isWinnerA ? 'font-weight:bold;color:#1a1a2e;' : 'color:#333;'}">
          ${fmtAthlete(m.athleteA, m.isByeA, 'A', m._id)}
        </div>
        <div style="padding:4px 8px 4px ${poolLabel ? '12px' : '8px'};${isWinnerB ? 'font-weight:bold;color:#1a1a2e;' : 'color:#333;'}">
          ${fmtAthlete(m.athleteB, m.isByeB, 'B', m._id)}
        </div>
        ${m.matchID ? `<div style="position:absolute;top:2px;right:4px;font-size:9px;color:#999;">#${m.matchID}</div>` : ''}
      </div>`;
  }

  // Build bracket columns
  let bracketHtml = '<table style="width:100%;border-collapse:collapse;"><tr>';
  roundKeys.forEach((r, ri) => {
    const label = roundLabelPdf(r, numRounds);
    const matchesInRound = rounds[r];
    const spacing = Math.pow(2, ri);
    bracketHtml += `<td style="vertical-align:top;padding:0 4px;width:${Math.round(100/numRounds)}%;">
      <div style="text-align:center;font-weight:bold;font-size:9px;color:#666;margin-bottom:6px;border-bottom:1px solid #ddd;padding-bottom:4px;">${escHtmlPdf(label)}</div>`;
    matchesInRound.forEach((m, mi) => {
      const topPad = mi === 0 ? (spacing - 1) * 28 : (spacing - 1) * 28;
      bracketHtml += `<div style="margin-top:${topPad}px;">${matchHtml(m, 200)}</div>`;
    });
    bracketHtml += '</td>';
  });
  bracketHtml += '</tr></table>';

  // Repechage section
  let repHtml = '';
  if (repMatches.length) {
    const repPoolLabels = { RepAB: 'Repechage A/B', RepCD: 'Repechage C/D', Bronze1: '🥉 Bronz 1', Bronze2: '🥉 Bronz 2' };
    repHtml = `<div style="margin-top:12px;border-top:2px solid #8b5cf6;padding-top:8px;">
      <div style="font-weight:bold;font-size:9px;color:#8b5cf6;margin-bottom:6px;">REPECHAGE (ÇİFT ELEME)</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">`;
    ['RepAB', 'RepCD', 'Bronze1', 'Bronze2'].forEach((pool) => {
      const m = repMatches.find((x) => x.pool === pool);
      if (!m) {
        repHtml += `<div style="border:1px dashed #999;border-radius:4px;width:200px;min-height:50px;display:inline-block;padding:4px 8px;font-size:10px;color:#888;">
          <div style="font-weight:bold;margin-bottom:4px;font-size:9px;">${escHtmlPdf(repPoolLabels[pool] || pool)}</div>
          <div style="color:#bbb;font-style:italic;">—</div><div style="color:#bbb;font-style:italic;">—</div>
        </div>`;
      } else {
        repHtml += `<div><div style="font-weight:bold;font-size:9px;color:#666;margin-bottom:2px;">${escHtmlPdf(repPoolLabels[pool] || pool)}</div>${matchHtml(m, 200)}</div>`;
      }
    });
    repHtml += '</div></div>';
  }

  // Results table (Pos 1,2,3,3,5,5,7,7)
  const positions = [1, 2, 3, 3, 5, 5, 7, 7];
  let resultsHtml = `
    <div style="border:1px solid #ccc;border-radius:4px;padding:8px;min-width:220px;">
      <div style="font-weight:bold;font-size:11px;border-bottom:1px solid #ddd;padding-bottom:4px;margin-bottom:4px;">Results</div>
      <table style="width:100%;font-size:9px;border-collapse:collapse;">
        <tr style="font-weight:bold;border-bottom:1px solid #eee;"><td style="padding:2px 4px;">Pos</td><td style="padding:2px 4px;">Name</td></tr>`;
  positions.forEach((pos) => {
    resultsHtml += `<tr style="border-bottom:1px solid #f5f5f5;">
      <td style="padding:2px 6px;width:28px;font-weight:bold;">${pos}</td>
      <td style="padding:2px 6px;color:#666;font-style:italic;">—</td>
    </tr>`;
  });
  resultsHtml += '</table></div>';

  // Competitor count
  const totalAthletes = athletes ? athletes.length : matches.filter(m => m.roundNumber === 1 && !SPECIAL_POOLS.includes(m.pool)).reduce((n, m) => n + (!m.isByeA && m.athleteA ? 1 : 0) + (!m.isByeB && m.athleteB ? 1 : 0), 0);

  // Full page
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;background:#fff;padding:16px;font-family:Arial,Helvetica,sans-serif;color:#1a1a2e;font-size:11px;';
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
      <div>
        <div style="font-size:16px;font-weight:900;letter-spacing:0.02em;">TURNUVA FIKSTÜRÜ</div>
        <div style="font-size:13px;font-weight:bold;margin-top:2px;">${escHtmlPdf(category.name)} — ${escHtmlPdf(category.gender || '')}${category.ageGroup ? ' ' + escHtmlPdf(category.ageGroup) : ''}</div>
        <div style="font-size:10px;color:#666;margin-top:2px;">${dateStr} &nbsp;&nbsp; Yarışmacı: ${totalAthletes}</div>
      </div>
      <div>
        ${resultsHtml}
      </div>
    </div>
    <div style="border-top:2px solid #1a1a2e;padding-top:10px;">
      ${bracketHtml}
    </div>
    ${repHtml}
  `;
  return el;
}

// ─── Text-only fallback PDF (no html2canvas) ──
function buildTextPDF(jsPDF, category, matches, athletes) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`${category.name} — ${category.gender || ''} ${category.ageGroup || ''}`, pageW / 2, 20, { align: 'center' });

  const now = new Date();
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`${now.getDate().toString().padStart(2,'0')}.${(now.getMonth()+1).toString().padStart(2,'0')}.${now.getFullYear()}`, pageW / 2, 27, { align: 'center' });

  let y = 36;
  const SPECIAL_POOLS = ['RepAB', 'RepCD', 'Bronze1', 'Bronze2'];
  const r1 = matches.filter((m) => m.roundNumber === 1 && !SPECIAL_POOLS.includes(m.pool));
  doc.setFontSize(9);
  let slotNum = 1;
  r1.forEach((m) => {
    const aLabel = m.isByeA ? 'BYE' : m.athleteA ? `${slotNum}. ${(m.athleteA.lastName || '').toUpperCase()} ${m.athleteA.firstName || ''}, ${m.athleteA.country || ''} / ${m.athleteA.club || ''}` : '—';
    slotNum++;
    const bLabel = m.isByeB ? 'BYE' : m.athleteB ? `${slotNum}. ${(m.athleteB.lastName || '').toUpperCase()} ${m.athleteB.firstName || ''}, ${m.athleteB.country || ''} / ${m.athleteB.club || ''}` : '—';
    slotNum++;
    doc.text(`[${m.pool || '?'}] ${aLabel}  vs  ${bLabel}`, 14, y);
    y += 7;
    if (y > 185) { doc.addPage(); y = 20; }
  });

  doc.save(`${category.name.replace(/\s+/g, '_')}-fikstür.pdf`);
}

// ─── Helpers ─────────────────────────────────
function roundLabelPdf(roundNumber, totalRounds) {
  const remaining = totalRounds - roundNumber + 1;
  if (remaining === 1) return 'Final';
  if (remaining === 2) return 'Yarı Final';
  if (remaining === 3) return 'Çeyrek Final';
  return `Tur ${roundNumber}`;
}

function escHtmlPdf(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
