const PAGE_SIZE = 120;
const CART_KEY = 'lorcana-cart';

const $ = (id) => document.getElementById(id);
const state = { catalog: null, results: [], shown: 0, cart: new Map(), filters: {} }; // cart: card id → number of copies
let byId = new Map();

function cardUrl(rel) {
  return 'data/' + rel.split('/').map(encodeURIComponent).join('/');
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of children) node.append(c);
  return node;
}

function title(card) {
  return card.fields[state.catalog.titleField] || card.fileName;
}

function subtitle(card) {
  return state.catalog.subtitleFields.map((f) => card.fields[f]).filter(Boolean).join(' · ');
}

function normalize(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// ---- Search ----

function runSearch() {
  const terms = normalize($('search').value).split(/\s+/).filter(Boolean);
  const active = Object.entries(state.filters).filter(([, v]) => v);
  state.results = state.catalog.cards.filter((card) => {
    for (const [col, val] of active) if (String(card.fields[col] ?? '') !== val) return false;
    return terms.every((t) => card.haystack.includes(t));
  });
  state.shown = 0;
  $('grid').replaceChildren();
  renderMore();
  const n = state.results.length;
  $('resultCount').textContent = `${n.toLocaleString()} card${n === 1 ? '' : 's'}`;
}

function renderMore() {
  const grid = $('grid');
  if (!state.results.length) {
    grid.replaceChildren(el('div', { className: 'empty', textContent: 'No cards match that search.' }));
  }
  const next = state.results.slice(state.shown, state.shown + PAGE_SIZE);
  grid.append(...next.map(cardTile));
  state.shown += next.length;
  $('moreButton').style.display = state.shown < state.results.length ? '' : 'none';
}

function cardTile(card) {
  const img = el('img', { className: 'thumb', loading: 'lazy', alt: title(card), src: cardUrl(card.thumb) });
  img.onclick = () => openViewer(card);
  const tile = el('div', { className: 'card' },
    el('div', { className: 'thumb-wrap' }, img, el('span', { className: 'thumb-glint' })),
    el('div', { className: 'meta' },
      el('div', { className: 'name', textContent: title(card) }),
      el('div', { className: 'sub', textContent: subtitle(card) })),
    el('div', { className: 'add-slot' }));
  tile.dataset.id = card.id;
  paintTile(tile);
  return tile;
}

function paintTile(tile) {
  const id = tile.dataset.id;
  const qty = qtyOf(id);
  if (Number(tile.dataset.qty || 0) === qty && tile.querySelector('.add')) return;
  tile.classList.toggle('in-cart', qty > 0);
  tile.dataset.qty = qty;
  const control = qty
    ? stepper(id, 'add', `${qty} in cart`)
    : Object.assign(el('button', { className: 'add', textContent: 'Add to cart' }), { onclick: () => setQty(id, 1) });
  tile.querySelector('.add-slot').replaceChildren(control);
}

// ---- Filters ----

function buildFilters() {
  const box = $('filters');
  for (const f of state.catalog.filters) {
    const select = el('select', {}, el('option', { value: '', textContent: 'All' }),
      ...f.values.map((v) => el('option', { value: v, textContent: v })));
    select.onchange = () => { state.filters[f.column] = select.value; runSearch(); };
    box.append(el('label', {}, f.column, select));
  }
}

// ---- Cart ----

function saveCart() {
  try { localStorage.setItem(CART_KEY, JSON.stringify([...state.cart])); } catch { /* not saved */ }
}

const qtyOf = (id) => state.cart.get(id) || 0;
const cartTotal = () => [...state.cart.values()].reduce((a, b) => a + b, 0);

function setQty(id, qty) {
  if (qty > 0) state.cart.set(id, Math.min(qty, 99));
  else state.cart.delete(id);
  cartChanged();
}

// − n + buttons for changing how many copies of a card are in the cart.
function stepper(id, className, label) {
  const minus = el('button', { className: 'step', textContent: '−', title: 'One fewer' });
  minus.onclick = () => setQty(id, qtyOf(id) - 1);
  const plus = el('button', { className: 'step', textContent: '+', title: 'One more' });
  plus.onclick = () => setQty(id, qtyOf(id) + 1);
  return el('div', { className: `${className} stepper` }, minus, el('span', { className: 'count', textContent: label }), plus);
}

function cartChanged() {
  saveCart();
  $('cartCount').textContent = cartTotal();
  document.querySelectorAll('.card').forEach(paintTile);
  renderCart();
  if (viewerCard) paintViewerButton();
}

function renderCart() {
  const list = $('cartList');
  const items = [...state.cart.keys()].map((id) => byId.get(id)).filter(Boolean);
  const total = cartTotal();
  if (!items.length) {
    list.replaceChildren(el('div', { className: 'cart-empty', textContent: 'Your cart is empty. Click "Add to cart" on any card.' }));
  } else {
    list.replaceChildren(...items.map((card) => {
      const remove = el('button', { className: 'remove', textContent: 'Remove' });
      remove.onclick = () => setQty(card.id, 0);
      const img = el('img', { src: cardUrl(card.thumb), alt: '' });
      img.onclick = () => openViewer(card);
      return el('div', { className: 'cart-item' }, img,
        el('div', { className: 'info' },
          el('div', { textContent: title(card) }),
          el('div', { className: 'sub', textContent: subtitle(card) })),
        stepper(card.id, 'qty', String(qtyOf(card.id))),
        remove);
    }));
  }
  $('downloadButton').disabled = !items.length;
  $('downloadButton').textContent = items.length ? `Download images (${items.length})` : 'Download images';
  $('cartPdf').disabled = !items.length;
  $('cartPdf').textContent = total ? `Make PDF (${total} card${total === 1 ? '' : 's'}, ${Math.ceil(total / 9)} page${total > 9 ? 's' : ''})` : 'Make PDF';
}

function openCart(open) {
  $('cart').classList.toggle('open', open);
  $('scrim').classList.toggle('show', open);
}

async function downloadCart() {
  const btn = $('downloadButton');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  try {
    const ids = [...state.cart.keys()];
    const zip = new JSZip();
    const used = new Set();
    for (let i = 0; i < ids.length; i++) {
      btn.textContent = `Saving ${i + 1} of ${ids.length}...`;
      const card = byId.get(ids[i]);
      let name = safeName(card.fileName);
      for (let n = 2; used.has(name.toLowerCase()); n++) name = `${safeName(card.fileName)} (${n})`;
      used.add(name.toLowerCase());
      zip.file(name + '.jpg', await cardJpeg(card));
    }
    btn.textContent = 'Zipping...';
    saveBlob(await zip.generateAsync({ type: 'blob' }), `Lorcana Cards ${stamp()}.zip`);
    toast(`Saved ${ids.length} card${ids.length === 1 ? '' : 's'} to your Downloads folder`);
  } catch (err) {
    toast('Something went wrong saving the cards');
    console.error(err);
  }
  renderCart();
}

// AVIF originals become full-size JPEGs so they open in any Windows program.
async function cardJpeg(card) {
  const bitmap = await loadBitmap(card);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95));
}

