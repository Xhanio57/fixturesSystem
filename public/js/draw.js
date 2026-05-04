/* ============================================
   Live Draw (Kura) JavaScript
   GSAP Slot Machine Animation with expo.out easing,
   Confetti burst, Pool labels, Double Repechage support
   ============================================ */

// Slot machine dimensions — read dynamically from CSS custom properties
function getSlotDimensions() {
  const style = getComputedStyle(document.documentElement);
  const parseSize = (v) => parseInt(v) || 56;
  return {
    itemHeight: parseSize(style.getPropertyValue('--slot-item-height')),
    containerHeight: parseSize(style.getPropertyValue('--slot-container-height')),
  };
}

let currentCategory = null;
let currentAthletes = [];
let currentMatches = [];

// ─── Init ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupCategoryMenu();
  document.getElementById('draw-btn').addEventListener('click', runDraw);

  // Handle browser back/forward
  window.addEventListener('popstate', (e) => {
    if (e.state && e.state.slug) {
      activateCategoryBySlug(e.state.slug, false);
    } else {
      showPlaceholder();
    }
  });

  // Load from URL on page load
  const pathParts = window.location.pathname.split('/');
  if (pathParts.length >= 3 && pathParts[1] === 'kura' && pathParts[2]) {
    activateCategoryBySlug(decodeURIComponent(pathParts[2]), false);
  }
});

// ─── Category Menu ───────────────────────────
function setupCategoryMenu() {
  const items = document.querySelectorAll('.category-menu-item');
  items.forEach((item) => {
    item.addEventListener('click', () => {
      const slug = item.dataset.slug;
      const id = item.dataset.id;
      activateCategory(id, slug, true);
    });
  });
}

function activateCategoryBySlug(slug, pushState) {
  const item = document.querySelector(`.category-menu-item[data-slug="${CSS.escape(slug)}"]`);
  if (item) {
    activateCategory(item.dataset.id, slug, pushState);
  }
}

