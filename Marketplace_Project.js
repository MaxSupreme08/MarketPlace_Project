// ---------- 1. CONFIG ----------
const CONFIG = {
  STORAGE_KEY: 'iips_listings',
  MANAGER_PASSCODE: 'iips@2026',   // change this. Convenience lock only, not real security
  MAX_IMAGES: 5,
};
const MGR_KEY = 'iips_manager';

// ---------- 2. STATE ----------
let listings = [];
try { listings = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY)) || []; } catch (e) { listings = []; }
let currentId = null;
let productFiles = [];
let animateTiles = true;

// ---------- 3. HELPERS ----------
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => Number(n).toLocaleString('en-IN');
const hashPin = (p) => { let h = 5381; for (const ch of 'iips' + p) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0; return String(h); };

function timeAgo(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' hr ago';
  const d = Math.floor(h / 24);
  return d + (d === 1 ? ' day ago' : ' days ago');
}

// DOM references
const listingModal = $('listingModal'), detailModal = $('adDetailModal'), askModal = $('askModal');
const marketplaceSection = $('marketplaceSection'), managerSection = $('managerSection');
const viewManagerBtn = $('viewManagerBtn');
const listingsContainer = $('listingsContainer');
const pendingContainer = $('pendingListingsContainer');
const liveManagerContainer = $('liveManagerContainer');
const searchInput = $('searchInput'), conditionFilter = $('conditionFilter'), sortSelect = $('sortSelect');

// ---------- 4. DIALOGS ----------
const openDlg = (d) => { d.classList.remove('closing'); d.showModal(); };
function closeDlg(d) {
  if (!d.open || d.classList.contains('closing')) return;
  d.classList.add('closing');
  d.addEventListener('animationend', () => { d.close(); d.classList.remove('closing'); }, { once: true });
}

let askResolve = null;
function ask({ title, text = '', input = false, numeric = false, ok = 'Confirm', danger = false }) {
  return new Promise(resolve => {
    askResolve = resolve;
    $('askTitle').textContent = title;
    $('askText').textContent = text;
    const f = $('askInput');
    f.hidden = !input; f.required = input; f.value = '';
    f.inputMode = numeric ? 'numeric' : 'text';
    $('askOk').textContent = ok;
    $('askOk').className = danger ? 'btn-reject' : 'btn-submit';
    openDlg(askModal);
    if (input) setTimeout(() => f.focus(), 60);
  });
}
function askDone(v) {
  if (askResolve) { askResolve(v); askResolve = null; }
  closeDlg(askModal);
}
$('askForm').addEventListener('submit', (e) => { e.preventDefault(); askDone($('askInput').hidden ? true : $('askInput').value.trim()); });
$('askCancel').addEventListener('click', () => askDone(null));

function dismiss(d) { d === askModal ? askDone(null) : closeDlg(d); }
[listingModal, detailModal, askModal].forEach(d => {
  d.addEventListener('cancel', (e) => { e.preventDefault(); dismiss(d); });             // Esc key
  d.addEventListener('click', (e) => { if (e.target === d) dismiss(d); });              // backdrop click
});
$('closeModalBtn').addEventListener('click', () => closeDlg(listingModal));
$('cancelFormBtn').addEventListener('click', () => closeDlg(listingModal));
$('closeDetailBtn').addEventListener('click', () => closeDlg(detailModal));
$('openFormBtn').addEventListener('click', () => openDlg(listingModal));
$('heroSellBtn').addEventListener('click', () => openDlg(listingModal));

// ---------- 5. TOASTS ----------
function toast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = `<span class="ti">${type === 'error' ? '!' : '✓'}</span><span>${esc(msg)}</span>`;
  $('toastContainer').appendChild(t);
  setTimeout(() => { t.classList.add('out'); t.addEventListener('animationend', () => t.remove(), { once: true }); }, 3200);
}