async function loadBitmap(card) {
  const blob = await (await fetch(cardUrl(card.image))).blob();
  return createImageBitmap(blob);
}

function safeName(s) {
  return s.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 150) || 'card';
}

function stamp() {
  return new Date().toLocaleString('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: 'numeric', minute: '2-digit',
  }).replace(/[/:]/g, '-').replace(',', '');
}

function saveBlob(blob, name) {
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

// ---- Viewer ----

let viewerCard = null;

function openViewer(card) {
  viewerCard = card;
  $('viewerImage').src = cardUrl(card.image);
  $('viewerTitle').textContent = title(card);
  const dl = $('viewerFields');
  dl.replaceChildren();
  for (const col of state.catalog.columns) {
    const v = card.fields[col];
    if (v === undefined || v === '' || col === state.catalog.titleField) continue;
    dl.append(el('dt', { textContent: col }), el('dd', { textContent: v }));
  }
  paintViewerButton();
  $('viewer').classList.add('open');
}

function paintViewerButton() {
  const qty = qtyOf(viewerCard.id);
  $('viewerCartButton').textContent = qty ? `Add another (${qty} in cart)` : 'Add to cart';
}

function closeViewer() {
  $('viewer').classList.remove('open');
  $('viewerImage').src = '';
  viewerCard = null;
}

// ---- Misc ----

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

function debounce(fn, ms) {
  let t;
  return () => { clearTimeout(t); t = setTimeout(fn, ms); };
}

async function init() {
  state.catalog = await (await fetch('data/cards.json')).json();
  for (const card of state.catalog.cards) {
    card.haystack = normalize(Object.values(card.fields).join(' ') + ' ' + card.fileName);
    byId.set(card.id, card);
  }
  try {
    // Older carts were a plain list of ids; newer ones are [id, copies] pairs.
    for (const item of JSON.parse(localStorage.getItem(CART_KEY) || '[]')) {
      const [id, qty] = Array.isArray(item) ? item : [item, 1];
      if (byId.has(id) && qty > 0) state.cart.set(id, qty);
    }
  } catch { /* start with an empty cart */ }

  buildFilters();
  $('search').oninput = debounce(runSearch, 150);
  $('moreButton').onclick = renderMore;
  $('clearFiltersButton').onclick = () => {
    $('search').value = '';
    state.filters = {};
    document.querySelectorAll('#filters select').forEach((s) => { s.value = ''; });
    runSearch();
  };
  $('addAllButton').onclick = () => {
    state.results.forEach((c) => { if (!state.cart.has(c.id)) state.cart.set(c.id, 1); });
    cartChanged();
    toast(`Cart now has ${cartTotal()} cards`);
  };
  $('cartButton').onclick = () => openCart(true);
  $('closeCart').onclick = () => openCart(false);
  $('scrim').onclick = () => openCart(false);
  $('clearCart').onclick = () => { state.cart.clear(); cartChanged(); };
  $('downloadButton').onclick = downloadCart;
  $('closeViewer').onclick = closeViewer;
  $('viewer').onclick = (e) => { if (e.target === $('viewer')) closeViewer(); };
  $('viewerCartButton').onclick = () => setQty(viewerCard.id, qtyOf(viewerCard.id) + 1);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeViewer(); openCart(false); openDeck(false); }
  });
  initDeck();

  cartChanged();
  runSearch();
}

init();
