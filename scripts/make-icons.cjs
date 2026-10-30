/* Иконки приложения из логотипа.
   Требует dev-пакет: npm i --no-save @napi-rs/canvas
   Запуск: node scripts/make-icons.cjs   (иконки коммитятся в репозиторий) */
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const ROOT = path.join(__dirname, '..');
const LOGO = path.join(ROOT, 'www', 'assets', 'logo.png');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
const WWW = path.join(ROOT, 'www', 'assets');

const NAVY = '#071820';

function roundedClip(ctx, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(w, 0, w, h, r);
  ctx.arcTo(w, h, 0, h, r);
  ctx.arcTo(0, h, 0, 0, r);
  ctx.arcTo(0, 0, w, 0, r);
  ctx.closePath();
}

async function makeLogoIcon(logo, size, opts = {}) {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (opts.round) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
  } else if (opts.rounded) {
    ctx.save();
    roundedClip(ctx, size, size, size * 0.22);
    ctx.clip();
  }

  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(logo, 0, 0, size, size);
  if (opts.round || opts.rounded) ctx.restore();
  return c;
}

async function makeForeground(logo, size) {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  const inner = size * 0.62;                 // безопасная зона адаптивной иконки
  const off = (size - inner) / 2;
  ctx.save();
  roundedClip(ctx, inner, inner, inner * 0.2);
  ctx.clip();
  ctx.drawImage(logo, off, off, inner, inner);
  ctx.restore();
  return c;
}

async function makeSplash(logo, w, h) {
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0a2430');
  g.addColorStop(1, '#061219');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const s = Math.min(w * 0.62, h * 0.42);
  ctx.save();
  roundedClip(ctx, s, s, s * 0.18);
  ctx.clip();
  ctx.drawImage(logo, (w - s) / 2, (h - s) / 2, s, s);
  ctx.restore();
  return c;
}

(async () => {
  if (!fs.existsSync(LOGO)) throw new Error('нет файла ' + LOGO);
  const logo = await loadImage(LOGO);

  const mipmaps = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  for (const [dpi, size] of Object.entries(mipmaps)) {
    const dir = path.join(RES, `mipmap-${dpi}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'ic_launcher.png'), (await makeLogoIcon(logo, size, { rounded: true })).toBuffer('image/png'));
    fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), (await makeLogoIcon(logo, size, { round: true })).toBuffer('image/png'));
    const fgSize = Math.round(size * 2.25);
    fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), (await makeForeground(logo, fgSize)).toBuffer('image/png'));
    console.log(`  mipmap-${dpi}: ${size}px + foreground ${fgSize}px`);
  }

  // экран запуска (портрет и ландшафт)
  const splashDirs = fs.readdirSync(RES).filter((d) => d.startsWith('drawable'));
  for (const d of splashDirs) {
    const dir = path.join(RES, d);
    const land = d.includes('land');
    const scale = d.includes('xxxhdpi') ? 4 : d.includes('xxhdpi') ? 3 : d.includes('xhdpi') ? 2 : d.includes('hdpi') ? 1.5 : 1;
    const w = Math.round((land ? 1280 : 720) * scale * 0.5);
    const h = Math.round((land ? 720 : 1280) * scale * 0.5);
    const img = await makeSplash(logo, Math.max(320, w), Math.max(320, h));
    fs.writeFileSync(path.join(dir, 'splash.png'), img.toBuffer('image/png'));
  }
  console.log('  splash.png обновлён во всех папках drawable-*');

  // веб-иконки
  fs.mkdirSync(WWW, { recursive: true });
  for (const size of [192, 512]) {
    const c = await makeLogoIcon(logo, size, { rounded: true });
    fs.writeFileSync(path.join(WWW, `icon-${size}.png`), c.toBuffer('image/png'));
  }
  console.log('  www/assets/icon-192.png, icon-512.png');
})();