// ---------- 6. IMAGES ----------
// Shrinks an image and returns a small JPEG (keeps localStorage from filling up)
function readImage(file, maxSize = 700) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.75));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ---------- 7. FORM ----------
function renderPreview() {
  $('imagePreviewContainer').innerHTML = productFiles.map((f, i) =>
    `<div class="pv"><img src="${URL.createObjectURL(f)}" alt="Selected photo ${i + 1}">
     <button type="button" data-i="${i}" aria-label="Remove photo ${i + 1}">&times;</button></div>`).join('');
}
$('productPhotos').addEventListener('change', (e) => {
  const room = CONFIG.MAX_IMAGES - productFiles.length;
  const picked = Array.from(e.target.files);
  if (picked.length > room) toast(`You can add up to ${CONFIG.MAX_IMAGES} photos`, 'error');
  productFiles.push(...picked.slice(0, room));
  e.target.value = '';
  renderPreview();
});
$('imagePreviewContainer').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-i]');
  if (b) { productFiles.splice(Number(b.dataset.i), 1); renderPreview(); }
});

$('listingForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!productFiles.length) return toast('Add at least one product photo', 'error');
  const btn = $('submitBtn');
  btn.disabled = true; btn.textContent = 'Submitting…';
  try {
    const [sellerPhoto, productPhotos] = await Promise.all([
      readImage($('sellerphotos').files[0], 150),
      Promise.all(productFiles.map(f => readImage(f)))
    ]);
    listings.push({
      id: Date.now(),
      sellerName: $('sellerName').value.trim(),
      sellerPhoto,
      phone: $('phone').value.trim(),
      whatsapp: $('whatsapp').value.trim(),
      title: $('title').value.trim(),
      price: $('price').value,
      productPhotos,
      usage: $('usage').value,
      warranty: $('warranty').value.trim(),
      description: $('description').value.trim(),
      pinHash: hashPin($('deletePin').value),
      status: 'pending'
    });
    if (!save()) { listings.pop(); return; }
    $('listingForm').reset();
    productFiles = []; renderPreview();
    closeDlg(listingModal);
    toast('Listing submitted. It goes live after manager approval.');
  } catch (err) {
    console.error(err);
    toast('Could not process the images. Try different files.', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Submit for Approval';
  }
});

// ---------- 8. ACTIONS ----------
function save() {
  try {
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(listings));
    render();
    return true;
  } catch (err) {
    toast('Storage is full. Try fewer or smaller images.', 'error');
    return false;
  }
}

async function leave(id) {
  const el = document.querySelector(`[data-card="${id}"]`);
  if (el) { el.classList.add('leaving'); await sleep(320); }
}

async function approve(id) {
  await leave(id);
  const item = listings.find(l => l.id === id);
  if (item) item.status = 'approved';
  save();
  toast('Listing approved and now live');
}

async function remove(id) {
  const ok = await ask({ title: 'Delete this listing?', text: 'This cannot be undone.', ok: 'Delete', danger: true });
  if (!ok) return;
  await leave(id);
  listings = listings.filter(l => l.id !== id);
  save();
  toast('Listing deleted');
}

pendingContainer.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = Number(btn.dataset.id);
  btn.dataset.action === 'approve' ? approve(id) : remove(id);
});
liveManagerContainer.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-id]');
  if (btn) remove(Number(btn.dataset.id));
});

// Seller removes own listing using the PIN
$('removeListingBtn').addEventListener('click', async () => {
  const l = listings.find(x => x.id === currentId);
  if (!l) return;
  const pin = await ask({ title: 'Remove your listing', text: 'Enter your 4-digit delete PIN.', input: true, numeric: true, ok: 'Remove' });
  if (pin === null) return;
  if (!l.pinHash || hashPin(pin) !== l.pinHash) {
    return toast('Wrong PIN. If you forgot it, contact the manager.', 'error');
  }
  closeDlg(detailModal);
  listings = listings.filter(x => x.id !== currentId);
  save();
  toast('Your listing has been removed');
});

