// Capturas de TODAS las páginas (también las que necesitan datos) con respuestas simuladas de Supabase.
// No toca la base real: cada pedido a Supabase lo contesta este script.
// Uso: VITE_SUPABASE_URL=... node scripts/capturas-simuladas.mjs  (con dist/ ya compilado)
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const RAIZ = 'dist';
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };
const servidor = createServer(async (req, res) => {
  const ruta = decodeURIComponent((req.url ?? '/').split('?')[0]);
  try {
    if (ruta.endsWith('/') || !extname(ruta)) throw new Error('spa');
    const datos = await readFile(join(RAIZ, ruta));
    res.writeHead(200, { 'Content-Type': TIPOS[extname(ruta)] ?? 'application/octet-stream' });
    res.end(datos);
  } catch {
    res.writeHead(200, { 'Content-Type': TIPOS['.html'] });
    res.end(await readFile(join(RAIZ, 'index.html')));
  }
});
await new Promise((r) => servidor.listen(4173, r));

const SUPA = new URL(process.env.VITE_SUPABASE_URL || 'http://localhost');
const REF = SUPA.hostname.split('.')[0];

// ───────── Datos de ejemplo ─────────
const EV = '11111111-1111-1111-1111-111111111111';
const evento = {
  id: EV, owner_id: 'host', slug: 'gabrielyana2026', titulo: 'Gabriel y Ana', fecha: '2026-11-07', tipo: 'casamiento',
  estilo: { momento: 'tarde', color: '#c9786d', segundos: 3 }, pack: 'completo', estado: 'activo', limite_fotos: 1500,
  vence_album: '2027-11-07', pantalla_token: 'tokenpantalla', created_at: '2026-10-01T12:00:00Z',
};
const FOTOS = ['photo-1519741497674-611481863552', 'photo-1482575832494-771f74bf6857', 'photo-1524777313293-86d2ab467344', 'photo-1550155891-1ab2d265d9c3', 'photo-1508407576665-2d9a5d638a7e', 'photo-1568673818056-c70e27d25691', 'photo-1550155864-3033f844da36', 'photo-1494850643436-d92fdab36326'];
const AUTORES = ['María Fernanda Gutiérrez', 'Pablo', 'Lucía Mamani', 'Tío Roberto', 'Abuela Rosa', 'Caro', 'Nico', 'Juli'];
const media = FOTOS.map((f, i) => ({
  id: `m${i}`, event_id: EV, guest_id: null, user_id: 'u', autor_nombre: AUTORES[i], tipo: 'foto',
  key_original: `sim-foto-${f}-1600`, key_thumb: `sim-foto-${f}-480`, ancho: 1200, alto: 1600, bytes: 1, estado: 'lista',
  oculta: i === 5, created_at: new Date(Date.now() - i * 60000).toISOString(),
}));
const preguntas = [
  ['¿Dónde se conocieron?', ['En la facultad', 'En el trabajo', 'Por amigos', 'En una app'], 2],
  ['¿Quién va a abrir la pista de baile con más ganas?', ['Gabriel', 'Ana', 'Los dos', 'Ninguno, los van a tener que empujar'], 1],
  ['¿Quién dijo "te amo" primero?', ['Gabriel', 'Ana'], 0],
].map(([texto, opciones, correcta], i) => ({ id: `p${i}`, event_id: EV, orden: i + 1, texto, opciones, correcta, created_at: '2026-11-01T00:00:00Z' }));
const nombres = ['Pablo Gómez', 'Lucía Fernández', 'Lucía Mamani', 'Martín Quispe', 'Valeria Cruz', 'Ana Torres', 'María Fernanda Gutiérrez Vargas', 'Pablo Ríos', 'María Flores', 'Ana Rodríguez'];
const ranking = nombres.map((nombre, i) => ({ nombre, puntos: 4200 - i * 61 }));
const aciertos = nombres.slice(0, 9).map((nombre, i) => ({ nombre, ms: 1800 + i * 900, puntos: 950 - i * 22 }));

function trivia(fase) {
  if (fase === 'espera') return { fase: 'espera', ahora: new Date().toISOString(), jugadores: 0 };
  const base = { numero: 2, total: 3, duracion: 20, inicio: new Date().toISOString(), ahora: new Date().toISOString(), respuestas: 47, jugadores: 74 };
  const p = { id: 'p1', texto: preguntas[1].texto, opciones: preguntas[1].opciones };
  if (fase === 'pregunta') return { ...base, fase, pregunta: p, mi_respuesta: null };
  if (fase === 'resultado') return { ...base, fase, pregunta: p, correcta: 1, conteos: [12, 25, 8, 2], aciertos, ranking, mi_respuesta: { opcion: 1, puntos: 912 }, yo: { puntos: 2700, posicion: 4 } };
  return { ...base, fase: 'fin', numero: 3, ranking, yo: { puntos: 4078, posicion: 3 } };
}

