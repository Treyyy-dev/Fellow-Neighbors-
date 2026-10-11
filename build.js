// Assembles public/index.html from src/page.html (markup and styles) and src/game.js (the game).
const fs = require('fs'), path = require('path');
const page = fs.readFileSync(path.join(__dirname, 'src/page.html'), 'utf8');
const game = fs.readFileSync(path.join(__dirname, 'src/game.js'), 'utf8');
const html = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<style>html,body{margin:0;height:100%;background:#05070c}[hidden]{display:none!important}</style></head><body>\n' +
  page + '\n<script>\n' + game + '\n</script>\n</body></html>\n';
fs.mkdirSync(path.join(__dirname, 'public'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'public/index.html'), html);
console.log('public/index.html', html.length, 'bytes');
