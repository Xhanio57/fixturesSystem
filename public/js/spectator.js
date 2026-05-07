/* ============================================
   Spectator (Presentation Mode) JavaScript
   - Socket.io real-time draw animation
   - Fly-to-bracket GSAP animation
   - Auto-refreshes bracket every 15 seconds
   ============================================ */

let specCategory = null;
let specMatches = [];
let specAthletes = [];
let refreshTimer = null;
let drawAnimationRunning = false;

// ─── Clock ───────────────────────────────────
function startClock() {
  const clockEl = document.getElementById('clock');
  if (!clockEl) return;
  setInterval(() => {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    clockEl.textContent = `${h}:${m}:${s}`;
  }, 1000);
}

// ─── Slot Machine Dimensions ─────────────────
function getSlotDimensions() {
  const style = getComputedStyle(document.documentElement);
  const parseSize = (v) => parseInt(v) || 56;
  return {
    itemHeight: parseSize(style.getPropertyValue('--slot-item-height')),
    containerHeight: parseSize(style.getPropertyValue('--slot-container-height')),
  };
}

// ─── Init ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  startClock();
  setupCategoryMenu();
  initSocket();
});

// ─── Socket.io ───────────────────────────────
function initSocket() {
  const socket = io();

  // Admin ran the draw — show live slot machine on spectator screen
  socket.on('draw:complete', async (data) => {
    // Update sidebar badge
    const menuItem = document.querySelector(`.category-menu-item[data-id="${data.categoryId}"]`);
    if (menuItem && !menuItem.classList.contains('completed')) {
      menuItem.classList.add('completed');
      const existingBadge = menuItem.querySelector('.badge-done');
      if (!existingBadge) {
        const badge = document.createElement('span');
        badge.className = 'badge-done';
        badge.textContent = '✓ Çekildi';
        menuItem.appendChild(badge);
      }
    }

    // If this category is currently active on screen, run animation
    if (specCategory && String(specCategory._id) === String(data.categoryId)) {
      await runSpectatorDrawAnimation(data);
    } else if (!specCategory) {
      // Auto-show the just-drawn category
      await activateCategory(data.categoryId);
      await runSpectatorDrawAnimation(data);
    }
  });

  // A score was updated — refresh the bracket
  socket.on('score:update', (data) => {
    if (specCategory && String(specCategory._id) === String(data.categoryId)) {
      loadCategoryData(specCategory._id);
    }
  });
}

// ─── Category Menu ───────────────────────────
function setupCategoryMenu() {
  const items = document.querySelectorAll('.category-menu-item');
  items.forEach((item) => {
    item.addEventListener('click', () => {
      activateCategory(item.dataset.id);
    });
  });
}

async function activateCategory(id) {
  document.querySelectorAll('.category-menu-item').forEach((el) => el.classList.remove('active'));
  const activeItem = document.querySelector(`.category-menu-item[data-id="${id}"]`);
  if (activeItem) activeItem.classList.add('active');

  // Stop any previous polling
  if (refreshTimer) clearInterval(refreshTimer);

  await loadCategoryData(id);

  // Auto-refresh every 15 seconds
  refreshTimer = setInterval(() => loadCategoryData(id), 15000);
}

async function loadCategoryData(id) {
  try {
    const [catData, matchData, athData] = await Promise.all([
      apiFetch(`/api/categories/${id}`),
      apiFetch(`/api/matches/${id}`),
      apiFetch(`/api/athletes?categoryId=${id}`),
    ]);
    specCategory = catData.data;
    specMatches = matchData.data;
    specAthletes = athData.data;
    renderSpectatorContent();
  } catch (err) {
    console.error('Spectator load error:', err.message);
  }
}

function renderSpectatorContent() {
  if (!specCategory) return;

  document.getElementById('spectator-placeholder').classList.add('hidden');
  document.getElementById('spectator-content').classList.remove('hidden');

  // Update PDF button visibility
  const pdfBtn = document.getElementById('spec-pdf-btn');
  if (pdfBtn) {
    pdfBtn.classList.toggle('hidden', specCategory.drawStatus !== 'Completed');
  }

  document.getElementById('spec-cat-title').textContent = specCategory.name;
  document.getElementById('spec-cat-meta').textContent =
    `${specCategory.gender || ''}${specCategory.ageGroup ? ' · ' + specCategory.ageGroup : ''}` +
    (specCategory.drawStatus === 'Completed' ? ' · ✓ Kura Tamamlandı' : ' · Kura Bekleniyor');

  // Pool legend
  const isDoubleRep = specCategory.bracketType === 'DoubleRepechage';
  const legendEl = document.getElementById('spec-pool-legend');
  if (isDoubleRep) {
    legendEl.classList.remove('hidden');
    legendEl.innerHTML = `
      <span class="pool-badge pool-A">A</span>
      <span class="pool-badge pool-B">B</span>
      <span class="pool-badge pool-C">C</span>
      <span class="pool-badge pool-D">D</span>
      <span class="pool-badge pool-rep">Rep</span>
      <span class="pool-badge pool-bronze">Bronz</span>
      <span style="font-size:0.75rem;opacity:0.6;margin-left:8px;">Çift Repechage</span>
    `;
  } else {
    legendEl.classList.add('hidden');
  }

  renderSpecBracket();
}

