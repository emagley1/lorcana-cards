// "Top decks": a curated list from data/top-decks.txt, plus decks saved on this device.
// Each deck opens in the "Deck to PDF" window. Uses helpers from app.js and deck.js.

const MY_DECKS_KEY = 'lorcana-my-decks';
const INK_COLORS = { amber: '#f4b223', amethyst: '#8b4fbf', emerald: '#2fa65a', ruby: '#d1283c', sapphire: '#1f8ad6', steel: '#9aa6b2' };

const topDecks = { shared: [], mine: [] };

function parseTopDecks(text) {
  const decks = [];
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const head = line.match(/^##\s*(.+)$/);
    if (head) {
      current = { name: head[1].trim(), inks: [], source: '', note: '', lines: [] };
      decks.push(current);
      continue;
    }
    if (!current || !line || line.startsWith('#')) continue;
    const meta = line.match(/^(inks?|source|note)\s*:\s*(.*)$/i);
    if (meta) {
      const key = meta[1].toLowerCase();
      if (key.startsWith('ink')) current.inks = meta[2].split(/[,/&]|\band\b/).map((s) => s.trim()).filter(Boolean);
      else current[key] = meta[2].trim();
    } else {
      current.lines.push(line);
    }
  }
  return decks.filter((d) => d.lines.length);
}

function loadMyDecks() {
  try { topDecks.mine = JSON.parse(localStorage.getItem(MY_DECKS_KEY) || '[]'); } catch { topDecks.mine = []; }
}

function saveMyDecks() {
  try { localStorage.setItem(MY_DECKS_KEY, JSON.stringify(topDecks.mine)); } catch { toast('Could not save on this device'); }
}

function deckCards(d) {
  return parseDeck(d.lines.join('\n'));
}

function topDeckTile(d, mine) {
  const rows = deckCards(d);
  const total = rows.reduce((n, r) => n + (r.chosen ? r.qty : 0), 0);
  const missing = rows.filter((r) => !r.chosen).length;
  // Show the deck's most-played cards up front.
  const cover = [...rows].filter((r) => r.chosen).sort((a, b) => b.qty - a.qty).slice(0, 4)
    .map((r) => el('img', { alt: title(r.chosen), loading: 'lazy', src: cardUrl(r.chosen.thumb) }));
  const inks = el('div', { className: 'inks' }, ...d.inks.map((ink) => {
    const dot = el('span', { className: 'ink', title: ink });
    dot.style.background = INK_COLORS[ink.toLowerCase()] || 'var(--muted)';
    return dot;
  }));
  const info = [`${total} cards`];
  if (missing) info.push(`${missing} not found`);
  const meta = el('div', { className: 'top-deck-meta' },
    el('div', { className: 'top-deck-name' }, inks, el('span', { textContent: d.name })),
    el('div', { className: 'sub', textContent: info.join(' · ') + (d.inks.length ? ' · ' + d.inks.join(' / ') : '') }));
  if (d.note) meta.append(el('div', { className: 'sub note', textContent: d.note }));
  if (d.source) {
    meta.append(el('a', { className: 'sub', href: d.source, target: '_blank', rel: 'noopener', textContent: 'View on ' + (safeHost(d.source) || 'source site') }));
  }
  const open = el('button', { className: 'primary', textContent: 'Print this deck' });
  open.onclick = () => openTopDeck(d);
  const actions = el('div', { className: 'top-deck-actions' }, open);
  if (mine) {
    const remove = el('button', { className: 'link-button', textContent: 'Remove' });
    remove.onclick = () => {
      topDecks.mine = topDecks.mine.filter((x) => x !== d);
      saveMyDecks();
      renderTopDecks();
    };
    actions.append(remove);
  }
  return el('div', { className: 'top-deck' }, el('div', { className: 'top-deck-cover' }, ...cover), meta, actions);
}

function safeHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function renderTopDecks() {
  const list = $('topDecksList');
  const sections = [];
  if (topDecks.mine.length) sections.push(el('h3', { textContent: 'Everyone sees these' }));
  sections.push(topDecks.shared.length
    ? el('div', { className: 'top-deck-grid' }, ...topDecks.shared.map((d) => topDeckTile(d, false)))
    : el('div', { className: 'deck-empty', textContent: 'No top decks yet. Add some to data/top-decks.txt, or save one from "Deck to PDF".' }));
  if (topDecks.mine.length) {
    sections.push(el('h3', { textContent: 'Saved on this device' }));
    sections.push(el('div', { className: 'top-deck-grid' }, ...topDecks.mine.map((d) => topDeckTile(d, true))));
  }
  list.replaceChildren(...sections);
}

function openTopDeck(d) {
  $('deckText').value = d.lines.join('\n');
  $('deckName').value = d.name;
  $('deckText').oninput();
  findDeckCards();
  openTopDecks(false);
  openDeck(true);
}

function saveCurrentDeck() {
  const lines = $('deckText').value.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^(#|\/\/)/.test(l));
  if (!lines.length) return toast('Paste a deck list first');
  const name = $('deckName').value.trim() || `My deck ${topDecks.mine.length + 1}`;
  const existing = topDecks.mine.find((d) => d.name === name);
  if (existing) existing.lines = lines;
  else topDecks.mine.unshift({ name, inks: [], source: '', note: '', lines });
  saveMyDecks();
  toast(`Saved "${name}" to Top decks`);
}

function openTopDecks(open) {
  $('topDecks').classList.toggle('open', open);
  if (open) renderTopDecks();
}

async function initTopDecks() {
  loadMyDecks();
  $('topDecksButton').onclick = () => openTopDecks(true);
  $('closeTopDecks').onclick = () => openTopDecks(false);
  $('topDecks').onclick = (e) => { if (e.target === $('topDecks')) openTopDecks(false); };
  $('deckSave').onclick = saveCurrentDeck;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') openTopDecks(false); });
  try {
    const res = await fetch('data/top-decks.txt', { cache: 'no-cache' });
    if (res.ok) topDecks.shared = parseTopDecks(await res.text());
  } catch { /* no shared list */ }
}
