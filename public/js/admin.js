/* ============================================
   Admin Panel JavaScript
   ============================================ */

let categoriesCache = [];
let athletesCache = [];
let currentFilterCategoryId = '';

// ─── Init ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadCategories();
  loadAthletes();

  document.getElementById('category-form').addEventListener('submit', handleAddCategory);
  document.getElementById('athlete-form').addEventListener('submit', handleAddAthlete);
  document.getElementById('filter-category').addEventListener('change', (e) => {
    currentFilterCategoryId = e.target.value;
    renderAthletes();
  });
  document.getElementById('edit-save-btn').addEventListener('click', handleEditSave);
  document.getElementById('edit-cancel-btn').addEventListener('click', closeModal);
});

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

// ─── Categories ──────────────────────────────
async function loadCategories() {
  try {
    const data = await apiFetch('/api/categories');
    categoriesCache = data.data;
    renderCategories();
    populateCategorySelects();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderCategories() {
  const container = document.getElementById('categories-list');
  if (!categoriesCache.length) {
    container.innerHTML = '<p class="loading-text">Henüz siklet eklenmemiş.</p>';
    return;
  }
  const bracketLabels = { DoubleRepechage: 'Çift Repechage', SingleElimination: 'Tek Eleme' };
  container.innerHTML = categoriesCache
    .map(
      (cat) => `
    <div class="list-item ${cat.drawStatus === 'Completed' ? 'completed' : ''}" data-id="${cat._id}">
      <div class="item-info">
        <div class="item-name">${escHtml(cat.name)}</div>
        <div class="item-meta">${escHtml(cat.gender)}${cat.ageGroup ? ' · ' + escHtml(cat.ageGroup) : ''}
          · <span class="text-xs opacity-70">${escHtml(bracketLabels[cat.bracketType] || cat.bracketType || 'Çift Repechage')}</span>
          ${cat.drawStatus === 'Completed' ? '<span class="badge-done">✓ Kura Çekildi</span>' : ''}
        </div>
      </div>
      <div class="item-actions">
        ${cat.drawStatus !== 'Completed'
          ? `<button class="btn btn-sm btn-danger" onclick="deleteCategory('${cat._id}')">Sil</button>`
          : `<button class="btn btn-sm btn-secondary" onclick="resetDraw('${cat._id}')">Kuradan Çıkar</button>`
        }
      </div>
    </div>
  `
    )
    .join('');
}

function populateCategorySelects() {
  const selects = ['ath-category', 'filter-category', 'edit-category'];
  selects.forEach((id) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const current = sel.value;
    const placeholder = id === 'filter-category' ? '<option value="">Tüm Sikletler</option>' : '<option value="">Siklet seç</option>';
    sel.innerHTML =
      placeholder +
      categoriesCache
        .map(
          (cat) =>
            `<option value="${cat._id}" ${current === cat._id ? 'selected' : ''}>${escHtml(cat.name)} — ${escHtml(cat.gender)}</option>`
        )
        .join('');
  });
}

async function handleAddCategory(e) {
  e.preventDefault();
  const body = {
    name: document.getElementById('cat-name').value.trim(),
    gender: document.getElementById('cat-gender').value,
    ageGroup: document.getElementById('cat-ageGroup').value.trim(),
    bracketType: document.getElementById('cat-bracketType').value,
  };
  try {
    await apiFetch('/api/categories', { method: 'POST', body: JSON.stringify(body) });
    document.getElementById('cat-name').value = '';
    document.getElementById('cat-ageGroup').value = '';
    showToast('Siklet eklendi', 'success');
    await loadCategories();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteCategory(id) {
  if (!confirm('Bu sikleti ve tüm sporcularını silmek istediğinizden emin misiniz?')) return;
  try {
    await apiFetch(`/api/categories/${id}`, { method: 'DELETE' });
    showToast('Siklet silindi', 'success');
    await loadCategories();
    await loadAthletes();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function resetDraw(id) {
  if (!confirm('Bu kategorinin kura sonuçları silinecek. Onaylıyor musunuz?')) return;
  try {
    await apiFetch(`/api/categories/${id}/reset-draw`, { method: 'POST' });
    showToast('Kura sıfırlandı', 'success');
    await loadCategories();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ─── Athletes ────────────────────────────────
async function loadAthletes() {
  try {
    const data = await apiFetch('/api/athletes');
    athletesCache = data.data;
    renderAthletes();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderAthletes() {
  const container = document.getElementById('athletes-list');
  let filtered = athletesCache;
  if (currentFilterCategoryId) {
    filtered = athletesCache.filter(
      (a) => a.category && a.category._id === currentFilterCategoryId
    );
  }
  if (!filtered.length) {
    container.innerHTML = '<p class="loading-text">Sporcu bulunamadı.</p>';
    return;
  }
  const seedEmoji = ['', '🥇', '🥈', '🥉', '4️⃣'];
  container.innerHTML = filtered
    .map(
      (ath) => `
    <div class="list-item" data-id="${ath._id}">
      <div class="item-info">
        <div class="item-name">
          ${escHtml(ath.lastName)}, ${escHtml(ath.firstName)}
          ${ath.seedIndex ? `<span class="badge badge-seeded">${seedEmoji[ath.seedIndex] || '★'} Seri${ath.seedIndex}</span>` : ''}
          ${ath.isWinner ? '<span class="badge badge-winner">🏆 Şampiyon</span>' : ''}
        </div>
        <div class="item-meta">
          ${ath.country ? `<span class="badge badge-country">${escHtml(ath.country)}</span> ` : ''}
          ${ath.club ? escHtml(ath.club) + ' · ' : ''}
          ${ath.category ? escHtml(ath.category.name) : ''}
          ${ath.category && ath.category.drawStatus === 'Completed' ? '<span class="badge-done">Kura Tamamlandı</span>' : ''}
        </div>
      </div>
      <div class="item-actions">
        <button class="btn btn-sm btn-info" onclick="openEditModal('${ath._id}')">Düzenle</button>
        <button class="btn btn-sm btn-danger" onclick="deleteAthlete('${ath._id}')">Sil</button>
      </div>
    </div>
  `
    )
    .join('');
}

async function handleAddAthlete(e) {
  e.preventDefault();
  const seedVal = document.getElementById('ath-seedIndex').value;
  const body = {
    firstName: document.getElementById('ath-firstName').value.trim(),
    lastName: document.getElementById('ath-lastName').value.trim(),
    club: document.getElementById('ath-club').value.trim(),
    country: (document.getElementById('ath-country').value || '').trim().toUpperCase(),
    category: document.getElementById('ath-category').value,
    seedIndex: seedVal ? Number(seedVal) : null,
  };
  if (!body.category) {
    showToast('Lütfen bir siklet seçin', 'error');
    return;
  }
  try {
    await apiFetch('/api/athletes', { method: 'POST', body: JSON.stringify(body) });
    document.getElementById('ath-firstName').value = '';
    document.getElementById('ath-lastName').value = '';
    document.getElementById('ath-club').value = '';
    document.getElementById('ath-country').value = '';
    document.getElementById('ath-seedIndex').value = '';
    showToast('Sporcu eklendi', 'success');
    await loadAthletes();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteAthlete(id) {
  if (!confirm('Bu sporcuyu silmek istiyor musunuz?')) return;
  try {
    await apiFetch(`/api/athletes/${id}`, { method: 'DELETE' });
    showToast('Sporcu silindi', 'success');
    await loadAthletes();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openEditModal(id) {
  const ath = athletesCache.find((a) => a._id === id);
  if (!ath) return;
  document.getElementById('edit-id').value = ath._id;
  document.getElementById('edit-firstName').value = ath.firstName;
  document.getElementById('edit-lastName').value = ath.lastName;
  document.getElementById('edit-club').value = ath.club || '';
  document.getElementById('edit-country').value = ath.country || '';
  document.getElementById('edit-seedIndex').value = ath.seedIndex || '';
  populateCategorySelects();
  document.getElementById('edit-category').value = ath.category ? ath.category._id : '';
  document.getElementById('edit-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('edit-modal').classList.add('hidden');
}

async function handleEditSave() {
  const id = document.getElementById('edit-id').value;
  const seedVal = document.getElementById('edit-seedIndex').value;
  const body = {
    firstName: document.getElementById('edit-firstName').value.trim(),
    lastName: document.getElementById('edit-lastName').value.trim(),
    club: document.getElementById('edit-club').value.trim(),
    country: (document.getElementById('edit-country').value || '').trim().toUpperCase(),
    category: document.getElementById('edit-category').value,
    seedIndex: seedVal ? Number(seedVal) : null,
  };
  try {
    await apiFetch(`/api/athletes/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    closeModal();
    showToast('Sporcu güncellendi', 'success');
    await loadAthletes();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ─── Toast ───────────────────────────────────
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.add('hidden'), 4000);
}

// ─── Utility ─────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
