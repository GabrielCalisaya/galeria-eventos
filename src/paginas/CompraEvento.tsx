import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import EncabezadoPanel from '../componentes/EncabezadoPanel';
import { supabase } from '../lib/supabase';
import { invocar, irAMercadoPago } from '../lib/funciones';
import { linkWhatsapp } from '../lib/contacto';
import './compra-evento.css';

type Compra = {
  id: string; idempotency_key: string; event_id: string | null; titulo_evento: string; tipo_evento: string; tipo_invitacion: 'wedding' | 'birthday' | 'xv' | null; fecha_evento: string | null;
  gallery_pack: string | null; invitation_tier: string | null; productos: Array<{ tipo: string; nombre: string; precio: number }>;
  descuento: number; total: number; moneda: string; estado: string; datos_invitacion: Record<string, string> | null; datos_completos: boolean; url_invitacion: string | null;
};
type Pago = { metodo: string; estado: string; numero_transferencia: string | null; monto: number; moneda: string };

// [campo, etiqueta, ejemplo, largo máximo]. Los largos coinciden con los del servidor (guardar-datos-compra).
const CAMPOS = [
  ['nombres', 'Nombres que van en la invitación', 'Sofía y Martín', 160],
  ['hora', 'Horario del evento', '21:00', 80],
  ['lugar', 'Nombre del lugar', 'Salón Los Aromos', 160],
  ['direccion', 'Dirección', 'Calle, número, localidad', 500],
  ['mapa', 'Enlace de Google Maps', 'https://maps.google.com/...', 500],
  ['frase', 'Frase o mensaje de bienvenida', 'Nos encantaría compartir este día con vos…', 600],
  ['cronograma', 'Momentos importantes', 'Ceremonia 20:00 · Fiesta 21:30', 1000],
  ['vestimenta', 'Código de vestimenta', 'Elegante sport', 160],
  ['regalos', 'Información sobre regalos', '', 600],
  ['alias_regalo', 'Alias para regalos o transferencia', '', 100],
  ['titular_regalo', 'Titular de la cuenta', '', 160],
  ['whatsapp', 'WhatsApp para confirmaciones', '+54 9…', 20],
  ['colores', 'Colores o estilo que te gustaría', 'Crema, verde salvia y dorado', 160],
  ['galeria_bienvenida', 'Mensaje de bienvenida para la galería', '¡Compartí las fotos de este momento!', 160],
  ['notas', 'Otros detalles que debamos saber', '', 1500],
] as const;
const OBLIGATORIOS = ['nombres', 'hora', 'lugar', 'direccion'];
const LARGOS = ['frase', 'cronograma', 'regalos', 'notas'];

const dinero = (n: number, moneda = 'ARS') => new Intl.NumberFormat('es-AR', { style: 'currency', currency: moneda, maximumFractionDigits: 0 }).format(Number(n));
const NOMBRES_ESTADO: Record<string, string> = {
  pendiente_pago: 'Pendiente de pago', transferencia_pendiente: 'Transferencia a confirmar', pagada: 'Pago confirmado', preparando: 'Invitación en preparación', entregada: 'Entregada', cancelada: 'Pago no completado', reembolsada: 'Reembolsada',
};
const PAGADA = ['pagada', 'preparando', 'entregada'];

function expandirDatos(datosGuardados: Record<string, string> | null): Record<string, string> {
  const datos = { ...(datosGuardados ?? {}) };
  try {
    const preguntas = JSON.parse(datos.quiz_questions ?? '[]');
    if (Array.isArray(preguntas)) preguntas.slice(0, 3).forEach((pregunta, indice) => {
      const n = indice + 1;
      datos[`quiz_question_${n}`] = pregunta.question ?? '';
      for (let respuesta = 0; respuesta < 3; respuesta++) datos[`quiz_answer_${n}_${respuesta}`] = pregunta.answers?.[respuesta] ?? '';
      datos[`quiz_correct_${n}`] = String(pregunta.correct ?? 0);
    });
  } catch { /* Una ficha anterior puede no tener trivia guardada. */ }
  return datos;
}

