// Deck list → printable PDF. Uses the catalog and helpers from app.js.

// Page layout in millimetres, from Eric's drawing: 3×3 cards of 88 × 63 mm (cards lie on
// their side), 3 mm gaps, R3 corners, on a 300 × 225 mm page with the grid centred.
const LAYOUT = { pageW: 300, pageH: 225, cardW: 88, cardH: 63, gap: 3, radius: 3, cols: 3, rows: 3 };

// Highest first. Promos sit below Common so they are only picked when nothing else exists.
const RARITY_RANK = { Iconic: 9, Enchanted: 8, Epic: 7, Legendary: 6, 'Super Rare': 5, Rare: 4, Uncommon: 3, Common: 2, Promo: 1 };

const deck = { rows: [], picks: new Map(), byKey: null, byName: null };

const deckKey = (s) => normalize(s).replace(/[^a-z0-9]/g, '');

function indexCatalog() {
  deck.byKey = new Map();
  deck.byName = new Map();
  for (const card of state.catalog.cards) {
    const { Name = '', Subname = '' } = card.fields;
    for (const [map, k] of [[deck.byKey, deckKey(Name + Subname)], [deck.byName, deckKey(Name)]]) {
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(card);
    }
  }
  const setNum = (c) => (/^\d+$/.test(c.fields['Set Code']) ? Number(c.fields['Set Code']) : 0);
  const order = (a, b) => (RARITY_RANK[b.fields.Rarity] || 0) - (RARITY_RANK[a.fields.Rarity] || 0) || setNum(b) - setNum(a);
  for (const list of deck.byKey.values()) list.sort(order);
  for (const list of deck.byName.values()) list.sort(order);
}

function parseDeck(text) {
  const rows = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^(#|\/\/)/.test(line)) continue;
    const m = line.match(/^(\d+)\s*x?\s+(.+)$/i);
    const qty = m ? Number(m[1]) : 1;
    const name = (m ? m[2] : line).trim();
    const k = deckKey(name);
    const exact = deck.byKey.get(k) || [];
    // No exact match: offer every printing with the same character name, but don't guess.
    const options = exact.length ? exact : deck.byName.get(deckKey(name.split(' - ')[0])) || [];
    const picked = deck.picks.get(k);
    const chosen = options.find((c) => c.id === picked) || (exact.length ? exact[0] : null);
    if (qty > 0) rows.push({ qty, name, key: k, options, chosen, exact: exact.length > 0 });
  }
  return rows;
}

function printingLabel(card) {
  const f = card.fields;
  return `${f.Rarity || '?'} · ${f.Set || f['Set Code'] || ''} #${f['Set Number'] || ''}`;
}

function renderDeck() {
  const list = $('deckList');
  const rows = deck.rows;
  if (!rows.length) {
    list.replaceChildren(el('div', { className: 'deck-empty', textContent: 'Paste a deck list and press "Find cards".' }));
  } else {
    list.replaceChildren(...rows.map((row) => {
      const select = el('select');
      if (!row.chosen) select.append(el('option', { value: '', textContent: row.options.length ? 'Not found. Pick one…' : 'Not found' }));
      for (const c of row.options) {
        const label = row.exact ? printingLabel(c) : `${title(c)} - ${c.fields.Subname || ''} (${printingLabel(c)})`;
        select.append(el('option', { value: c.id, textContent: label, selected: c === row.chosen }));
      }
      select.disabled = !row.options.length;
      select.onchange = () => {
        row.chosen = byId.get(select.value) || null;
        if (row.chosen) deck.picks.set(row.key, row.chosen.id);
        renderDeck();
      };
      const img = el('img', { alt: '', src: row.chosen ? cardUrl(row.chosen.thumb) : 'icon.png' });
      if (row.chosen) img.onclick = () => openViewer(row.chosen);
      const card = row.chosen;
      return el('div', { className: 'deck-row' + (card ? '' : ' missing') },
        el('span', { className: 'qty', textContent: row.qty }), img,
        el('div', { className: 'info' },
          el('div', { textContent: card ? `${title(card)}${card.fields.Subname ? ' - ' + card.fields.Subname : ''}` : row.name }),
          el('div', { className: 'sub', textContent: card ? card.fields.Set || '' : 'No card with this name and subtitle' })),
        select);
    }));
  }
  const total = rows.reduce((n, r) => n + (r.chosen ? r.qty : 0), 0);
  const missing = rows.filter((r) => !r.chosen);
  const perPage = LAYOUT.cols * LAYOUT.rows;
  const summary = $('deckSummary');
  summary.replaceChildren();
  if (rows.length) {
    summary.append(`${total} card${total === 1 ? '' : 's'} on ${Math.ceil(total / perPage)} page${Math.ceil(total / perPage) === 1 ? '' : 's'}`);
    if (missing.length) summary.append(' · ', el('span', { className: 'bad', textContent: `${missing.length} line${missing.length === 1 ? '' : 's'} not found (left out)` }));
  }
  $('deckPdf').disabled = total === 0;
}

