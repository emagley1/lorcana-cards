// Purely decorative: a burst of sparkles when a card goes into the cart.

function sparkle(x, y) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const glyphs = ['✦', '✧', '⋆', '✶'];
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI * 2 * i) / 10 + Math.random() * 0.5;
    const dist = 30 + Math.random() * 40;
    const s = el('span', { className: 'spark', textContent: glyphs[i % glyphs.length] });
    s.style.left = x + 'px';
    s.style.top = y + 'px';
    s.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
    s.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
    s.style.fontSize = 10 + Math.random() * 10 + 'px';
    document.body.append(s);
    setTimeout(() => s.remove(), 900);
  }
}

let lastCartSize = null;
new MutationObserver(() => {
  const size = Number($('cartCount').textContent);
  if (lastCartSize !== null && size > lastCartSize) {
    const badge = $('cartCount');
    badge.classList.remove('pop');
    void badge.offsetWidth;
    badge.classList.add('pop');
  }
  lastCartSize = size;
}).observe($('cartCount'), { childList: true, characterData: true, subtree: true });

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.card .add, #viewerCartButton');
  if (!btn) return;
  // The click handler in app.js has already toggled the cart by the time this runs.
  const card = btn.closest('.card');
  const added = card ? card.classList.contains('in-cart') : state.cart.has(viewerCard?.id);
  if (added) sparkle(e.clientX || btn.getBoundingClientRect().left + btn.offsetWidth / 2,
    e.clientY || btn.getBoundingClientRect().top + btn.offsetHeight / 2);
});