export default function CompraEvento() {
  const { id = '' } = useParams();
  const [search, setSearch] = useSearchParams();
  const [compra, setCompra] = useState<Compra | null>(null);
  const [pago, setPago] = useState<Pago | null>(null);
  const [datos, setDatos] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [pagando, setPagando] = useState(false);
  const [errorPago, setErrorPago] = useState('');

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    const { data, error: errorCompra } = await supabase.from('compras').select('id,idempotency_key,event_id,titulo_evento,tipo_evento,tipo_invitacion,fecha_evento,gallery_pack,invitation_tier,productos,descuento,total,moneda,estado,datos_invitacion,datos_completos,url_invitacion').eq('id', id).maybeSingle();
    if (errorCompra || !data) {
      setErrorCarga('No encontramos este pedido en tu cuenta. Revisá que hayas iniciado sesión con el email de compra.');
      setCargando(false);
      return null;
    }
    const pedido = data as Compra;
    setErrorCarga('');
    setCompra(pedido);
    if (!silencioso) setDatos(expandirDatos(pedido.datos_invitacion as Record<string, string> | null));
    const { data: pagoData } = await supabase.from('compra_pagos').select('metodo,estado,numero_transferencia,monto,moneda').eq('compra_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    setPago((pagoData as Pago | null) ?? null);
    setCargando(false);
    return pedido;
  }, [id]);

  useEffect(() => { void cargar(); }, [cargar]);

  // Al volver de Mercado Pago, la confirmación llega por aviso del servidor: se consulta el estado unos minutos.
  const retorno = search.get('pago');
  const esperando = (retorno === 'aprobado' || retorno === 'pendiente') && compra?.estado === 'pendiente_pago';
  useEffect(() => {
    if (!esperando) return;
    let intentos = 0;
    const t = setInterval(async () => {
      intentos++;
      const pedido = await cargar(true);
      if ((pedido && pedido.estado !== 'pendiente_pago') || intentos >= 40) {
        clearInterval(t);
        if (pedido && pedido.estado !== 'pendiente_pago') setSearch({}, { replace: true });
      }
    }, 4000);
    return () => clearInterval(t);
  }, [esperando, cargar, setSearch]);

  async function guardar(completar: boolean) {
    setGuardando(true); setError(''); setAviso('');
    try {
      const datosEnvio = { ...datos };
      if (compra?.tipo_invitacion === 'wedding') datosEnvio.nombres = [datos.person_one, datos.person_two].filter(Boolean).join(' & ');
      else datosEnvio.nombres = datos.person_one ?? datos.nombres ?? '';
      if (compra?.invitation_tier === 'deluxe') datosEnvio.quiz_questions = JSON.stringify([1, 2, 3].map((n) => ({
        question: datos[`quiz_question_${n}`] ?? '',
        answers: [0, 1, 2].map((i) => datos[`quiz_answer_${n}_${i}`] ?? ''),
        correct: Number(datos[`quiz_correct_${n}`] ?? 0),
      })));
      const respuesta = await invocar<{ aviso_preparacion?: string }>('guardar-datos-compra', { compra_id: id, datos: datosEnvio, completar });
      setAviso(completar ? respuesta.aviso_preparacion ? `Recibimos la ficha, pero la preparación automática necesita atención: ${respuesta.aviso_preparacion}` : '¡Listo! Recibimos la información para preparar tu invitación.' : 'Guardamos los cambios. Podés seguir completando después.');
      await cargar(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGuardando(false);
    }
  }

  async function pagarConMercadoPago() {
    if (!compra) return;
    setPagando(true); setErrorPago('');
    try {
      const data = await invocar<{ url?: string }>('crear-compra', {
        idempotency_key: compra.idempotency_key,
        event_title: compra.titulo_evento, event_type: compra.tipo_evento, event_date: compra.fecha_evento,
        gallery_pack: compra.gallery_pack, invitation_tier: compra.invitation_tier, invitation_type: compra.tipo_invitacion, payment_method: 'mercado_pago',
        ...((compra.productos ?? []).some((p) => p.tipo === 'mejora') ? { mejora: true, event_id: compra.event_id } : {}),
      });
      irAMercadoPago(data.url);
    } catch (e) {
      setErrorPago((e as Error).message);
      setPagando(false);
    }
  }

  if (cargando || !compra) {
    return (
      <main className="panel compra-detalle-pagina">
        <EncabezadoPanel />
        <div className="panel-columna compra-detalle">
          <Link to="/panel" className="volver">← Mis eventos</Link>
          {cargando ? <div className="cargando" aria-busy="true" /> : <div className="compra-alerta error" role="alert">{errorCarga}</div>}
        </div>
      </main>
    );
  }

  const pagada = PAGADA.includes(compra.estado);
  const esMejora = (compra.productos ?? []).some((p) => p.tipo === 'mejora');
  const fichaHabilitada = Boolean(compra.invitation_tier) && ['pagada', 'transferencia_pendiente'].includes(compra.estado);
  const sinPagar = compra.estado === 'pendiente_pago' || compra.estado === 'cancelada';
  const puedePagarMp = sinPagar && (!pago || pago.metodo === 'mercado_pago') && pago?.estado !== 'en_proceso' && !esperando;

  return (
    <main className="panel compra-detalle-pagina">
      <EncabezadoPanel />
      <div className="panel-columna compra-detalle">
        <Link to="/panel" className="volver">← Mis eventos</Link>
        <div className="compra-detalle-titulo">
          <div>
            <p className="etiqueta">Pedido · {compra.id.slice(0, 8).toUpperCase()}</p>
            <h1>{compra.titulo_evento}</h1>
            <p>Estado: <strong>{NOMBRES_ESTADO[compra.estado] ?? compra.estado}</strong></p>
          </div>
          <button className="boton" type="button" onClick={() => void cargar(true)}>Actualizar estado</button>
        </div>

        {esperando && <p className="compra-alerta" role="status">Estamos esperando la confirmación de Mercado Pago. Esta página se actualiza sola.</p>}
        {retorno === 'rechazado' && sinPagar && <p className="compra-alerta" role="status">El pago no se completó. Podés intentarlo de nuevo.</p>}
        {sinPagar && pago?.metodo === 'mercado_pago' && pago.estado === 'en_proceso' && (
          <p className="compra-alerta" role="status">Mercado Pago está procesando el pago (por ejemplo, si elegiste pagar en efectivo). El pedido se activa solo cuando se acredite.</p>
        )}

        <section className="tarjeta compra-resumen-pedido">
          <div>
            <p className="etiqueta">Tu pedido</p>
            <ul className="compra-lineas">{(compra.productos ?? []).map((producto, i) => <li key={`${producto.nombre}-${i}`}><span>{producto.nombre}</span><strong>{dinero(producto.precio, compra.moneda)}</strong></li>)}</ul>
            {Number(compra.descuento) > 0 && <p className="compra-descuento"><span>Descuento del combo</span><strong>−{dinero(compra.descuento, compra.moneda)}</strong></p>}
            <div className="compra-total"><span>Total</span><strong>{dinero(compra.total, compra.moneda)}</strong></div>
          </div>
          {pago?.metodo === 'transferencia' && compra.estado === 'transferencia_pendiente' && (
            <div className="compra-transferencia">
              <span className="compra-transfer-icon" aria-hidden="true">↗</span>
              <div>
                <h2>Transferencia bancaria</h2>
                <p>Transferí el total indicado a este alias y luego avisá por WhatsApp con la referencia de tu pedido.</p>
                <strong className="compra-telefono">{pago.numero_transferencia ?? 'Alias no disponible'}</strong>
                <a className="boton boton-primario" href={linkWhatsapp(`Hola, hice la transferencia del evento ${compra.titulo_evento}. Referencia: ${compra.id}.`)} target="_blank" rel="noreferrer">Avisar por WhatsApp ↗</a>
                <small>Activamos el pedido cuando confirmamos la acreditación.</small>
              </div>
            </div>
          )}
        </section>

        {puedePagarMp && (
          <div className="compra-alerta">
            <p>{pago?.estado === 'pendiente' ? 'Todavía no completaste el pago.' : 'El pago no se completó.'} Podés pagar con el mismo pedido, sin crear otra galería.</p>
            <button className="boton boton-primario" type="button" disabled={pagando} onClick={() => void pagarConMercadoPago()}>
              {pagando ? 'Abriendo Mercado Pago…' : 'Pagar con Mercado Pago'}
            </button>
            {errorPago && <p className="error" role="alert">{errorPago}</p>}
          </div>
        )}

        {compra.event_id && (pagada ? (
          <p className="compra-alerta">{esMejora ? 'Tu galería ya tiene el pack nuevo.' : 'Tu galería ya está activa.'} <Link to={`/panel/${compra.event_id}?bienvenida=1`}>Abrir la galería</Link></p>
        ) : esMejora ? (
          <p className="compra-alerta">Tu galería sigue funcionando con su pack actual; el pack nuevo se aplica solo cuando se confirme el pago.</p>
        ) : (
          <p className="compra-alerta">Tu galería ya está creada y se activa sola cuando se confirme el pago. La encontrás en <Link to="/panel">Mis eventos</Link>.</p>
        ))}

        {compra.estado === 'preparando' && <p className="compra-alerta" role="status">Estamos preparando tu invitación con los datos de tu ficha. Para cambiar algo, escribinos por WhatsApp.</p>}
        {compra.estado === 'entregada' && compra.url_invitacion && (
          <p className="compra-alerta">Tu invitación ya está lista: <a href={compra.url_invitacion} target="_blank" rel="noreferrer">Abrir invitación ↗</a></p>
        )}

        {fichaHabilitada && (
          <section className="tarjeta compra-ficha">
            <div className="compra-paso"><span>✎</span><div><p className="etiqueta">Siguiente paso</p><h2>{compra.datos_completos ? 'Ficha de invitación enviada' : 'Completá los datos de tu invitación'}</h2><p>Podés guardar un borrador y volver después. Para enviarla necesitamos los datos principales.</p></div></div>
            {compra.datos_completos && <p className="compra-alerta" role="status">Ya recibimos tu ficha. Si querés corregir un dato, cambialo y volvé a enviarla.</p>}
            <form className="formulario compra-campos" onSubmit={(e) => { e.preventDefault(); void guardar(false); }}>
              {compra.tipo_invitacion === 'wedding' ? (
                <div className="campos-dobles">
                  <label className="campo"><span>Nombre de la primera persona <small>Obligatorio</small></span><input maxLength={80} required value={datos.person_one ?? ''} onChange={(e) => setDatos((d) => ({ ...d, person_one: e.target.value }))} placeholder="Sofía" /></label>
                  <label className="campo"><span>Nombre de la segunda persona <small>Obligatorio</small></span><input maxLength={80} required value={datos.person_two ?? ''} onChange={(e) => setDatos((d) => ({ ...d, person_two: e.target.value }))} placeholder="Martín" /></label>
                </div>
              ) : (
                <label className="campo"><span>{compra.tipo_invitacion === 'xv' ? 'Nombre de quien cumple 15' : 'Nombre de quien cumple años'} <small>Obligatorio</small></span><input maxLength={80} required value={datos.person_one ?? datos.nombres ?? ''} onChange={(e) => setDatos((d) => ({ ...d, person_one: e.target.value, nombres: e.target.value }))} placeholder="Alma" /></label>
              )}
              {CAMPOS.filter(([key]) => key !== 'nombres').map(([key, label, placeholder, max]) => {
                const obligatorio = OBLIGATORIOS.includes(key);
                const cambiar = (valor: string) => setDatos((d) => ({ ...d, [key]: valor }));
                return (
                  <label className="campo" key={key}>
                    <span>{label}{obligatorio && <small> Obligatorio para enviar</small>}</span>
                    {LARGOS.includes(key)
                      ? <textarea rows={key === 'notas' ? 4 : 2} maxLength={max} required={obligatorio} value={datos[key] ?? ''} onChange={(e) => cambiar(e.target.value)} placeholder={placeholder} />
                      : <input type={key === 'mapa' ? 'url' : 'text'} maxLength={max} required={obligatorio} pattern={key === 'whatsapp' ? '[0-9+ ()-]{8,20}' : undefined} inputMode={key === 'whatsapp' ? 'tel' : undefined} value={datos[key] ?? ''} onChange={(e) => cambiar(e.target.value)} placeholder={placeholder} />}
                  </label>
                );
              })}
              <label className="campo"><span>Confirmación de asistencia</span><select value={datos.rsvp ?? ''} onChange={(e) => setDatos((d) => ({ ...d, rsvp: e.target.value }))}><option value="">Elegí una opción</option><option value="whatsapp">Por WhatsApp</option><option value="formulario">Formulario de confirmación</option><option value="sin_confirmacion">No incluir confirmación</option></select></label>
              {compra.invitation_tier === 'deluxe' && <fieldset className="compra-quiz"><legend>Trivia de tu invitación Deluxe</legend><p>Proponé tres preguntas para que tus invitados jueguen. En cada pregunta, marcá la respuesta correcta.</p><label className="campo"><span>Título del quiz</span><input maxLength={100} value={datos.quiz_heading ?? ''} onChange={(e) => setDatos((d) => ({ ...d, quiz_heading: e.target.value }))} placeholder="¿Cuánto conocés esta celebración?" /></label>{[1, 2, 3].map((n) => <div className="compra-quiz-pregunta" key={n}><h3>Pregunta {n}</h3><label className="campo"><span>Enunciado</span><input required maxLength={160} value={datos[`quiz_question_${n}`] ?? ''} onChange={(e) => setDatos((d) => ({ ...d, [`quiz_question_${n}`]: e.target.value }))} placeholder="¿Dónde se conocieron?" /></label><div className="campos-dobles">{[0, 1, 2].map((i) => <label className="campo" key={i}><span>Respuesta {i + 1}</span><input required maxLength={80} value={datos[`quiz_answer_${n}_${i}`] ?? ''} onChange={(e) => setDatos((d) => ({ ...d, [`quiz_answer_${n}_${i}`]: e.target.value }))} placeholder={`Opción ${i + 1}`} /></label>)}</div><label className="campo"><span>Respuesta correcta</span><select value={datos[`quiz_correct_${n}`] ?? '0'} onChange={(e) => setDatos((d) => ({ ...d, [`quiz_correct_${n}`]: e.target.value }))}><option value="0">Respuesta 1</option><option value="1">Respuesta 2</option><option value="2">Respuesta 3</option></select></label></div>)}</fieldset>}
              <div className="compra-checklist"><h3>Material para preparar el diseño</h3><p>Después de enviar esta ficha, mandanos por WhatsApp:</p><ul><li>Fotos de las personas protagonistas, si querés incluirlas.</li><li>El logo, escudo o ilustraciones que quieras sumar.</li><li>Referencias visuales o aclaraciones sobre el estilo.</li></ul><a href={linkWhatsapp(`Hola, estoy enviando el material para la invitación de ${compra.titulo_evento}. Referencia: ${compra.id}.`)} target="_blank" rel="noreferrer">Enviar material por WhatsApp ↗</a></div>
              {error && <p className="error" role="alert">{error}</p>}
              {aviso && <p className="compra-alerta" role="status">{aviso}</p>}
              <div className="compra-acciones-ficha">
                <button className="boton" type="submit" formNoValidate disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar borrador'}</button>
                <button className="boton boton-primario" type="button" disabled={guardando} onClick={(e) => { if (e.currentTarget.form?.reportValidity()) void guardar(true); }}>{guardando ? 'Enviando…' : compra.datos_completos ? 'Enviar correcciones' : 'Enviar ficha completa'}</button>
              </div>
            </form>
          </section>
        )}
        {compra.invitation_tier && sinPagar && <p className="compra-ayuda-pago">La ficha de invitación se habilita cuando se confirma el pago o registramos tu pedido por transferencia.</p>}
      </div>
    </main>
  );
}