// ---------- 9. RENDER ----------
function countTo(el, to) {
  const from = Number(el.dataset.v || 0);
  el.dataset.v = to;
  const t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / 900);
    el.textContent = money(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function render() {
  const pending = listings.filter(l => l.status === 'pending');
  const approved = listings.filter(l => l.status === 'approved');
  const inManager = !managerSection.hidden;

  // Header button
  viewManagerBtn.innerHTML = inManager
    ? '← Back to Marketplace'
    : `Manager Dashboard <span class="badge ${pending.length ? 'pulse' : ''}" id="pendingCount">${pending.length}</span>`;

  // Hero stats
  const sellers = new Set(approved.map(l => l.phone)).size;
 const lowest = approved.length ? Math.min(...approved.map(l => Number(l.price))) : 0;

countTo($('statLowest'), lowest);
  countTo($('statLive'), approved.length);
  countTo($('statSellers'), sellers);
 countTo($('statLowest'), lowest);

  // Live feed with search, filter, sort
  const q = searchInput.value.toLowerCase().trim();
  const cond = conditionFilter.value;
  const shown = approved
    .filter(l => (!cond || l.usage === cond) &&
      (l.title + ' ' + l.description + ' ' + l.usage + ' ' + l.sellerName).toLowerCase().includes(q))
    .sort((a, b) => sortSelect.value === 'low' ? a.price - b.price : sortSelect.value === 'high' ? b.price - a.price : b.id - a.id);

  $('resultCount').textContent = approved.length ? `${shown.length} of ${approved.length} listings` : '';
  listingsContainer.innerHTML = shown.length === 0
    ? `<div class="empty"><div class="empty-ico">🔎</div>
       <p>${approved.length ? 'No listings match your search. Try a different word or clear the filters.' : 'No listings yet. Be the first to post something.'}</p></div>`
    : shown.map((l, i) => `
      <article class="tile ${animateTiles ? 'enter' : ''}" style="--i:${Math.min(i, 12)}" data-id="${l.id}" data-card="${l.id}" tabindex="0" aria-label="${esc(l.title)}, ₹${esc(l.price)}">
        <div class="cover-wrap">
          <img class="cover" src="${l.productPhotos[0]}" alt="${esc(l.title)}" loading="lazy">
          <span class="price-tag">₹${money(l.price)}</span>
          ${l.productPhotos.length > 1 ? `<span class="count-tag">${l.productPhotos.length} photos</span>` : ''}
        </div>
        <div class="tile-body">
          <h3>${esc(l.title)}</h3>
          <p class="cond">${esc(l.usage)}</p>
          <div class="seller"><img src="${l.sellerPhoto}" alt=""><span>${esc(l.sellerName)}</span><time>${timeAgo(l.id)}</time></div>
        </div>
      </article>`).join('');
  animateTiles = false;

  // Manager: live listings
  liveManagerContainer.innerHTML = approved.length === 0
    ? '<p class="muted">No live listings.</p>'
    : approved.map(l => `
      <div class="card live" data-card="${l.id}">
        <img class="cover" src="${l.productPhotos[0]}" alt="${esc(l.title)}">
        <div class="info">
          <h3>${esc(l.title)} · ₹${money(l.price)}</h3>
          <p class="muted">Seller: ${esc(l.sellerName)} (Ph: ${esc(l.phone)})</p>
          <button class="btn-reject" data-id="${l.id}">🗑️ Delete</button>
        </div>
      </div>`).join('');

  // Manager: approval queue
  pendingContainer.innerHTML = pending.length === 0
    ? '<p class="muted">No pending approvals. You are all caught up.</p>'
    : pending.map(l => `
      <div class="card" data-card="${l.id}">
        <img class="cover" src="${l.productPhotos[0]}" alt="${esc(l.title)}">
        <div class="info">
          <div class="seller"><img src="${l.sellerPhoto}" alt=""><span>Seller: <strong>${esc(l.sellerName)}</strong> (Ph: ${esc(l.phone)})</span></div>
          <h3>${esc(l.title)} · ₹${money(l.price)}</h3>
          <p><strong>Condition:</strong> ${esc(l.usage)} | <strong>Warranty:</strong> ${esc(l.warranty)}</p>
          <p class="muted">${esc(l.description)}</p>
          <button class="btn-approve" data-action="approve" data-id="${l.id}">✅ Approve</button>
          <button class="btn-reject" data-action="reject" data-id="${l.id}">❌ Reject</button>
        </div>
      </div>`).join('');
}

[searchInput, conditionFilter, sortSelect].forEach(el => el.addEventListener('input', render));

// ---------- 10. DETAILS ----------
function openDetails(id) {
  const l = listings.find(x => x.id === id);
  if (!l) return;
  currentId = id;

  $('detailTitle').textContent = l.title;
  $('detailPrice').textContent = '₹' + money(l.price);
  $('detailUsage').textContent = l.usage;
  $('detailWarranty').textContent = l.warranty;
  $('detailDescription').textContent = l.description;
  $('detailSellerName').textContent = l.sellerName;
  $('detailTime').textContent = '· ' + timeAgo(l.id);
  $('detailSellerPhoto').src = l.sellerPhoto;

  let wa = l.whatsapp.replace(/\D/g, '');
  if (wa.length === 10) wa = '91' + wa;                       // assume India if no country code
  const msg = encodeURIComponent(`Hi ${l.sellerName}, I saw your ad for ${l.title} on IIPS Marketplace.`);
  $('detailCallBtn').href = 'tel:' + l.phone.replace(/\s/g, '');
  $('detailWhatsappBtn').href = `https://wa.me/${wa}?text=${msg}`;

  const main = $('detailMainImage'), thumbs = $('detailThumbnailsContainer');
  const show = (src) => { main.src = src; main.classList.remove('swap'); void main.offsetWidth; main.classList.add('swap'); };
  show(l.productPhotos[0]);
  thumbs.innerHTML = '';
  l.productPhotos.forEach((src, i) => {
    const t = document.createElement('img');
    t.src = src; t.alt = `Photo ${i + 1}`;
    t.className = i === 0 ? 'active' : '';
    t.addEventListener('click', () => {
      show(src);
      thumbs.querySelectorAll('img').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
    });
    thumbs.appendChild(t);
  });
  openDlg(detailModal);
}
listingsContainer.addEventListener('click', (e) => {
  const tile = e.target.closest('.tile');
  if (tile) openDetails(Number(tile.dataset.id));
});
listingsContainer.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { const tile = e.target.closest('.tile'); if (tile) openDetails(Number(tile.dataset.id)); }
});

