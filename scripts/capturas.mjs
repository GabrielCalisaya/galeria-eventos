// Sirve la web compilada (dist/) y saca capturas de página completa en celular y compu.
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const RAIZ = 'dist';
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const servidor = createServer(async (req, res) => {
  const ruta = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let archivo = join(RAIZ, ruta);
  try {
    if (ruta.endsWith('/') || !extname(ruta)) throw new Error('spa');
    const datos = await readFile(archivo);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo)] ?? 'application/octet-stream' });
    res.end(datos);
  } catch {
    archivo = join(RAIZ, 'index.html');
    res.writeHead(200, { 'Content-Type': TIPOS['.html'] });
    res.end(await readFile(archivo));
  }
});
await new Promise((r) => servidor.listen(4173, r));

const PAGINAS = [
  ['inicio', '/'],
  ['demo', '/demo'],
  ['demo-pantalla', '/demo/pantalla'],
  ['entrar', '/entrar'],
  ['terminos', '/terminos'],
  ['devoluciones', '/devoluciones'],
  ['arrepentimiento', '/arrepentimiento'],
];
const VISTAS = [
  ['celular', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ['compu', { width: 1440, height: 900, deviceScaleFactor: 1 }],
];

await mkdir('capturas', { recursive: true });
const navegador = await chromium.launch();
const informe = [];
for (const [nombreVista, vista] of VISTAS) {
  const contexto = await navegador.newContext({ viewport: { width: vista.width, height: vista.height }, ...vista, locale: 'es-AR' });
  for (const [nombre, ruta] of PAGINAS) {
    const pagina = await contexto.newPage();
    const errores = [];
    pagina.on('pageerror', (e) => errores.push(String(e)));
    pagina.on('console', (m) => m.type() === 'error' && errores.push(m.text()));
    await pagina.goto(`http://localhost:4173${ruta}`, { waitUntil: 'networkidle', timeout: 45000 }).catch((e) => errores.push(String(e)));
    await pagina.waitForTimeout(ruta.includes('pantalla') ? 2500 : 1200);
    const ancho = await pagina.evaluate(() => document.documentElement.scrollWidth);
    await pagina.screenshot({
      path: `capturas/${nombre}-${nombreVista}.jpg`,
      fullPage: !ruta.includes('pantalla'),
      type: 'jpeg',
      quality: 72,
    });
    informe.push({ pagina: nombre, vista: nombreVista, desbordeHorizontal: ancho > vista.width, errores });
    await pagina.close();
  }
  await contexto.close();
}
await navegador.close();
servidor.close();
await writeFile('capturas/informe.json', JSON.stringify(informe, null, 2));
console.log(JSON.stringify(informe, null, 2));
