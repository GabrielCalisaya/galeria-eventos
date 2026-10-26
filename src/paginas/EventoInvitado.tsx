import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useFotos } from '../lib/fotos';
import { useSubidas } from '../lib/subida';
import { formatearFecha } from '../lib/formato';
import { colorValido } from '../lib/colores';
import type { EventoPublico } from '../lib/tipos';
import Galeria from '../componentes/Galeria';
import ProgresoSubida from '../componentes/ProgresoSubida';

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

  if (estado.tipo === 'cargando') return <div className="noche cargando-noche" aria-busy="true" />;

  if (estado.tipo !== 'listo') {
    return (
      <main className="noche">
        <div className="mensaje-noche">
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
    <main className="noche" style={tema}>
      {ev.invitado_id ? (
        <GaleriaInvitado evento={ev} />
      ) : (
        <PedirNombre slug={slug} evento={ev} onListo={cargar} />
      )}
    </main>
  );
}

function Portada({ evento, compacta = false }: { evento: EventoPublico; compacta?: boolean }) {
  return (
    <header className={compacta ? 'portada compacta' : 'portada'}>
      <h1 className="portada-nombres">{evento.titulo}</h1>
      {evento.fecha && <p className="portada-fecha">{formatearFecha(evento.fecha)}</p>}
      {!compacta && evento.estilo?.bienvenida && <p className="portada-bienvenida">{evento.estilo.bienvenida}</p>}
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
        <div className="mensaje-noche">
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
        <label htmlFor="nombre">¿Cómo te llamás?</label>
        <input
          id="nombre"
          required
          maxLength={60}
          autoComplete="given-name"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Tu nombre"
        />
        <p className="nombre-ayuda">Así los anfitriones saben quién sacó cada foto.</p>
        {error && <p className="error-noche" role="alert">{error}</p>}
        <button className="boton-noche" disabled={enviando || !nombre.trim()}>
          {enviando ? 'Entrando…' : 'Entrar a la galería'}
        </button>
      </form>
    </>
  );
}

function GaleriaInvitado({ evento }: { evento: EventoPublico }) {
  const { fotos, cargando, hayMas, verMas } = useFotos(evento.id);
  const { items, agregar, reintentar, limpiarListas } = useSubidas(evento.id);
  const selector = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLElement>(null);
  const abierto = evento.estado === 'activo';

  return (
    <>
      <Portada evento={evento} compacta={fotos.length > 0} />

      {items.length > 0 && <ProgresoSubida items={items} onReintentar={reintentar} onCerrar={limpiarListas} />}

      <section className="galeria-noche" ref={galeriaRef} aria-label="Galería">
        {cargando && <div className="cargando-noche corto" aria-busy="true" />}
        {!cargando && fotos.length === 0 && (
          <p className="vacio-noche">
            {abierto ? 'Todavía no hay fotos. Subí la primera de la noche.' : 'Este evento no tiene fotos.'}
          </p>
        )}
        <Galeria fotos={fotos} />
        {hayMas && (
          <button type="button" className="boton-noche secundario ver-mas" onClick={verMas}>
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
          <button type="button" className="boton-noche" onClick={() => selector.current?.click()}>
            Subir fotos
          </button>
        </div>
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