// ---------- 11. VIEWS ----------
function showView(view) {
  const manager = view === 'manager';
  managerSection.hidden = !manager;
  marketplaceSection.hidden = manager;
  const el = manager ? managerSection : marketplaceSection;
  el.classList.remove('view-in'); void el.offsetWidth; el.classList.add('view-in');
  animateTiles = !manager;
  render();
  window.scrollTo({ top: 0 });
}

viewManagerBtn.addEventListener('click', async () => {
  if (!managerSection.hidden) return showView('market');
  if (!sessionStorage.getItem(MGR_KEY)) {
    const code = await ask({ title: 'Manager access', text: 'Enter the manager passcode.', input: true, ok: 'Unlock' });
    if (code === null) return;
    if (code !== CONFIG.MANAGER_PASSCODE) return toast('Wrong passcode', 'error');
    sessionStorage.setItem(MGR_KEY, '1');
  }
  showView('manager');
});

// Nav links return to the marketplace if the manager view is open
document.querySelectorAll('.menu a, .logo').forEach(a =>
  a.addEventListener('click', () => { if (!managerSection.hidden) showView('market'); }));

// ---------- 12. PAGE EFFECTS ----------
// Hero headline: split into words for the entrance animation
document.querySelectorAll('[data-split]').forEach(h => {
  h.innerHTML = h.textContent.trim().split(/\s+/)
    .map((w, i) => `<span class="w" style="--d:${i * 60}ms">${esc(w)}</span>`).join(' ');
});

// Header shadow after scrolling
const topbar = $('topbar');
addEventListener('scroll', () => topbar.classList.toggle('scrolled', scrollY > 10), { passive: true });

// Highlight the nav link of the section in view
const spy = new IntersectionObserver((entries) => {
  entries.forEach(en => {
    if (en.isIntersecting) document.querySelectorAll('.menu a').forEach(a =>
      a.classList.toggle('active', a.dataset.spy === en.target.id));
  });
}, { rootMargin: '-40% 0px -55% 0px' });
['home', 'listings', 'about-us'].forEach(id => spy.observe($(id)));

// Reveal the "how it works" steps once as they scroll into view
const reveal = new IntersectionObserver((entries) => {
  entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); reveal.unobserve(en.target); } });
}, { threshold: 0.3 });
document.querySelectorAll('.reveal').forEach((el, i) => { el.style.setProperty('--d', i * 120 + 'ms'); reveal.observe(el); });

// ---------- 13. INIT ----------
render();