// One card, turned on its side to fit the 88 × 63 slot, with R3 corners and white outside them.
async function slotImage(card) {
  const bitmap = await loadBitmap(card);
  const w = Math.max(bitmap.width, bitmap.height);
  const h = Math.round((w * LAYOUT.cardH) / LAYOUT.cardW);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, (LAYOUT.radius * w) / LAYOUT.cardW);
  ctx.clip();
  if (bitmap.height > bitmap.width) {
    ctx.translate(w, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(bitmap, 0, 0, h, w);
  } else {
    ctx.drawImage(bitmap, 0, 0, w, h);
  }
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', 0.92);
}

async function makePdf() {
  const btn = $('deckPdf');
  const cards = deck.rows.flatMap((r) => (r.chosen ? Array(r.qty).fill(r.chosen) : []));
  if (!cards.length) return;
  btn.disabled = true;
  try {
    const L = LAYOUT;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: [L.pageW, L.pageH], orientation: 'landscape', compress: true });
    const gridW = L.cols * L.cardW + (L.cols - 1) * L.gap;
    const gridH = L.rows * L.cardH + (L.rows - 1) * L.gap;
    const left = (L.pageW - gridW) / 2;
    const top = (L.pageH - gridH) / 2;
    const perPage = L.cols * L.rows;
    const images = new Map();
    const outlines = $('deckOutlines').checked;
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      if (!images.has(card.id)) {
        btn.textContent = `Preparing ${images.size + 1} of ${new Set(cards.map((c) => c.id)).size}...`;
        images.set(card.id, await slotImage(card));
      }
      const slot = i % perPage;
      if (i && !slot) doc.addPage([L.pageW, L.pageH], 'landscape');
      const x = left + (slot % L.cols) * (L.cardW + L.gap);
      const y = top + Math.floor(slot / L.cols) * (L.cardH + L.gap);
      doc.addImage(images.get(card.id), 'JPEG', x, y, L.cardW, L.cardH, 'card' + card.id, 'NONE');
      if (outlines) {
        doc.setDrawColor(150);
        doc.setLineWidth(0.15);
        doc.roundedRect(x, y, L.cardW, L.cardH, L.radius, L.radius, 'S');
      }
    }
    btn.textContent = 'Saving...';
    saveBlob(doc.output('blob'), `Lorcana Deck ${stamp()}.pdf`);
    toast(`Saved a PDF with ${cards.length} cards`);
  } catch (err) {
    toast('Something went wrong making the PDF');
    console.error(err);
  }
  btn.textContent = 'Make PDF';
  btn.disabled = false;
}

function findDeckCards() {
  deck.rows = parseDeck($('deckText').value);
  renderDeck();
}

function openDeck(open) {
  $('deck').classList.toggle('open', open);
  if (open) $('deckText').focus();
}

function initDeck() {
  indexCatalog();
  try { $('deckText').value = localStorage.getItem('lorcana-deck') || ''; } catch { /* no saved deck */ }
  $('deckText').oninput = debounce(() => {
    try { localStorage.setItem('lorcana-deck', $('deckText').value); } catch { /* not saved */ }
  }, 300);
  $('deckButton').onclick = () => openDeck(true);
  $('closeDeck').onclick = () => openDeck(false);
  $('deckFind').onclick = findDeckCards;
  $('deckPdf').onclick = makePdf;
  if ($('deckText').value.trim()) findDeckCards();
  else renderDeck();
}
