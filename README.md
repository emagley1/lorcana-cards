# Lorcana Card Finder (web)

Static site: open index.html from any web server. No build step.

- data/cards.json: card list (same as the desktop app's app-data/cards.json)
- data/images/: 3,469 AVIF card images (~208 MB).
  To rebuild them, get them from the desktop installer: `7z x Lorcana-Card-Finder-Setup.exe`, then
  `7z x '$PLUGINSDIR/app-64.7z' 'resources/app-data/*'` and copy resources/app-data/images to data/images.
  (Or rerun lorcana-app/tools/prepare-data.js on the source zip.)
- vendor/: jsPDF 2.5.2 and JSZip 3.10.1, copied from npm.
- deck.js: "Deck to PDF". Paste a list like `4 Flash - Efficient Clerk`; each line picks the
  highest-rarity printing (Iconic > Enchanted > Epic > Legendary > Super Rare > Rare > Uncommon > Common > Promo;
  ties go to the newest set). PDF is 300 x 225 mm, 3x3 cards of 88 x 63 mm turned sideways, 3 mm gaps, R3 corners, grid centred.
- Cart downloads a zip of full-size JPEGs.

Local test: `cd lorcana-web && python3 -m http.server` then open http://localhost:8000.
