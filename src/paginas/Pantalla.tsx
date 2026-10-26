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

const SEGUNDOS_POR_FOTO = 7;
const CONSULTA_CADA_MS = 5000;

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
  const vistas = useRef<string[]>([]);

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

  useEffect(() => {
    if (!evento) return;
    void consultar();
    const t = setInterval(consultar, CONSULTA_CADA_MS);
    return () => clearInterval(t);
  }, [evento, consultar]);

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
        setActual(foto);
        const proxima = nuevas.current[0] ?? todas.current[Math.floor(Math.random() * todas.current.length)];
        if (proxima) new Image().src = urlPublica(proxima.key_original);
      }
    };
    siguiente();
    const t = setInterval(siguiente, SEGUNDOS_POR_FOTO * 1000);
    return () => clearInterval(t);
  }, [evento]);

  // Apenas llegan las primeras fotos, se muestra una sin esperar al próximo turno.
  useEffect(() => {
    if (!actual && total > 0) {
      const primera = nuevas.current.shift() ?? todas.current[0];
      vistas.current.push(primera.id);
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
