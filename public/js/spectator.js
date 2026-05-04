/* ============================================
   Spectator (Presentation Mode) JavaScript
   Auto-refreshes bracket every 15 seconds.
   ============================================ */

let specCategory = null;
let specMatches = [];
let refreshTimer = null;

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

// ─── Init ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  startClock();
  setupCategoryMenu();
});

// ─── Category Menu ───────────────────────────
function setupCategoryMenu() {
  const items = document.querySelectorAll('.category-menu-item');
  items.forEach((item) => {
    item.addEventListener('click', () => {
      activateCategory(item.dataset.id, item.dataset.slug);
    });
  });
}

async function activateCategory(id, slug) {
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
    const [catData, matchData] = await Promise.all([
      apiFetch(`/api/categories/${id}`),
      apiFetch(`/api/matches/${id}`),
    ]);
    specCategory = catData.data;
    specMatches = matchData.data;
    renderSpectatorContent();
  } catch (err) {
    console.error('Spectator load error:', err.message);
  }
}

function renderSpectatorContent() {
  if (!specCategory) return;

  document.getElementById('spectator-placeholder').classList.add('hidden');
  document.getElementById('spectator-content').classList.remove('hidden');

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
      <span class="text-xs opacity-60 ml-2">Çift Repechage</span>
    `;
  } else {
    legendEl.classList.add('hidden');
  }

  // Replace bracket-container id temporarily
  const specContainer = document.getElementById('spec-bracket-container');
  const realContainer = document.getElementById('bracket-container');

  // Temporarily swap IDs so renderBracket targets the right container
  if (realContainer) realContainer.id = 'bracket-container-hidden';
  specContainer.id = 'bracket-container';

  if (specMatches.length > 0) {
    renderBracket(specMatches, specCategory);
  } else {
    specContainer.innerHTML = '<p class="text-muted" style="font-size: 1.2rem; padding: 40px;">Henüz kura çekilmemiş.</p>';
  }

  // Restore IDs
  specContainer.id = 'spec-bracket-container';
  if (realContainer) realContainer.id = 'bracket-container';
}

// ─── API Helper ──────────────────────────────
async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Hata oluştu');
  return data;
}
