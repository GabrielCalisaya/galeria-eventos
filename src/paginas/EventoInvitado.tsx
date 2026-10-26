import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useFotos } from '../lib/fotos';
import { useSubidas } from '../lib/subida';
import { useTrivia } from '../lib/trivia';
import { formatearFecha, separarNombres } from '../lib/formato';
import { colorValido } from '../lib/colores';
import { FRASE_TIPO, momentoDe, type EventoPublico } from '../lib/tipos';
import Galeria from '../componentes/Galeria';
import ProgresoSubida from '../componentes/ProgresoSubida';
import TriviaInvitado from '../componentes/TriviaInvitado';
import { PieNewTech } from '../componentes/Marca';

type Estado =
  | { tipo: 'cargando' }
  | { tipo: 'no-encontrado' }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'listo'; evento: EventoPublico };

const CLAVE_NOMBRE = 'galeria:nombre';

export default function EventoInvitado() {
  const { slug = '' } = useParams();
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' });

  const cargar = useCallback(async () => {
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) {
        setEstado({ tipo: 'error', mensaje: 'No pudimos abrir la galería. Revisá la conexión y recargá la página.' });
        return;
      }
    }
    const { data, error } = await supabase.rpc('evento_publico', { p_slug: slug });
    if (error) {
      setEstado({ tipo: 'error', mensaje: 'No pudimos abrir la galería. Revisá la conexión y recargá la página.' });
      return;
    }
    const evento = (data as EventoPublico[] | null)?.[0];
    setEstado(evento ? { tipo: 'listo', evento } : { tipo: 'no-encontrado' });
  }, [slug]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Si el anfitrión cambia el estilo (tarde/noche, color, bienvenida), se aplica sin recargar.
  const listo = estado.tipo === 'listo';
  useEffect(() => {
    if (!listo) return;
    const t = setInterval(async () => {
      const { data } = await supabase.rpc('evento_publico', { p_slug: slug });
      const nuevo = (data as EventoPublico[] | null)?.[0];
      if (!nuevo) return;
      setEstado((prev) =>
        prev.tipo === 'listo' && JSON.stringify(prev.evento) !== JSON.stringify(nuevo) ? { tipo: 'listo', evento: nuevo } : prev,
      );
    }, 45_000);
    return () => clearInterval(t);
  }, [listo, slug]);

  if (estado.tipo === 'cargando') return <div className="invitado cargando-invitado" aria-busy="true" />;

  if (estado.tipo !== 'listo') {
    return (
      <main className="invitado">
        <div className="mensaje-invitado">
          <p className="ornamento" aria-hidden="true">♡</p>
          <h1>{estado.tipo === 'no-encontrado' ? 'Esta galería no está disponible' : 'Algo falló'}</h1>
          <p>
            {estado.tipo === 'no-encontrado'
              ? 'Revisá que hayas escaneado el QR correcto, o pedile el link a los anfitriones.'
              : estado.mensaje}
          </p>
        </div>
      </main>
    );
  }

  const ev = estado.evento;
  const tema = { '--acento': colorValido(ev.estilo?.color) } as CSSProperties;

  return (
    <main className={`invitado ${momentoDe(ev.estilo)}`} style={tema}>
      {ev.invitado_id ? <GaleriaInvitado evento={ev} /> : <PedirNombre slug={slug} evento={ev} onListo={cargar} />}
      <PieNewTech oscuro={momentoDe(ev.estilo) === 'noche'} />
    </main>
  );
}

function Portada({ evento, compacta = false }: { evento: EventoPublico; compacta?: boolean }) {
  const nombres = separarNombres(evento.titulo);
  return (
    <header className={compacta ? 'portada compacta' : 'portada'}>
      <div className="portada-tarjeta">
        <span className="portada-anillos" aria-hidden="true" />
        {!compacta && (
          <span className="portada-sello" aria-hidden="true">
            ♡
          </span>
        )}
        <p className="portada-frase">{FRASE_TIPO[evento.tipo] ?? 'Celebramos'}</p>
        <h1 className="portada-nombres">
          {nombres ? (
            <>
              <span>{nombres[0]}</span>
              <span className="portada-y">&amp; {nombres[1]}</span>
            </>
          ) : (
            evento.titulo
          )}
        </h1>
        {evento.fecha && <p className="portada-fecha">{formatearFecha(evento.fecha)}</p>}
        {!compacta && evento.estilo?.bienvenida && <p className="portada-bienvenida">{evento.estilo.bienvenida}</p>}
      </div>
    </header>
  );
}

