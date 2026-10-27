import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import EncabezadoPanel from '../componentes/EncabezadoPanel';
import { supabase } from '../lib/supabase';
import { linkWhatsapp } from '../lib/contacto';
import './compra-evento.css';

type Compra = {
  id: string; idempotency_key: string; event_id: string | null; titulo_evento: string; tipo_evento: string; fecha_evento: string | null;
  gallery_pack: string | null; invitation_tier: string | null; productos: Array<{ tipo: string; nombre: string; precio: number }>;
  descuento: number; total: number; moneda: string; estado: string; datos_invitacion: Record<string, string> | null; datos_completos: boolean; url_invitacion: string | null;
};
type Pago = { metodo: string; estado: string; numero_transferencia: string | null; monto: number; moneda: string };
const campos = [
  ['nombres', 'Nombres que van en la invitación', 'Sofía y Martín'],
  ['hora', 'Horario del evento', '21:00'],
  ['lugar', 'Nombre del lugar', 'Salón Los Aromos'],
  ['direccion', 'Dirección', 'Calle, número, localidad'],
  ['mapa', 'Enlace de Google Maps', 'https://maps.google.com/...'],
  ['frase', 'Frase o mensaje de bienvenida', 'Nos encantaría compartir este día con vos…'],
  ['cronograma', 'Momentos importantes', 'Ceremonia 20:00 · Fiesta 21:30'],
  ['vestimenta', 'Código de vestimenta', 'Elegante sport'],
  ['regalos', 'Información sobre regalos', ''],
  ['alias_regalo', 'Alias para regalos o transferencia', ''],
  ['titular_regalo', 'Titular de la cuenta', ''],
  ['whatsapp', 'WhatsApp para confirmaciones', '+54 9…'],
  ['colores', 'Colores o estilo que te gustaría', 'Crema, verde salvia y dorado'],
  ['galeria_bienvenida', 'Mensaje de bienvenida para la galería', '¡Compartí las fotos de este momento!'],
  ['notas', 'Otros detalles que debamos saber', ''],
] as const;
const dinero = (n: number, moneda = 'ARS') => new Intl.NumberFormat('es-AR', { style: 'currency', currency: moneda, maximumFractionDigits: 0 }).format(Number(n));
const nombresEstado: Record<string, string> = {
  pendiente_pago: 'Pendiente de pago', transferencia_pendiente: 'Transferencia a confirmar', pagada: 'Pago confirmado', preparando: 'En preparación', entregada: 'Entregada', cancelada: 'Cancelada', reembolsada: 'Reembolsada',
};