function jwt(sub, anon) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub, role: 'authenticated', aud: 'authenticated', is_anonymous: anon, exp: 4102444800 })}.firma`;
}
function sesion(anon) {
  const sub = anon ? 'invitado' : 'host';
  return {
    access_token: jwt(sub, anon), token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r',
    user: { id: sub, aud: 'authenticated', role: 'authenticated', email: anon ? '' : 'gabriel@ejemplo.com', is_anonymous: anon, app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  };
}

// ───────── Escenarios ─────────
// quien: null (sin sesión), 'invitado' o 'host'. trivia: fase. unido: el invitado ya puso su nombre.
const ESC = [
  { n: 'inicio', ruta: '/' },
  { n: 'demo', ruta: '/demo' },
  { n: 'demo-pantalla', ruta: '/demo/pantalla' },
  { n: 'entrar', ruta: '/entrar' },
  { n: 'contratar', ruta: '/contratar' },
  { n: 'terminos', ruta: '/terminos' },
  { n: 'invitado-nombre', ruta: '/e/gabrielyana2026', quien: 'invitado', unido: false },
  { n: 'invitado-galeria', ruta: '/e/gabrielyana2026', quien: 'invitado', unido: true },
  { n: 'invitado-galeria-noche', ruta: '/e/gabrielyana2026', quien: 'invitado', unido: true, noche: true },
  { n: 'invitado-trivia-pregunta', ruta: '/e/gabrielyana2026', quien: 'invitado', unido: true, trivia: 'pregunta' },
  { n: 'invitado-trivia-resultado', ruta: '/e/gabrielyana2026', quien: 'invitado', unido: true, trivia: 'resultado' },
  { n: 'invitado-trivia-fin', ruta: '/e/gabrielyana2026', quien: 'invitado', unido: true, trivia: 'fin' },
  { n: 'pantalla-bienvenida', ruta: '/pantalla/tokenpantalla', sinFotos: true, pantalla: true },
  { n: 'pantalla-fotos', ruta: '/pantalla/tokenpantalla', pantalla: true },
  { n: 'pantalla-trivia-pregunta', ruta: '/pantalla/tokenpantalla', trivia: 'pregunta', pantalla: true },
  { n: 'pantalla-trivia-resultado', ruta: '/pantalla/tokenpantalla', trivia: 'resultado', pantalla: true },
  { n: 'pantalla-trivia-fin', ruta: '/pantalla/tokenpantalla', trivia: 'fin', pantalla: true },
  { n: 'panel-eventos', ruta: '/panel', quien: 'host' },
  { n: 'panel-evento', ruta: `/panel/${EV}`, quien: 'host' },
  { n: 'panel-trivia', ruta: `/panel/${EV}/trivia`, quien: 'host' },
  { n: 'panel-trivia-envivo', ruta: `/panel/${EV}/trivia`, quien: 'host', trivia: 'pregunta' },
  { n: 'panel-trivia-resultado', ruta: `/panel/${EV}/trivia`, quien: 'host', trivia: 'resultado' },
  { n: 'panel-trivia-fin', ruta: `/panel/${EV}/trivia`, quien: 'host', trivia: 'fin' },
  { n: 'panel-tarjetas', ruta: `/panel/${EV}/tarjetas`, quien: 'host' },
];
const VISTAS = [
  ['cel-chico', { width: 360, height: 740, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ['cel', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ['cel-horizontal', { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ['tablet', { width: 768, height: 1024, deviceScaleFactor: 1, isMobile: true, hasTouch: true }],
  ['compu', { width: 1366, height: 768, deviceScaleFactor: 1 }],
  ['tv', { width: 1920, height: 1080, deviceScaleFactor: 1 }],
];

function respuesta(esc, url, req) {
  const p = url.pathname;
  const obj = (req.headers()['accept'] ?? '').includes('pgrst.object');
  const lista = (arr) => (obj ? arr[0] ?? null : arr);
  const ev = esc.noche ? { ...evento, estilo: { ...evento.estilo, momento: 'noche' } } : evento;
  if (p.startsWith('/auth/v1/signup')) return sesion(true);
  if (p.startsWith('/auth/v1/user')) return sesion(esc.quien !== 'host').user;
  if (p.startsWith('/auth/v1/')) return {};
  if (p.startsWith('/functions/v1/')) return { admin: false };
  if (p.startsWith('/rest/v1/rpc/')) {
    const f = p.split('/').pop();
    if (f === 'evento_publico') return [{ id: EV, titulo: ev.titulo, fecha: ev.fecha, tipo: ev.tipo, estilo: ev.estilo, estado: 'activo', invitado_id: esc.unido ? 'g1' : null, invitado_nombre: esc.unido ? 'Tía Marta' : null }];
    if (f === 'pantalla_evento') return [{ id: EV, slug: ev.slug, titulo: ev.titulo, fecha: ev.fecha, estilo: ev.estilo }];
    if (f === 'pantalla_fotos') return esc.sinFotos ? [] : media.filter((m) => !m.oculta);
    if (f === 'pantalla_bajas') return [];
    if (f === 'trivia_actual' || f === 'trivia_pantalla') return trivia(esc.trivia ?? 'espera');
    return null;
  }
  if (p.startsWith('/rest/v1/')) {
    const t = p.split('/').pop();
    if (t === 'events') return lista([ev]);
    if (t === 'media') return lista(esc.ruta.startsWith('/panel') ? media : media.filter((m) => !m.oculta));
    if (t === 'trivia_preguntas') return lista(preguntas);
    if (t === 'compras') return lista([{ id: 'c1', titulo_evento: 'Gabriel y Ana', estado: 'pagada', total: 85000, moneda: 'ARS', event_id: EV, invitation_tier: 'estandar', datos_completos: true, created_at: '2026-10-01T12:00:00Z' }]);
    if (t === 'precios_pack') return lista([
      { pack: 'basico', nombre: 'Básico', descripcion: 'Galería con QR', precio: 30000, moneda: 'ARS', limite_fotos: 500, meses_album: 3, orden: 1 },
      { pack: 'experiencia', nombre: 'Experiencia', descripcion: 'Pantalla y trivia', precio: 55000, moneda: 'ARS', limite_fotos: 1000, meses_album: 6, orden: 2 },
      { pack: 'completo', nombre: 'Completo', descripcion: 'Todo incluido', precio: 85000, moneda: 'ARS', limite_fotos: 1500, meses_album: 12, orden: 3 },
    ]);
    return lista([]);
  }
  return null;
}

await mkdir('capturas', { recursive: true });
const navegador = await chromium.launch();
const informe = [];
for (const [nombreVista, vista] of VISTAS) {
  for (const esc of ESC) {
    // La TV solo tiene sentido para la pantalla del salón y la portada.
    if (nombreVista === 'tv' && !esc.pantalla) continue;
    const contexto = await navegador.newContext({ ...vista, viewport: { width: vista.width, height: vista.height }, locale: 'es-AR' });
    if (esc.quien) {
      const valor = JSON.stringify(sesion(esc.quien !== 'host'));
      await contexto.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, valor]);
    }
    await contexto.route('**/*', async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (url.pathname.includes('sim-foto-')) {
        const [, id, w] = url.pathname.match(/sim-foto-(photo-[\w-]+)-(\d+)$/) ?? [];
        try {
          return await route.fulfill({ response: await route.fetch({ url: `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=60` }) });
        } catch {
          return route.abort().catch(() => {});
        }
      }
      if (url.host === SUPA.host) {
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
        const cuerpo = respuesta(esc, url, req);
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(cuerpo) });
      }
      return route.continue();
    });
    const pagina = await contexto.newPage();
    const errores = [];
    pagina.on('pageerror', (e) => errores.push(String(e)));
    await pagina.goto(`http://localhost:4173${esc.ruta}`, { waitUntil: 'load', timeout: 45000 }).catch((e) => errores.push(String(e)));
    await pagina.waitForTimeout(esc.pantalla ? 3500 : 2000);
    // Qué elementos se salen por los costados (causa típica de "no es responsive").
    const desbordes = await pagina.evaluate(() => {
      const W = document.documentElement.clientWidth;
      const fuera = [];
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right > W + 1 || r.left < -1) {
          const st = getComputedStyle(el);
          if (st.position === 'fixed' && st.visibility === 'hidden') continue;
          fuera.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} (${Math.round(r.left)}→${Math.round(r.right)})`);
        }
      }
      return { scrollWidth: document.documentElement.scrollWidth, fuera: [...new Set(fuera)].slice(0, 8) };
    });
    await pagina.screenshot({ path: `capturas/${esc.n}--${nombreVista}.jpg`, fullPage: !esc.pantalla, type: 'jpeg', quality: 65 });
    informe.push({ pagina: esc.n, vista: nombreVista, ancho: vista.width, ...desbordes, errores: errores.slice(0, 3) });
    await contexto.unrouteAll({ behavior: 'ignoreErrors' });
    await contexto.close();
  }
}
await navegador.close();
servidor.close();
await writeFile('capturas/informe.json', JSON.stringify(informe, null, 2));
for (const i of informe) if (i.fuera.length || i.errores.length || i.scrollWidth > i.ancho) console.log(JSON.stringify(i));