async function activateCategory(id, slug, pushState) {
  document.querySelectorAll('.category-menu-item').forEach((el) => el.classList.remove('active'));
  const activeItem = document.querySelector(`.category-menu-item[data-id="${id}"]`);
  if (activeItem) activeItem.classList.add('active');

  if (pushState) {
    const url = `/kura/${encodeURIComponent(slug)}`;
    history.pushState({ slug }, '', url);
  }

  try {
    const [catData, athData, matchData] = await Promise.all([
      apiFetch(`/api/categories/${id}`),
      apiFetch(`/api/athletes?categoryId=${id}`),
      apiFetch(`/api/matches/${id}`),
    ]);

    currentCategory = catData.data;
    currentAthletes = athData.data;
    currentMatches = matchData.data;

    renderDrawContent();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function showPlaceholder() {
  document.getElementById('placeholder-view').classList.remove('hidden');
  document.getElementById('draw-content').classList.add('hidden');
  currentCategory = null;
}

function renderDrawContent() {
  if (!currentCategory) return;

  document.getElementById('placeholder-view').classList.add('hidden');
  document.getElementById('draw-content').classList.remove('hidden');

  // Header
  document.getElementById('draw-cat-title').textContent = currentCategory.name;
  document.getElementById('draw-cat-meta').textContent =
    `${currentCategory.gender}${currentCategory.ageGroup ? ' · ' + currentCategory.ageGroup : ''} · ${currentAthletes.length} sporcu`;

  // Pool legend visibility
  const isDoubleRep = currentCategory.bracketType === 'DoubleRepechage';
  const poolLegend = document.getElementById('pool-legend');
  const typeLabel = document.getElementById('bracket-type-label');
  if (typeLabel) typeLabel.textContent = isDoubleRep ? 'Çift Repechage' : 'Tek Eleme';
  poolLegend.classList.toggle('hidden', !isDoubleRep);

  // Bracket type badge
  const badge = document.getElementById('bracket-type-badge');
  if (badge) {
    badge.textContent = isDoubleRep ? '🔀 Çift Repechage' : '⚔️ Tek Eleme';
    badge.className = `badge ${isDoubleRep ? 'badge-rep' : 'badge-se'} ml-2 text-xs`;
  }

  // Athletes list
  renderAthletesList();

  // Draw button state
  const drawBtn = document.getElementById('draw-btn');
  const drawCompleted = currentCategory.drawStatus === 'Completed';
  if (drawCompleted) {
    drawBtn.disabled = true;
    drawBtn.textContent = '✓ Kura Çekildi';
  } else {
    drawBtn.disabled = false;
    drawBtn.textContent = '🎯 Kura Başlat';
  }

  // Bracket
  if (currentMatches.length > 0) {
    document.getElementById('bracket-section').classList.remove('hidden');
    renderBracket(currentMatches, currentCategory);
  } else {
    document.getElementById('bracket-section').classList.add('hidden');
    document.getElementById('bracket-container').innerHTML = '';
  }

  resetSlotReel();
}

function renderAthletesList() {
  const list = document.getElementById('draw-athletes-list');
  if (!currentAthletes.length) {
    list.innerHTML = '<li class="text-muted">Sporcu eklenmemiş</li>';
    return;
  }
  const seedEmoji = ['', '🥇', '🥈', '🥉', '4️⃣'];
  list.innerHTML = currentAthletes
    .map(
      (ath) => `
    <li class="draw-athlete-item">
      <span class="ath-name">
        ${escHtml(ath.lastName)}, ${escHtml(ath.firstName)}
        ${ath.seedIndex ? ` <span class="badge badge-seeded">${seedEmoji[ath.seedIndex] || '★'}</span>` : ''}
      </span>
      <span class="ath-club">${escHtml(ath.club || '')}</span>
    </li>
  `
    )
    .join('');
}

// ─── Slot Machine ────────────────────────────
function resetSlotReel() {
  const reel = document.getElementById('slot-reel');
  reel.style.transform = 'translateY(0)';
  reel.innerHTML = '<div class="slot-item">—</div>';
  const label = document.getElementById('slot-label');
  if (label) label.textContent = 'Kura Başlamadı';
}

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

async function runDraw() {
  if (!currentCategory) return;
  if (currentAthletes.length < 2) {
    showToast('En az 2 sporcu gereklidir', 'error');
    return;
  }

  const drawBtn = document.getElementById('draw-btn');
  drawBtn.disabled = true;
  drawBtn.textContent = '⏳ Kura Çekiliyor...';

  try {
    const data = await apiFetch(`/api/matches/draw/${currentCategory._id}`, { method: 'POST' });
    currentMatches = data.data;
    currentCategory.drawStatus = 'Completed';
    currentCategory.isDrawCompleted = true;

    const menuItem = document.querySelector(`.category-menu-item[data-id="${currentCategory._id}"]`);
    if (menuItem) menuItem.classList.add('completed');

    // Only animate R1 main-bracket matches
    const r1Matches = currentMatches.filter((m) => m.roundNumber === 1 &&
      !['RepAB','RepCD','Bronze1','Bronze2'].includes(m.pool));

    await runSlotAnimation(r1Matches);

    drawBtn.textContent = '✓ Kura Çekildi';
    drawBtn.disabled = true;

    // Show full bracket
    document.getElementById('bracket-section').classList.remove('hidden');
    renderBracket(currentMatches, currentCategory);
    showToast('Kura başarıyla tamamlandı! 🎉', 'success');
  } catch (err) {
    showToast(err.message, 'error');
    drawBtn.disabled = false;
    drawBtn.textContent = '🎯 Kura Başlat';
  }
}

async function runSlotAnimation(r1Matches) {
  if (!r1Matches.length) return;

  const reel = document.getElementById('slot-reel');
  const label = document.getElementById('slot-label');

  for (let i = 0; i < r1Matches.length; i++) {
    const match = r1Matches[i];
    const poolLabel = match.pool ? ` [Pool ${match.pool}]` : '';
    const aName = match.athleteA
      ? `${match.athleteA.lastName}, ${match.athleteA.firstName}`
      : 'BYE';
    const bName = match.athleteB
      ? `${match.athleteB.lastName}, ${match.athleteB.firstName}`
      : 'BYE';

    if (label) label.textContent = `Maç ${i + 1}${poolLabel}: Eşleşme çekiliyor...`;

    await animateSlot(reel, currentAthletes, aName, label, `Maç ${i + 1}${poolLabel} — A`);
    await sleep(600);

    await animateSlot(reel, currentAthletes, bName, label, `Maç ${i + 1}${poolLabel} — B`);
    await sleep(900);
  }

  if (label) label.textContent = '✓ Kura Tamamlandı';
}

/**
 * Animates the slot machine reel to land on winnerName.
 * Uses expo.out easing for a professional deceleration effect.
 */
function animateSlot(reel, athletes, winnerName, label, labelText) {
  return new Promise((resolve) => {
    const names = athletes.map((a) => `${a.lastName}, ${a.firstName}`);
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

    // expo.out: starts very fast, decelerates sharply — creates dramatic slot-machine feel
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
            // Pulse animation via GSAP
            gsap.fromTo(
              winnerEl,
              { scale: 1 },
              { scale: 1.08, repeat: 3, yoyo: true, duration: 0.18, ease: 'power2.inOut',
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

// ─── Confetti Burst ──────────────────────────
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
    d: Math.random() * 80,
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

// ─── API Helpers ─────────────────────────────
async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Hata oluştu');
  return data;
}

// ─── Toast ───────────────────────────────────
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.add('hidden'), 5000);
}

// ─── Utility ─────────────────────────────────
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

