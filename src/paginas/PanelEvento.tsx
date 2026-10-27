import { useEffect, useState } from 'react';
import { PieSitio } from '../componentes/Sitio';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { supabase } from '../lib/supabase';
import { useFotos } from '../lib/fotos';
import { borrarEvento, borrarFotos } from '../lib/borrado';
import { formatearFecha, linkInvitados, linkPantalla } from '../lib/formato';
import { NOMBRES_TIPO, type Evento } from '../lib/tipos';
import EncabezadoPanel from '../componentes/EncabezadoPanel';
import Galeria from '../componentes/Galeria';
import DescargaZip from '../componentes/DescargaZip';
import AjustesEvento from '../componentes/AjustesEvento';
import { useDialogos } from '../componentes/Dialogos';
import ElegirPack from '../componentes/ElegirPack';
import { incluyeExtras } from '../lib/pagos';
import ProximosPasos from '../componentes/ProximosPasos';

export default function PanelEvento() {
  const { id } = useParams();
  const navegar = useNavigate();
  const { confirmar, avisar } = useDialogos();
  const [evento, setEvento] = useState<Evento | null | undefined>(undefined);
  const [qr, setQr] = useState('');
  const [copiado, setCopiado] = useState<'' | 'invitados' | 'pantalla'>('');
  const { fotos, cargando, hayMas, verMas, reemplazar } = useFotos(id, true);

  const [seleccionando, setSeleccionando] = useState(false);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [trabajando, setTrabajando] = useState('');
  const [error, setError] = useState('');

  const [borrandoEvento, setBorrandoEvento] = useState(false);
  const [params] = useSearchParams();
  // Al llegar desde un pedido recién pagado («Abrir la galería») se muestran los próximos pasos.
  const recienPagado = params.get('bienvenida') === '1';
  // Pedido del checkout unificado que creó este evento (si lo hay).
  const [pedido, setPedido] = useState<{ id: string; estado: string; invitation_tier: string | null; datos_completos: boolean } | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => setEvento((data as Evento | null) ?? null));
    supabase
      .from('compras')
      .select('id,estado,invitation_tier,datos_completos')
      .eq('event_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setPedido((data as typeof pedido) ?? null));
  }, [id]);

  useEffect(() => {
    if (!evento) return;
    QRCode.toDataURL(linkInvitados(evento.slug), {
      width: 720,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#30262B', light: '#FFFFFF' },
    }).then(setQr);
  }, [evento]);

  // Las fotos borradas desaparecen de la selección.
  useEffect(() => {
    setSeleccion((prev) => {
      const ids = new Set(fotos.map((f) => f.id));
      const quedan = [...prev].filter((x) => ids.has(x));
      return quedan.length === prev.size ? prev : new Set(quedan);
    });
  }, [fotos]);

  async function copiar(tipo: 'invitados' | 'pantalla') {
    if (!evento) return;
    await navigator.clipboard.writeText(tipo === 'invitados' ? linkInvitados(evento.slug) : linkPantalla(evento.pantalla_token));
    setCopiado(tipo);
    setTimeout(() => setCopiado(''), 2000);
  }

  function alternar(fotoId: string) {
    setSeleccion((prev) => {
      const nueva = new Set(prev);
      if (nueva.has(fotoId)) nueva.delete(fotoId);
      else nueva.add(fotoId);
      return nueva;
    });
  }

  function salirDeSeleccion() {
    setSeleccionando(false);
    setSeleccion(new Set());
    setError('');
  }

  async function cambiarVisibilidad(oculta: boolean) {
    if (!id || seleccion.size === 0) return;
    const ids = [...seleccion];
    setTrabajando(oculta ? 'Ocultando…' : 'Mostrando…');
    setError('');
    const { error } = await supabase.from('media').update({ oculta }).eq('event_id', id).in('id', ids);
    setTrabajando('');
    if (error) {
      setError('No se pudieron actualizar las fotos. Probá de nuevo.');
      return;
    }
    fotos.filter((f) => seleccion.has(f.id)).forEach((f) => reemplazar({ ...f, oculta }));
    avisar(oculta ? `${ids.length} ocultas para los invitados` : `${ids.length} visibles otra vez`);
    salirDeSeleccion();
  }

  async function borrarSeleccion() {
    if (!id || seleccion.size === 0) return;
    const n = seleccion.size;
    const ok = await confirmar({
      titulo: `Borrar ${n} ${n === 1 ? 'foto' : 'fotos'}`,
      mensaje: <p>Se eliminan del álbum, de la pantalla y de la descarga. No se pueden recuperar.</p>,
      aceptar: 'Borrar para siempre',
      peligro: true,
    });
    if (!ok) return;
    setError('');
    setTrabajando(`Borrando 0 de ${n}…`);
    try {
      await borrarFotos(id, [...seleccion], (hechas) => setTrabajando(`Borrando ${hechas} de ${n}…`));
      salirDeSeleccion();
      avisar(n === 1 ? 'Foto borrada' : `${n} fotos borradas`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTrabajando('');
    }
  }

  async function borrarTodo() {
    if (!id || !evento) return;
    const ok = await confirmar({
      titulo: 'Borrar este evento',
      mensaje: (
        <>
          <p>
            Se borran “{evento.titulo}” y {fotos.length === 1 ? 'su foto' : `sus ${fotos.length}${hayMas ? '+' : ''} fotos`} para
            siempre. El QR deja de funcionar.
          </p>
          <p>Si querés guardar las fotos, descargalas antes.</p>
        </>
      ),
      aceptar: 'Borrar todo',
      peligro: true,
    });
    if (!ok) return;
    setBorrandoEvento(true);
    setError('');
    try {
      await borrarEvento(id);
      navegar('/panel', { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setBorrandoEvento(false);
    }
  }

  if (evento === undefined) {
    return (
      <main className="panel">
        <EncabezadoPanel />
        <div className="cargando" aria-busy="true" />
      </main>
    );
  }

  if (evento === null) {
    return (
      <main className="panel">
        <EncabezadoPanel />
        <div className="panel-columna">
          <h1>No encontramos este evento</h1>
          <p>
            Puede que lo hayan borrado o que no tengas acceso. <Link to="/panel">Volver a mis eventos</Link>
          </p>
        </div>
      </main>
    );
  }

  const visibles = fotos.filter((f) => !f.oculta).length;

  return (
    <main className="panel">
      <EncabezadoPanel />
      <div className="panel-columna">
        <Link to="/panel" className="volver">
          Mis eventos
        </Link>
        <p className="etiqueta">{NOMBRES_TIPO[evento.tipo]}</p>
        <h1>{evento.titulo}</h1>
        {evento.fecha && <p className="evento-meta">{formatearFecha(evento.fecha)}</p>}

        {evento.estado === 'borrador' ? (
          pedido && !['cancelada', 'reembolsada'].includes(pedido.estado) ? (
            <section className="tarjeta activar">
              <p className="etiqueta">Pedido en curso</p>
              <h2>{pedido.estado === 'transferencia_pendiente' ? 'Esperando la confirmación de tu transferencia' : 'Tu galería se activa con el pago del pedido'}</h2>
              <p className="ayuda">
                Esta galería es parte de un pedido. Se activa sola cuando confirmamos el pago; no hace falta pagarla de nuevo acá.
              </p>
              <div className="acciones">
                <Link className="boton boton-primario" to={`/panel/compra/${pedido.id}`}>
                  Ver mi pedido
                </Link>
              </div>
            </section>
          ) : (
            <section className="tarjeta activar">
              <p className="etiqueta">Último paso</p>
              <h2>Elegí tu pack y activá la galería</h2>
              <p className="ayuda">
                Podés pagar con Mercado Pago o por transferencia, y sumar la invitación digital si querés. El QR empieza a funcionar
                apenas se confirma el pago.
              </p>
              <div className="acciones">
                <Link
                  className="boton boton-primario"
                  to={`/contratar?${new URLSearchParams({
                    evento: evento.id,
                    titulo: evento.titulo,
                    tipo: evento.tipo,
                    ...(evento.fecha ? { fecha: evento.fecha } : {}),
                    pack: 'basico',
                  }).toString()}`}
                >
                  Elegir pack y pagar
                </Link>
              </div>
            </section>
          )
        ) : (
          <>
        <ProximosPasos evento={evento} recienPagado={recienPagado} pedido={pedido} />
        <section className="tarjeta bloque-qr">
          <div className="qr-marco">{qr ? <img src={qr} alt="Código QR para los invitados" className="qr" /> : <div className="qr" />}</div>
          <div className="bloque-qr-texto">
            <h2>QR para los invitados</h2>
            <p>Lo escanean con la cámara del celular y entran directo a subir fotos, sin descargar nada.</p>
            <div className="acciones">
              {incluyeExtras(evento.pack) && (
                <Link className="boton boton-primario" to={`/panel/${evento.id}/tarjetas`}>
                  Imprimir tarjetas de mesa
                </Link>
              )}
              <a className={incluyeExtras(evento.pack) ? 'boton' : 'boton boton-primario'} href={qr} download={`qr-${evento.slug}.png`}>
                Descargar QR
              </a>
              <button type="button" className="boton" onClick={() => copiar('invitados')}>
                {copiado === 'invitados' ? 'Link copiado' : 'Copiar link'}
              </button>
            </div>
          </div>
        </section>

        {incluyeExtras(evento.pack) ? (
        <div className="herramientas">
          <section className="tarjeta herramienta">
            <span className="herramienta-icono" aria-hidden="true">✦</span>
            <h2>Pantalla del salón</h2>
            <p>Abrí este link en la compu conectada al proyector: muestra las fotos a medida que llegan.</p>
            <div className="acciones">
              <a className="boton boton-primario" href={linkPantalla(evento.pantalla_token)} target="_blank" rel="noreferrer">
                Abrir pantalla
              </a>
              <button type="button" className="boton" onClick={() => copiar('pantalla')}>
                {copiado === 'pantalla' ? 'Link copiado' : 'Copiar link'}
              </button>
            </div>
            <p className="ayuda">Pasáselo solo al DJ o a quien maneje la pantalla.</p>
          </section>

          <section className="tarjeta herramienta">
            <span className="herramienta-icono" aria-hidden="true">♡</span>
            <h2>Trivia de la pareja</h2>
            <p>Cargá las preguntas y lanzala en vivo: los invitados juegan desde el celular y el ranking sale en la pantalla.</p>
            <div className="acciones">
              <Link className="boton boton-primario" to={`/panel/${evento.id}/trivia`}>
                Preparar y jugar
              </Link>
            </div>
          </section>
        </div>
        ) : pedido && ['pendiente_pago', 'transferencia_pendiente'].includes(pedido.estado) ? (
          <section className="tarjeta activar mejorar">
            <p className="etiqueta">Mejora en curso</p>
            <h2>{pedido.estado === 'transferencia_pendiente' ? 'Esperando la confirmación de tu transferencia' : 'Falta completar el pago de la mejora'}</h2>
            <p className="ayuda">El pack nuevo se aplica solo cuando se confirma el pago.</p>
            <div className="acciones">
              <Link className="boton boton-primario" to={`/panel/compra/${pedido.id}`}>
                Ver mi pedido
              </Link>
            </div>
          </section>
        ) : (
          <ElegirPack evento={evento} />
        )}

          </>
        )}

        <AjustesEvento evento={evento} onGuardado={setEvento} />

        {evento.estado !== 'borrador' && (
        <section className="seccion-fotos">
          <div className="fila-titulo">
            <div>
              <h2>Fotos</h2>
              <span className="contador">
                {visibles} {visibles === 1 ? 'visible' : 'visibles'}
                {fotos.length > visibles ? `, ${fotos.length - visibles} ocultas` : ''}
              </span>
            </div>
            {fotos.length > 0 && !seleccionando && (
              <button type="button" className="boton" onClick={() => setSeleccionando(true)}>
                Seleccionar
              </button>
            )}
          </div>

          {fotos.length > 0 && !seleccionando && <DescargaZip eventId={evento.id} slug={evento.slug} />}

          {cargando && <div className="cargando" aria-busy="true" />}
          {!cargando && fotos.length === 0 && (
            <div className="vacio">
              <p>Todavía no hay fotos.</p>
              <p>Escaneá el QR con tu celular y subí una para probar: aparece acá al instante.</p>
            </div>
          )}
        </section>
        )}
      </div>

      {fotos.length > 0 && (
        <div className="panel-galeria">
          <Galeria
            fotos={fotos}
            seleccion={seleccionando ? seleccion : undefined}
            onAlternar={seleccionando ? alternar : undefined}
            acciones={(f) => (
              <span className="grilla-etiqueta">
                {f.oculta ? 'Oculta · ' : ''}
                {f.autor_nombre}
              </span>
            )}
          />
          {hayMas && (
            <button type="button" className="boton ver-mas" onClick={verMas}>
              Ver más fotos
            </button>
          )}
        </div>
      )}

      {seleccionando && (
        <div className="barra-seleccion" role="toolbar" aria-label="Acciones sobre las fotos seleccionadas">
          <div className="barra-seleccion-interior">
            <span className="barra-seleccion-cuenta">
              {trabajando ||
                (seleccion.size === 0
                  ? 'Tocá las fotos para elegirlas'
                  : `${seleccion.size} ${seleccion.size === 1 ? 'seleccionada' : 'seleccionadas'}`)}
            </span>
            <div className="barra-seleccion-acciones">
              <button type="button" className="boton" disabled={!seleccion.size || !!trabajando} onClick={() => cambiarVisibilidad(true)}>
                Ocultar
              </button>
              <button type="button" className="boton" disabled={!seleccion.size || !!trabajando} onClick={() => cambiarVisibilidad(false)}>
                Mostrar
              </button>
              <button type="button" className="boton boton-peligro" disabled={!seleccion.size || !!trabajando} onClick={borrarSeleccion}>
                Borrar
              </button>
              <button type="button" className="boton-texto" disabled={!!trabajando} onClick={salirDeSeleccion}>
                Cancelar
              </button>
            </div>
          </div>
          {error && <p className="error barra-seleccion-error" role="alert">{error}</p>}
        </div>
      )}

      {!seleccionando && (
        <div className="panel-columna">
          <section className="zona-peligro">
            <h2>Borrar evento</h2>
            <p>Elimina el evento, el QR deja de funcionar y se borran todas las fotos para siempre.</p>
            <button type="button" className="boton boton-peligro-borde" disabled={borrandoEvento} onClick={borrarTodo}>
              {borrandoEvento ? 'Borrando el evento…' : 'Borrar este evento'}
            </button>
            {error && <p className="error">{error}</p>}
          </section>
        </div>
      )}
      <PieSitio compacto />
    </main>
  );
}
