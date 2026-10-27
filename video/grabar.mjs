// Graba video/promo.html cuadro por cuadro y arma el MP4 vertical (1080x1920, 30 fps).
// Uso: node video/grabar.mjs   →   salida/galeria-en-vivo-promo.mp4 y salida/portada.jpg
import { chromium } from 'playwright';
import QRCode from 'qrcode';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const FPS = 30;
const DURACION = 30;

const html = await readFile(new URL('./promo.html', import.meta.url), 'utf8');
const qr = await QRCode.toDataURL('https://fotos.newtech.net.ar/demo', {
  width: 600,
  margin: 1,
  color: { dark: '#30262B', light: '#FFFFFF' },
});
const logo = 'data:image/png;base64,' + (await readFile('public/logo-newtech.png')).toString('base64');

await rm('salida', { recursive: true, force: true });
await mkdir('salida/cuadros', { recursive: true });

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1, locale: 'es-AR' });
const errores = [];
pagina.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
pagina.on('pageerror', (e) => errores.push(String(e)));
await pagina.setContent(html, { waitUntil: 'networkidle', timeout: 60000 });
await pagina.evaluate((datos) => window.preparar(datos), { qr, logo });
if (errores.length) {
  console.log('::error::' + errores.join(' | '));
  process.exit(1);
}

const total = FPS * DURACION;
for (let i = 0; i < total; i++) {
  await pagina.evaluate((t) => window.render(t), i / FPS);
  await pagina.screenshot({ path: `salida/cuadros/${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
  if (i % 150 === 0) console.log(`cuadro ${i}/${total}`);
}
await pagina.evaluate((t) => window.render(t), 28.5);
await pagina.screenshot({ path: 'salida/portada.jpg', type: 'jpeg', quality: 92 });
await navegador.close();

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error',
  '-framerate', String(FPS), '-i', 'salida/cuadros/%04d.jpg',
  '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart',
  'salida/galeria-en-vivo-promo.mp4',
], { stdio: 'inherit' });
await rm('salida/cuadros', { recursive: true, force: true });
console.log('Listo: salida/galeria-en-vivo-promo.mp4');