export default function CompraEvento() {
  const { id = '' } = useParams();
  const [search] = useSearchParams();
  const [compra, setCompra] = useState<Compra | null>(null);
  const [pago, setPago] = useState<Pago | null>(null);
  const [datos, setDatos] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [reintentando, setReintentando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    const { data, error: errorCompra } = await supabase.from('compras').select('id,idempotency_key,event_id,titulo_evento,tipo_evento,fecha_evento,gallery_pack,invitation_tier,productos,descuento,total,moneda,estado,datos_invitacion,datos_completos,url_invitacion').eq('id', id).maybeSingle();
    if (errorCompra || !data) { setError('No encontramos este pedido en tu cuenta. Revisá que hayas iniciado sesión con el email de compra.'); setCargando(false); return; }
    const pedido = data as Compra;
    setCompra(pedido);
    setDatos((pedido.datos_invitacion ?? {}) as Record<string, string>);
    const { data: pagoData } = await supabase.from('compra_pagos').select('metodo,estado,numero_transferencia,monto,moneda').eq('compra_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    setPago((pagoData as Pago | null) ?? null);
    setCargando(false);
  }, [id]);

  useEffect(() => { void cargar(); }, [cargar]);

  async function guardar(completar: boolean) {
    setGuardando(true); setError(''); setAviso('');
    const { data, error: invokeError } = await supabase.functions.invoke('guardar-datos-compra', { body: { compra_id: id, datos, completar } });
    setGuardando(false);
    if (invokeError || data?.error) { setError(data?.error ?? 'No se pudieron guardar los datos. Intentá de nuevo.'); return; }
    setAviso(completar ? '¡Listo! Recibimos la información para preparar tu invitación.' : 'Guardamos los cambios. Podés seguir completando después.');
    await cargar();
  }

  async function reintentarPago() {
    if (!compra) return;
    setReintentando(true); setError('');
    const { data, error: invokeError } = await supabase.functions.invoke('crear-compra', { body: {
      idempotency_key: compra.idempotency_key,
      event_title: compra.titulo_evento, event_type: compra.tipo_evento, event_date: compra.fecha_evento,
      gallery_pack: compra.gallery_pack, invitation_tier: compra.invitation_tier, payment_method: 'mercado_pago',
    } });
    setReintentando(false);
    if (invokeError || data?.error) { setError(data?.error ?? 'No se pudo iniciar el pago. Intentá de nuevo.'); return; }
    let url: URL;
    try { url = new URL(data?.url); } catch { setError('No llegó el enlace seguro de Mercado Pago.'); return; }
    if (!['mercadopago.com.ar', 'mercadopago.com'].some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) { setError('El enlace de pago no pertenece a Mercado Pago.'); return; }
    window.location.assign(url.href);
  }

  const aceptada = compra && ['pagada', 'transferencia_pendiente', 'preparando', 'entregada'].includes(compra.estado);
  const necesitaFicha = Boolean(compra?.invitation_tier) && compra?.estado !== 'entregada';
  const pagoMensaje = search.get('pago') === 'aprobado' && compra?.estado !== 'pagada'
    ? 'Mercado Pago está confirmando la operación. Actualizá el estado en unos segundos.'
    : search.get('pago') === 'rechazado' ? 'El pago no se completó. Podés volver a intentar desde Mercado Pago.'
      : search.get('pago') === 'pendiente' ? 'Mercado Pago dejó el pago pendiente. Esta página se actualizará cuando recibamos la confirmación.' : '';

  return (
    <main className="panel compra-detalle-pagina">
      <EncabezadoPanel />
      <div className="panel-columna compra-detalle">
        <Link to="/panel" className="volver">← Mis eventos</Link>
        {cargando && <div className="cargando" aria-busy="true" />}
        {!cargando && error && <div className="compra-alerta error" role="alert">{error}</div>}
        {!cargando && compra && <>
          <div className="compra-detalle-titulo"><div><p className="etiqueta">Pedido · {compra.id.slice(0, 8).toUpperCase()}</p><h1>{compra.titulo_evento}</h1><p>Estado: <strong>{nombresEstado[compra.estado] ?? compra.estado}</strong></p></div><button className="boton" type="button" onClick={() => void cargar()}>Actualizar estado</button></div>
          {pagoMensaje && <p className="compra-alerta" role="status">{pagoMensaje}</p>}
          <section className="tarjeta compra-resumen-pedido">
            <div><p className="etiqueta">Tu pedido</p><ul className="compra-lineas">{(compra.productos ?? []).map((producto, i) => <li key={`${producto.nombre}-${i}`}><span>{producto.nombre}</span><strong>{dinero(producto.precio, compra.moneda)}</strong></li>)}</ul>{Number(compra.descuento) > 0 && <p className="compra-descuento"><span>Descuento del combo</span><strong>−{dinero(compra.descuento, compra.moneda)}</strong></p>}<div className="compra-total"><span>Total</span><strong>{dinero(compra.total, compra.moneda)}</strong></div></div>
            {pago?.metodo === 'transferencia' && <div className="compra-transferencia"><span className="compra-transfer-icon" aria-hidden="true">↗</span><div><h2>Transferencia bancaria</h2><p>Transferí el total indicado a este alias y luego avisá por WhatsApp con la referencia de tu pedido.</p><strong className="compra-telefono">{pago.numero_transferencia ?? 'Alias no disponible'}</strong><a className="boton boton-primario" href={linkWhatsapp(`Hola, hice la transferencia del evento ${compra.titulo_evento}. Referencia: ${compra.id}.`)} target="_blank" rel="noreferrer">Avisar por WhatsApp ↗</a><small>Activaremos el pedido cuando confirmemos la acreditación.</small></div></div>}
          </section>
          {compra.event_id && <p className="compra-alerta">La galería de tu evento ya está preparada. La vas a encontrar en <Link to={`/panel/${compra.event_id}`}>Mis eventos</Link> cuando el pago quede confirmado.</p>}
          {compra.estado === 'pendiente_pago' && pago?.metodo === 'mercado_pago' && ['rechazado', 'cancelado'].includes(pago.estado) && <div className="compra-alerta"><p>El pago no se completó. Podés reintentarlo con el mismo pedido, sin crear otra galería.</p><button className="boton boton-primario" type="button" disabled={reintentando} onClick={() => void reintentarPago()}>{reintentando ? 'Abriendo Mercado Pago…' : 'Reintentar pago con Mercado Pago'}</button></div>}
          {necesitaFicha && aceptada && <section className="tarjeta compra-ficha">
            <div className="compra-paso"><span>✎</span><div><p className="etiqueta">Siguiente paso</p><h2>{compra.datos_completos ? 'Ficha de invitación enviada' : 'Completá los datos de tu invitación'}</h2><p>Podés guardar un borrador y volver después. Para enviarla necesitamos los datos principales.</p></div></div>
            {compra.datos_completos && <p className="compra-alerta" role="status">Ya recibimos tu ficha. Si querés corregir un dato, guardá los cambios y volvé a enviarla.</p>}
            <form className="formulario compra-campos" onSubmit={(e) => { e.preventDefault(); void guardar(false); }}>
              {campos.map(([key, label, placeholder]) => {
                const maxLength: Record<string, number> = { nombres: 160, hora: 80, lugar: 160, direccion: 500, mapa: 500, frase: 600, cronograma: 1000, vestimenta: 160, regalos: 600, alias_regalo: 100, titular_regalo: 160, whatsapp: 20, colores: 160, galeria_bienvenida: 160, notas: 1500 };
                const max = maxLength[key];
                const obligatorio = ['nombres', 'hora', 'lugar', 'direccion'].includes(key);
                return <label className="campo" key={key}><span>{label}{obligatorio && <small> Obligatorio para enviar</small>}</span>{['frase', 'cronograma', 'regalos', 'notas'].includes(key) ? <textarea rows={key === 'notas' ? 4 : 2} maxLength={max} required={obligatorio} value={datos[key] ?? ''} onChange={(e) => setDatos((d) => ({ ...d, [key]: e.target.value }))} placeholder={placeholder} /> : <input type={key === 'mapa' ? 'url' : 'text'} maxLength={max} required={obligatorio} pattern={key === 'whatsapp' ? '[0-9+ ()-]{8,20}' : undefined} inputMode={key === 'whatsapp' ? 'tel' : undefined} value={datos[key] ?? ''} onChange={(e) => setDatos((d) => ({ ...d, [key]: e.target.value }))} placeholder={placeholder} />}</label>;
              })}
              <label className="campo"><span>Confirmación de asistencia</span><select value={datos.rsvp ?? ''} onChange={(e) => setDatos((d) => ({ ...d, rsvp: e.target.value }))}><option value="">Elegí una opción</option><option value="whatsapp">Por WhatsApp</option><option value="formulario">Formulario de confirmación</option><option value="sin_confirmacion">No incluir confirmación</option></select></label>
              <div className="compra-checklist"><h3>Material para preparar el diseño</h3><p>Después de enviar esta ficha, mandanos por WhatsApp:</p><ul><li>Fotos de las personas protagonistas, si querés incluirlas.</li><li>El logo, escudo o ilustraciones que quieras sumar.</li><li>Referencias visuales o aclaraciones sobre el estilo.</li></ul><a href={linkWhatsapp(`Hola, estoy enviando el material para la invitación de ${compra.titulo_evento}. Referencia: ${compra.id}.`)} target="_blank" rel="noreferrer">Enviar material por WhatsApp ↗</a></div>
              {error && <p className="error" role="alert">{error}</p>}{aviso && <p className="compra-alerta" role="status">{aviso}</p>}
              <div className="compra-acciones-ficha"><button className="boton" type="submit" formNoValidate disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar borrador'}</button><button className="boton boton-primario" type="button" disabled={guardando} onClick={(e) => { if (e.currentTarget.form?.reportValidity()) void guardar(true); }}>{guardando ? 'Enviando…' : compra.datos_completos ? 'Enviar correcciones' : 'Enviar ficha completa'}</button></div>
            </form>
          </section>}
          {!necesitaFicha && compra.estado === 'entregada' && compra.url_invitacion && <p className="compra-alerta">Tu invitación ya está lista: <a href={compra.url_invitacion} target="_blank" rel="noreferrer">Abrir invitación ↗</a></p>}
          {!aceptada && <p className="compra-ayuda-pago">La ficha de invitación se habilita cuando Mercado Pago confirma el pago o registramos la transferencia.</p>}
        </>}
      </div>
    </main>
  );
}