function renderSpecBracket() {
  const container = document.getElementById('spec-bracket-container');
  if (!container) return;

  if (specMatches.length > 0) {
    // Pass the spectator container directly — no ID-swap needed
    renderBracket(specMatches, specCategory, container);
  } else {
    container.innerHTML = '<p class="text-muted" style="font-size: 1.2rem; padding: 40px;">Henüz kura çekilmemiş.</p>';
  }
}

// ─── Live Draw Slot Machine Overlay ──────────
async function runSpectatorDrawAnimation(data) {
  if (drawAnimationRunning) return;
  drawAnimationRunning = true;

  const overlay = document.getElementById('spec-draw-overlay');
  const overlayReel = document.getElementById('spec-slot-reel');
  const overlayLabel = document.getElementById('spec-slot-label');
  const overlayProgressEl = document.getElementById('spec-overlay-progress');
  const overlayCatEl = document.getElementById('spec-overlay-cat');

  if (!overlay || !overlayReel) {
    drawAnimationRunning = false;
    return;
  }

  // First, render empty bracket in background
  specMatches = data.matches || [];
  specAthletes = data.athletes || [];
  specCategory = specCategory || {};
  specCategory._id = data.categoryId;
  specCategory.name = data.categoryName;
  specCategory.gender = data.gender || '';
  specCategory.ageGroup = data.ageGroup || '';
  specCategory.bracketType = data.bracketType;
  specCategory.drawStatus = 'Completed';

  // Render bracket with all matches first (background)
  renderSpectatorContent();
  renderSpecBracket();

  // Show overlay
  overlayCatEl.textContent = `${data.categoryName} ${data.gender || ''} ${data.ageGroup || ''}`;
  overlay.classList.remove('hidden');
  gsap.fromTo(overlay, { opacity: 0, scale: 0.95 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(1.7)' });

  // Only animate R1 main-bracket matches
  const SPECIAL_POOLS = ['RepAB', 'RepCD', 'Bronze1', 'Bronze2'];
  const r1Matches = (data.matches || []).filter(
    (m) => m.roundNumber === 1 && !SPECIAL_POOLS.includes(m.pool)
  );

  const athletes = data.athletes || [];

  for (let i = 0; i < r1Matches.length; i++) {
    const match = r1Matches[i];
    const poolLabel = match.pool ? ` [Pool ${match.pool}]` : '';

    if (overlayProgressEl) overlayProgressEl.textContent = `Maç ${i + 1}${poolLabel} — çekiliyor...`;

    // Slot A
    const aName = match.athleteA
      ? formatAthleteName(match.athleteA)
      : 'BYE';
    await specAnimateSlot(overlayReel, athletes, aName, overlayLabel, `Maç ${i + 1}${poolLabel} — A`);

    // Fly to bracket
    if (match.athleteA && match._id) {
      await flyToBracket(match._id, 'A', aName);
    }

    await sleep(500);

    // Slot B
    const bName = match.athleteB
      ? formatAthleteName(match.athleteB)
      : 'BYE';
    await specAnimateSlot(overlayReel, athletes, bName, overlayLabel, `Maç ${i + 1}${poolLabel} — B`);

    if (match.athleteB && match._id) {
      await flyToBracket(match._id, 'B', bName);
    }

    await sleep(800);
  }

  if (overlayLabel) overlayLabel.textContent = '✓ Kura Tamamlandı!';
  if (overlayProgressEl) overlayProgressEl.textContent = 'Tüm eşleşmeler belirlendi';

  await sleep(2000);

  // Hide overlay with animation
  gsap.to(overlay, {
    opacity: 0,
    scale: 0.95,
    duration: 0.5,
    ease: 'power2.in',
    onComplete: () => overlay.classList.add('hidden'),
  });

  drawAnimationRunning = false;
}

// ─── Slot Machine Animation (Spectator) ──────
function buildReelItems(names, winnerName) {
  const shuffled = [];
  const repeatCount = 6;
  for (let r = 0; r < repeatCount; r++) {
    const arr = [...names].sort(() => Math.random() - 0.5);
    shuffled.push(...arr);
  }
  shuffled.push(winnerName);
  return shuffled;
}

function specAnimateSlot(reel, athletes, winnerName, label, labelText) {
  return new Promise((resolve) => {
    const names = athletes.map((a) => formatAthleteName(a));
    if (!names.length) names.push(winnerName);
    if (!names.includes(winnerName)) names.push(winnerName);

    const items = buildReelItems(names, winnerName);
    const { itemHeight, containerHeight } = getSlotDimensions();

    reel.innerHTML = items
      .map(
        (name, idx) =>
          `<div class="slot-item ${idx === items.length - 1 ? 'highlight' : ''}">${escHtml(name)}</div>`
      )
      .join('');

    const totalHeight = items.length * itemHeight;
    const centerOffset = Math.floor((containerHeight - itemHeight) / 2);
    const finalY = -(totalHeight - itemHeight - centerOffset);

    gsap.fromTo(
      reel,
      { y: 0 },
      {
        y: finalY,
        duration: 3.5,
        ease: 'expo.out',
        onComplete: () => {
          const winnerEl = reel.querySelector('.slot-item.highlight');
          if (winnerEl) {
            winnerEl.classList.add('winner-flash');
            gsap.fromTo(
              winnerEl,
              { scale: 1 },
              { scale: 1.1, repeat: 3, yoyo: true, duration: 0.2, ease: 'power2.inOut',
                onComplete: () => { winnerEl.style.transform = 'scale(1)'; }
              }
            );
          }
          if (label) label.textContent = `✅ ${labelText}: ${winnerName}`;
          fireConfetti();
          resolve();
        },
      }
    );
  });
}

// ─── Fly-to-Bracket Animation ─────────────────
async function flyToBracket(matchId, slot, name) {
  const targetId = `bracket-slot-${matchId}-${slot}`;

  // Re-check: sometimes the SVG is in spec-bracket-container
  const specContainer = document.getElementById('spec-bracket-container');
  if (!specContainer) return;

  const targetEl = specContainer.querySelector(`#${CSS.escape(targetId)}`);
  if (!targetEl) return;

  const targetRect = targetEl.getBoundingClientRect();
  if (!targetRect.width && !targetRect.height) return;

  // Source: center of the spec slot machine
  const overlayInner = document.querySelector('.spec-overlay-inner');
  const sourceEl = document.querySelector('.spec-slot-machine');
  const sourceRect = sourceEl
    ? sourceEl.getBoundingClientRect()
    : { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0, height: 0 };

  const flyContainer = document.getElementById('fly-container');
  if (!flyContainer) return;

  const card = document.createElement('div');
  card.className = 'fly-name-card';
  card.textContent = name;
  flyContainer.appendChild(card);

  const srcX = sourceRect.left + sourceRect.width / 2;
  const srcY = sourceRect.top + sourceRect.height / 2;
  const tgtX = targetRect.left + targetRect.width / 2;
  const tgtY = targetRect.top + targetRect.height / 2;

  gsap.set(card, {
    position: 'fixed',
    left: srcX,
    top: srcY,
    xPercent: -50,
    yPercent: -50,
    opacity: 1,
    zIndex: 8000,
  });

  await new Promise((resolve) => {
    gsap.to(card, {
      left: tgtX,
      top: tgtY,
      duration: 0.85,
      ease: 'back.out(1.4)',
      onComplete: () => {
        gsap.to(card, {
          opacity: 0,
          scale: 0.5,
          duration: 0.3,
          ease: 'power2.in',
          onComplete: () => {
            card.remove();
            resolve();
          },
        });
      },
    });
  });
}

// ─── Confetti Burst ───────────────────────────
function fireConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = Array.from({ length: 80 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height * 0.4,
    r: Math.random() * 6 + 3,
    color: `hsl(${Math.floor(Math.random() * 360)}, 90%, 60%)`,
    tilt: Math.random() * 10 - 10,
    tiltAngleInc: Math.random() * 0.07 + 0.05,
    tiltAngle: 0,
    vy: Math.random() * 3 + 2,
  }));

  let frame = 0;
  const maxFrames = 120;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p) => {
      ctx.beginPath();
      ctx.lineWidth = p.r;
      ctx.strokeStyle = p.color;
      ctx.moveTo(p.x + p.tilt + p.r / 3, p.y);
      ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 5);
      ctx.stroke();
      p.tiltAngle += p.tiltAngleInc;
      p.y += p.vy;
      p.tilt = Math.sin(p.tiltAngle) * 12;
    });
    frame++;
    if (frame < maxFrames) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  draw();
}

// ─── PDF Export wrapper ───────────────────────
function specExportPDF() {
  if (typeof exportPDF === 'function') {
    exportPDF(specCategory, specMatches, specAthletes);
  }
}

// ─── Helpers ─────────────────────────────────
function formatAthleteName(ath) {
  if (!ath) return 'BYE';
  const last = (ath.lastName || '').toUpperCase();
  const first = ath.firstName || '';
  const country = ath.country || '';
  const club = ath.club || '';
  const suffix = [country, club].filter(Boolean).join('/');
  return suffix ? `${last} ${first}, ${suffix}` : `${last} ${first}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Hata oluştu');
  return data;
}
