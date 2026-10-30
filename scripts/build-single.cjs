/* Собирает один автономный файл dist/TurnikMan.html:
   three.js + физика + контент + логика + стили внутри одного HTML.
   Такой файл открывается двойным щелчком с диска, без сервера и без интернета. */

const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const www = path.join(root, 'www');
const dist = path.join(root, 'dist');

(async () => {
  const t0 = Date.now();

  const bundle = await esbuild.build({
    entryPoints: [path.join(www, 'app.js')],
    bundle: true,
    format: 'iife',
    target: ['es2019'],
    minify: true,
    charset: 'utf8',
    legalComments: 'none',
    write: false,
  });
  const js = bundle.outputFiles[0].text;
  const css = fs.readFileSync(path.join(www, 'styles.css'), 'utf8');
  let html = fs.readFileSync(path.join(www, 'index.html'), 'utf8');

  html = html.replace('<link rel="stylesheet" href="styles.css" />', () => `<style>\n${css}\n</style>`);
  if (!html.includes('<style>')) throw new Error('не удалось встроить стили');

  html = html.replace(
    '<script type="module" src="app.js"></script>',
    () => `<script>\n${js}\n</script>`,
  );
  if (html.includes('src="app.js"')) throw new Error('не удалось встроить скрипт');

  fs.mkdirSync(dist, { recursive: true });
  const out = path.join(dist, 'TurnikMan.html');
  fs.writeFileSync(out, html);

  const kb = (n) => (n / 1024).toFixed(0) + ' КБ';
  console.log(`собран ${path.relative(root, out)}`);
  console.log(`  скрипт: ${kb(js.length)} · стили: ${kb(css.length)} · всего: ${kb(html.length)}`);
  console.log(`  время: ${Date.now() - t0} мс`);
})();
