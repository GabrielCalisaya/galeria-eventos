import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { supabase, urlPublica } from '../lib/supabase';
import { colorValido } from '../lib/colores';
import { formatearFecha, linkInvitados, separarNombres } from '../lib/formato';
import { useTriviaPantalla } from '../lib/trivia';
import type { EstiloEvento } from '../lib/tipos';
import TriviaPantalla from '../componentes/TriviaPantalla';

type EventoPantalla = { id: string; slug: string; titulo: string; fecha: string | null; estilo: EstiloEvento };
type FotoPantalla = { id: string; key_original: string; key_thumb: string; autor_nombre: string; created_at: string };

const SEGUNDOS_POR_FOTO = 4;
const CONSULTA_CADA_MS = 3000;
const RECARGA_COMPLETA_MS = 60_000; // rearma la lista entera (por ejemplo, fotos que se vuelven a mostrar)

export default function Pantalla() {
  const { token = '' } = useParams();
  const [evento, setEvento] = useState<EventoPantalla | null | undefined>(undefined);
  const [qr, setQr] = useState('');
  const [actual, setActual] = useState<FotoPantalla | null>(null);
  const [total, setTotal] = useState(0);
  const [cursorQuieto, setCursorQuieto] = useState(false);
  const trivia = useTriviaPantalla(token);

  const todas = useRef<FotoPantalla[]>([]);
  const nuevas = useRef<FotoPantalla[]>([]);
  const ultimaFecha = useRef<string | null>(null);
  const ultimaBaja = useRef('1970-01-01T00:00:00Z');
  const vistas = useRef<string[]>([]);
  const actualRef = useRef<FotoPantalla | null>(null);
  const avanzar = useRef<() => void>(() => undefined);

  // Datos del evento y QR.
  useEffect(() => {
    supabase.rpc('pantalla_evento', { p_token: token }).then(({ data }) => {
      const ev = (data as EventoPantalla[] | null)?.[0] ?? null;
      setEvento(ev);
      if (ev) {
        QRCode.toDataURL(linkInvitados(ev.slug), {
          width: 480,
          margin: 1,
          color: { dark: '#30262B', light: '#FFFFFF' },
        }).then(setQr);
      }
    });
  }, [token]);

  // Fotos: primero todas, después solo las nuevas cada pocos segundos.
  const consultar = useCallback(async () => {
    const { data, error } = await supabase.rpc('pantalla_fotos', {
      p_token: token,
      p_desde: ultimaFecha.current,
    });
    if (error || !data) return;
    const lista = data as FotoPantalla[];
    if (lista.length === 0) return;
    const conocidas = new Set(todas.current.map((f) => f.id));
    const recibidas = lista.filter((f) => !conocidas.has(f.id));
    if (ultimaFecha.current) nuevas.current.push(...[...recibidas].reverse());
    todas.current = [...recibidas, ...todas.current];
    ultimaFecha.current = lista[0].created_at;
    setTotal(todas.current.length);
    recibidas.slice(0, 3).forEach((f) => {
      const img = new Image();
      img.src = urlPublica(f.key_original);
    });
  }, [token]);

  // Fotos ocultadas o borradas: salen de la lista y, si es la que se está mostrando, se pasa a otra.
  const consultarBajas = useCallback(async () => {
    const { data, error } = await supabase.rpc('pantalla_bajas', { p_token: token, p_desde: ultimaBaja.current });
    if (error || !data || data.length === 0) return;
    const bajas = data as { media_id: string; created_at: string }[];
    ultimaBaja.current = bajas[bajas.length - 1].created_at;
    const ids = new Set(bajas.map((b) => b.media_id));
    todas.current = todas.current.filter((f) => !ids.has(f.id));
    nuevas.current = nuevas.current.filter((f) => !ids.has(f.id));
    setTotal(todas.current.length);
    if (actualRef.current && ids.has(actualRef.current.id)) {
      if (todas.current.length > 0) {
        avanzar.current();
      } else {
        actualRef.current = null;
        setActual(null);
      }
    }
  }, [token]);

  const recargarTodo = useCallback(async () => {
    const { data, error } = await supabase.rpc('pantalla_fotos', { p_token: token, p_desde: null });
    if (error || !data) return;
    const lista = data as FotoPantalla[];
    const vigentes = new Set(lista.map((f) => f.id));
    todas.current = lista;
    nuevas.current = nuevas.current.filter((f) => vigentes.has(f.id));
    if (lista[0]) ultimaFecha.current = lista[0].created_at;
    setTotal(lista.length);
  }, [token]);

  useEffect(() => {
    if (!evento) return;
    void consultar();
    void consultarBajas();
    const t = setInterval(() => {
      void consultar();
      void consultarBajas();
    }, CONSULTA_CADA_MS);
    const r = setInterval(() => void recargarTodo(), RECARGA_COMPLETA_MS);
    return () => {
      clearInterval(t);
      clearInterval(r);
    };
  }, [evento, consultar, consultarBajas, recargarTodo]);

  // Carrusel: las nuevas tienen prioridad; si no hay, una al azar evitando repetir seguido.
  useEffect(() => {
    if (!evento) return;
    const siguiente = () => {
      let foto = nuevas.current.shift();
      if (!foto && todas.current.length > 0) {
        const recientes = new Set(vistas.current.slice(-Math.min(20, Math.floor(todas.current.length / 2))));
        const candidatas = todas.current.filter((f) => !recientes.has(f.id));
        const pool = candidatas.length ? candidatas : todas.current;
        foto = pool[Math.floor(Math.random() * pool.length)];
      }
      if (foto) {
        vistas.current.push(foto.id);
        actualRef.current = foto;
        setActual(foto);
        const proxima = nuevas.current[0] ?? todas.current[Math.floor(Math.random() * todas.current.length)];
        if (proxima) new Image().src = urlPublica(proxima.key_original);
      }
    };
    let t = window.setInterval(siguiente, SEGUNDOS_POR_FOTO * 1000);
    // Avanzar a mano (por ejemplo, al borrar la foto en pantalla) reinicia el turno.
    avanzar.current = () => {
      clearInterval(t);
      siguiente();
      t = window.setInterval(siguiente, SEGUNDOS_POR_FOTO * 1000);
    };
    siguiente();
    return () => clearInterval(t);
  }, [evento]);

  // Apenas llegan las primeras fotos, se muestra una sin esperar al próximo turno.
  useEffect(() => {
    if (!actual && total > 0) {
      const primera = nuevas.current.shift() ?? todas.current[0];
      vistas.current.push(primera.id);
      actualRef.current = primera;
      setActual(primera);
    }
  }, [total, actual]);

  // Esconde el cursor y el botón cuando no se mueve el mouse.
  useEffect(() => {
    let t: number;
    const mover = () => {
      setCursorQuieto(false);
      clearTimeout(t);
      t = window.setTimeout(() => setCursorQuieto(true), 3000);
    };
    mover();
    window.addEventListener('mousemove', mover);
    return () => {
      window.removeEventListener('mousemove', mover);
      clearTimeout(t);
    };
  }, []);

  if (evento === undefined) return <div className="pantalla" aria-busy="true" />;
  if (evento === null) {
    return (
      <main className="pantalla pantalla-mensaje">
        <h1>Esta pantalla no está disponible</h1>
        <p>Revisá el link en el panel del evento.</p>
      </main>
    );
  }

  const tema = { '--acento': colorValido(evento.estilo?.color) } as CSSProperties;
  const nombres = separarNombres(evento.titulo);
  const enTrivia = trivia && trivia.fase !== 'espera';

  return (
    <main className={cursorQuieto ? 'pantalla sin-cursor' : 'pantalla'} style={tema}>
      {enTrivia ? (
        <TriviaPantalla estado={trivia} titulo={evento.titulo} />
      ) : actual ? (
        <div className="pantalla-escena" key={actual.id}>
          <div className="pantalla-fondo" style={{ backgroundImage: `url(${urlPublica(actual.key_thumb)})` }} aria-hidden="true" />
          <img className="pantalla-foto" src={urlPublica(actual.key_original)} alt={`Foto de ${actual.autor_nombre}`} />
          <p className="pantalla-autor">
            <span>Foto de</span> {actual.autor_nombre}
          </p>
        </div>
      ) : (
        <div className="pantalla-bienvenida">
          <p className="etiqueta-clara">✦ La galería está abierta ✦</p>
          <h1 className="pantalla-titulo">
            {nombres ? (
              <>
                {nombres[0]} <em>&amp;</em> {nombres[1]}
              </>
            ) : (
              evento.titulo
            )}
          </h1>
          {evento.fecha && <p className="pantalla-fecha">{formatearFecha(evento.fecha)}</p>}
          <p className="pantalla-invitacion">Escaneá el código y subí la primera foto de la noche.</p>
        </div>
      )}

      {!enTrivia && (
        <aside className="pantalla-qr">
          {qr && <img src={qr} alt="" />}
          <div>
            <strong>Compartí tus fotos</strong>
            <span>Escaneá con la cámara del celular</span>
            {total > 0 && <span className="pantalla-contador">{total} fotos compartidas</span>}
          </div>
        </aside>
      )}

      <button
        type="button"
        className="pantalla-completa"
        onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}
      >
        Pantalla completa
      </button>
    </main>
  );
}