function PedirNombre({ slug, evento, onListo }: { slug: string; evento: EventoPublico; onListo: () => void }) {
  const [nombre, setNombre] = useState(() => localStorageSeguro(CLAVE_NOMBRE) ?? '');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  if (evento.estado !== 'activo') {
    return (
      <>
        <Portada evento={evento} />
        <div className="mensaje-invitado corto">
          <p>Este evento ya no recibe fotos nuevas.</p>
        </div>
      </>
    );
  }

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError('');
    const limpio = nombre.trim();
    const { error } = await supabase.rpc('unirse_evento', { p_slug: slug, p_nombre: limpio });
    if (error) {
      setError('No pudimos entrar a la galería. Probá de nuevo.');
      setEnviando(false);
      return;
    }
    guardarLocal(CLAVE_NOMBRE, limpio);
    onListo();
  }

  return (
    <>
      <Portada evento={evento} />
      <form className="nombre-form" onSubmit={entrar}>
        <p className="etiqueta centrada">✦ Galería compartida ✦</p>
        <h2 className="nombre-titulo">Sumá tus fotos de la noche</h2>
        <label htmlFor="nombre" className="nombre-label">
          ¿Cómo te llamás?
        </label>
        <input
          id="nombre"
          required
          maxLength={60}
          autoComplete="given-name"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Tu nombre"
        />
        <p className="nombre-ayuda">Así los anfitriones saben quién sacó cada foto. No hace falta descargar nada.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="boton-principal" disabled={enviando || !nombre.trim()}>
          {enviando ? 'Entrando…' : 'Entrar a la galería'}
        </button>
      </form>
    </>
  );
}

function GaleriaInvitado({ evento }: { evento: EventoPublico }) {
  const { fotos, cargando, hayMas, verMas } = useFotos(evento.id);
  const { items, agregar, reintentar, limpiarListas } = useSubidas(evento.id);
  const { estado: trivia, refrescar } = useTrivia(evento.id);
  const [triviaMinimizada, setTriviaMinimizada] = useState(false);
  const selector = useRef<HTMLInputElement>(null);
  const abierto = evento.estado === 'activo';

  const triviaActiva = Boolean(trivia && trivia.fase !== 'espera');
  const preguntaActual = trivia?.pregunta?.id ?? trivia?.fase;

  // Cada pregunta nueva vuelve a abrir la trivia aunque la hayan minimizado.
  useEffect(() => {
    setTriviaMinimizada(false);
  }, [preguntaActual]);

  return (
    <>
      <Portada evento={evento} compacta={fotos.length > 0} />

      {triviaActiva && triviaMinimizada && (
        <button type="button" className="aviso-trivia" onClick={() => setTriviaMinimizada(false)}>
          ♡ La trivia está en juego · Volver
        </button>
      )}

      {items.length > 0 && <ProgresoSubida items={items} onReintentar={reintentar} onCerrar={limpiarListas} />}

      <section className="galeria-invitado" aria-label="Galería">
        {fotos.length > 0 && (
          <p className="galeria-cuenta">
            {fotos.length}
            {hayMas ? '+' : ''} {fotos.length === 1 ? 'foto compartida' : 'fotos compartidas'}
          </p>
        )}
        {cargando && <div className="cargando-invitado corto" aria-busy="true" />}
        {!cargando && fotos.length === 0 && (
          <div className="vacio-invitado">
            <p className="ornamento" aria-hidden="true">✦</p>
            <p>{abierto ? 'Todavía no hay fotos. ¡Subí la primera de la noche!' : 'Este evento no tiene fotos.'}</p>
          </div>
        )}
        <Galeria fotos={fotos} />
        {hayMas && (
          <button type="button" className="boton-secundario ver-mas" onClick={verMas}>
            Ver más fotos
          </button>
        )}
      </section>

      {abierto && (
        <div className="barra-inferior">
          <input
            ref={selector}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) agregar(e.target.files);
              e.target.value = '';
            }}
          />
          <button type="button" className="boton-principal" onClick={() => selector.current?.click()}>
            <span aria-hidden="true">＋</span> Subir fotos
          </button>
        </div>
      )}

      {triviaActiva && !triviaMinimizada && trivia && (
        <TriviaInvitado
          eventId={evento.id}
          estado={trivia}
          onRefrescar={refrescar}
          onMinimizar={() => setTriviaMinimizada(true)}
        />
      )}
    </>
  );
}

function localStorageSeguro(clave: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}

function guardarLocal(clave: string, valor: string) {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    /* modo privado: no pasa nada */
  }
}
