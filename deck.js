// Deck list → printable PDF. Uses the catalog and helpers from app.js.

// Page layout in millimetres, from Eric's drawing: 3×3 cards of 88 × 63 mm (cards lie on
// their side), 3 mm gaps, R3 corners, on a 300 × 225 mm page with the grid centred.
const LAYOUT = { pageW: 300, pageH: 225, cardW: 88, cardH: 63, gap: 3, radius: 3, cols: 3, rows: 3 };

// Highest first. Eric's rule: a promo beats everything except an Enchanted or Iconic printing.
const RARITY_RANK = { Iconic: 9, Enchanted: 8, Promo: 7, Epic: 6, Legendary: 5, 'Super Rare': 4, Rare: 3, Uncommon: 2, Common: 1 };

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
// `fill` shows through where the image itself is transparent (the card back has see-through corners).
async function slotImage(bitmap, fill = '#fff') {
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
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, w, h);
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

const CARD_BACK = 'data/card-back.png';

// Lays the cards out in order, 9 to a page; used by both the deck list and the cart.
// With `backs`, every page of fronts is followed by a full page of card backs for double-sided
// printing. The page is always full so it lines up whichever way the printer flips the sheet.
async function makePdf(cards, btn, { outlines, backs }, fileLabel) {
  if (!cards.length) return;
  const label = btn.textContent;
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
    const draw = (data, alias, slot) => {
      const x = left + (slot % L.cols) * (L.cardW + L.gap);
      const y = top + Math.floor(slot / L.cols) * (L.cardH + L.gap);
      doc.addImage(data, 'JPEG', x, y, L.cardW, L.cardH, alias, 'NONE');
      if (outlines) {
        doc.setDrawColor(150);
        doc.setLineWidth(0.15);
        doc.roundedRect(x, y, L.cardW, L.cardH, L.radius, L.radius, 'S');
      }
    };
    const back = backs
      ? await slotImage(await createImageBitmap(await (await fetch(CARD_BACK)).blob()), '#121214')
      : null;
    const unique = new Set(cards.map((c) => c.id)).size;
    for (let start = 0; start < cards.length; start += perPage) {
      if (start) doc.addPage([L.pageW, L.pageH], 'landscape');
      const page = cards.slice(start, start + perPage);
      for (let slot = 0; slot < page.length; slot++) {
        const card = page[slot];
        if (!images.has(card.id)) {
          btn.textContent = `Preparing ${images.size + 1} of ${unique}...`;
          images.set(card.id, await slotImage(await loadBitmap(card)));
        }
        draw(images.get(card.id), 'card' + card.id, slot);
      }
      if (back) {
        doc.addPage([L.pageW, L.pageH], 'landscape');
        for (let slot = 0; slot < perPage; slot++) draw(back, 'cardback', slot);
      }
    }
    btn.textContent = 'Saving...';
    saveBlob(doc.output('blob'), `Lorcana ${fileLabel} ${stamp()}.pdf`);
    toast(`Saved a PDF with ${cards.length} cards`);
  } catch (err) {
    toast('Something went wrong making the PDF');
    console.error(err);
  }
  btn.textContent = label;
  btn.disabled = false;
}

function makeDeckPdf() {
  const cards = deck.rows.flatMap((r) => (r.chosen ? Array(r.qty).fill(r.chosen) : []));
  return makePdf(cards, $('deckPdf'), pdfOptions(), 'Deck');
}

function makeCartPdf() {
  const cards = [...state.cart].flatMap(([id, qty]) => (byId.has(id) ? Array(qty).fill(byId.get(id)) : []));
  return makePdf(cards, $('cartPdf'), pdfOptions(), 'Cards');
}

function pdfOptions() {
  return { outlines: $('deckOutlines').checked, backs: $('deckBacks').checked };
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
  $('deckPdf').onclick = makeDeckPdf;
  $('cartPdf').onclick = makeCartPdf;
  // The PDF options show in both the deck window and the cart; keep each pair in step.
  for (const [a, b] of [['deckOutlines', 'cartOutlines'], ['deckBacks', 'cartBacks']]) {
    $(a).onchange = () => { $(b).checked = $(a).checked; };
    $(b).onchange = () => { $(a).checked = $(b).checked; };
  }
  if ($('deckText').value.trim()) findDeckCards();
  else renderDeck();
}
