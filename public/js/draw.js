/* ============================================
   Live Draw (Kura) JavaScript
   GSAP Slot Machine Animation
   ============================================ */

// Slot machine dimensions — read dynamically from CSS custom properties to stay in sync
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
  // Update active state in menu
  document.querySelectorAll('.category-menu-item').forEach((el) => el.classList.remove('active'));
  const activeItem = document.querySelector(`.category-menu-item[data-id="${id}"]`);
  if (activeItem) activeItem.classList.add('active');

  // Push URL
  if (pushState) {
    const url = `/kura/${encodeURIComponent(slug)}`;
    history.pushState({ slug }, '', url);
  }

  // Load data
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

  // Athletes list
  renderAthletesList();

  // Draw button state
  const drawBtn = document.getElementById('draw-btn');
  if (currentCategory.isDrawCompleted) {
    drawBtn.disabled = true;
    drawBtn.textContent = '✓ Kura Çekildi';
  } else {
    drawBtn.disabled = false;
    drawBtn.textContent = '🎯 Kura Başlat';
  }

  // Bracket
  if (currentMatches.length > 0) {
    document.getElementById('bracket-section').classList.remove('hidden');
    renderBracket(currentMatches, currentCategory.name);
  } else {
    document.getElementById('bracket-section').classList.add('hidden');
    document.getElementById('bracket-container').innerHTML = '';
  }

  // Reset slot reel
  resetSlotReel();
}

function renderAthletesList() {
  const list = document.getElementById('draw-athletes-list');
  if (!currentAthletes.length) {
    list.innerHTML = '<li class="text-muted">Sporcu eklenmemiş</li>';
    return;
  }
  list.innerHTML = currentAthletes
    .map(
      (ath) => `
    <li class="draw-athlete-item">
      <span class="ath-name">
        ${escHtml(ath.lastName)}, ${escHtml(ath.firstName)}
        ${ath.isSeeded ? ' <span class="badge badge-seeded">★</span>' : ''}
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
  document.querySelector('.slot-label').textContent = 'Kura Başlamadı';
}

function buildReelItems(names, winnerName) {
  // Create a long list: shuffle names many times, add winner at end
  const shuffled = [];
  const repeatCount = 5;
  for (let r = 0; r < repeatCount; r++) {
    const arr = [...names].sort(() => Math.random() - 0.5);
    shuffled.push(...arr);
  }
  shuffled.push(winnerName); // Winner is the last visible item
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
    currentCategory.isDrawCompleted = true;

    // Update menu item
    const menuItem = document.querySelector(`.category-menu-item[data-id="${currentCategory._id}"]`);
    if (menuItem) menuItem.classList.add('completed');

    // Run slot machine animation for each pair
    await runSlotAnimation();

    drawBtn.textContent = '✓ Kura Çekildi';
    drawBtn.disabled = true;

    // Show bracket
    document.getElementById('bracket-section').classList.remove('hidden');
    renderBracket(currentMatches, currentCategory.name);
    showToast('Kura başarıyla tamamlandı!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
    drawBtn.disabled = false;
    drawBtn.textContent = '🎯 Kura Başlat';
  }
}

async function runSlotAnimation() {
  if (!currentMatches.length) return;

  const reel = document.getElementById('slot-reel');
  const label = document.querySelector('.slot-label');

  for (let i = 0; i < currentMatches.length; i++) {
    const match = currentMatches[i];
    const aName = match.athleteA
      ? `${match.athleteA.lastName}, ${match.athleteA.firstName}`
      : 'BYE';
    const bName = match.athleteB
      ? `${match.athleteB.lastName}, ${match.athleteB.firstName}`
      : 'BYE';

    label.textContent = `Maç ${i + 1}: Eşleşme çekiliyor...`;

    // Animate Athlete A
    await animateSlot(reel, currentAthletes, aName, label, `Maç ${i + 1} — Oyuncu A`);
    await sleep(600);

    // Animate Athlete B
    await animateSlot(reel, currentAthletes, bName, label, `Maç ${i + 1} — Oyuncu B`);
    await sleep(900);
  }

  label.textContent = '✓ Kura Tamamlandı';
}

function animateSlot(reel, athletes, winnerName, label, labelText) {
  return new Promise((resolve) => {
    const names = athletes.map((a) => `${a.lastName}, ${a.firstName}`);
    if (!names.includes(winnerName)) names.push(winnerName);

    const items = buildReelItems(names, winnerName);
    const { itemHeight, containerHeight } = getSlotDimensions();

    // Build DOM
    reel.innerHTML = items
      .map(
        (name, idx) =>
          `<div class="slot-item ${idx === items.length - 1 ? 'highlight' : ''}">${escHtml(name)}</div>`
      )
      .join('');

    const totalHeight = items.length * itemHeight;
    const centerOffset = Math.floor((containerHeight - itemHeight) / 2);
    const finalY = -(totalHeight - itemHeight - centerOffset);

    // GSAP tween: start fast, ease to a stop
    gsap.fromTo(
      reel,
      { y: 0 },
      {
        y: finalY,
        duration: 3.2,
        ease: 'power4.out',
        onComplete: () => {
          // Flash the winner item
          const winnerEl = reel.querySelector('.slot-item.highlight');
          if (winnerEl) {
            winnerEl.classList.add('winner-flash');
            label.textContent = `${labelText}: ${winnerName}`;
          }
          resolve();
        },
      }
    );
  });
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
