import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Marca } from '../componentes/Marca';
import { PieSitio } from '../componentes/Sitio';
import { NOMBRES_TIPO, type TipoEvento } from '../lib/tipos';
import { supabase } from '../lib/supabase';
import { esAnonima, useSesion } from '../lib/sesion';
import './compra-evento.css';

type Nivel = 'standard' | 'premium' | 'deluxe';
type Pack = 'basico' | 'experiencia' | 'completo';
type Cotizacion = { subtotal: number; descuento: number; total: number; moneda: string; productos: Array<{ tipo: string; codigo: string; nombre: string; precio: number }> };
const dinero = (n: number) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
const tipos = Object.entries(NOMBRES_TIPO) as [TipoEvento, string][];

function mensajeError(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return 'No se pudo calcular el precio. Intentá de nuevo.';
}

export default function Contratar() {
  const sesion = useSesion();
  const navegar = useNavigate();
  const [params] = useSearchParams();
  const [titulo, setTitulo] = useState(params.get('titulo') ?? '');
  const [tipo, setTipo] = useState<TipoEvento>((tipos.some(([key]) => key === params.get('tipo')) ? params.get('tipo') : 'casamiento') as TipoEvento);
  const [fecha, setFecha] = useState(params.get('fecha') ?? '');
  const [pack, setPack] = useState<Pack | ''>((['basico', 'experiencia', 'completo'].includes(params.get('pack') ?? '') ? params.get('pack') : '') as Pack | '');
  const [nivel, setNivel] = useState<Nivel | ''>((['standard', 'premium', 'deluxe'].includes(params.get('nivel') ?? '') ? params.get('nivel') : '') as Nivel | '');
  // Borrador creado antes desde el panel: la compra lo activa en lugar de crear otro evento.
  const eventoExistente = /^[0-9a-f-]{36}$/i.test(params.get('evento') ?? '') ? params.get('evento') : null;
  const [metodo, setMetodo] = useState<'mercado_pago' | 'transferencia'>('mercado_pago');
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null);
  const [cargandoPrecio, setCargandoPrecio] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const retorno = useMemo(() => {
    const q = new URLSearchParams();
    if (pack) q.set('pack', pack);
    if (nivel) q.set('nivel', nivel);
    if (eventoExistente) {
      q.set('evento', eventoExistente);
      if (titulo.trim()) q.set('titulo', titulo.trim());
      q.set('tipo', tipo);
      if (fecha) q.set('fecha', fecha);
    }
    return `/contratar?${q.toString()}`;
  }, [pack, nivel, eventoExistente, titulo, tipo, fecha]);

  useEffect(() => {
    setError('');
    if (!pack && !nivel) { setCotizacion(null); return; }
    let vigente = true;
    setCargandoPrecio(true);
    supabase.functions.invoke('cotizar-compra', { body: { gallery_pack: pack || null, invitation_tier: nivel || null } })
      .then(({ data, error: invokeError }) => {
        if (!vigente) return;
        if (invokeError) throw invokeError;
        if (data?.error) throw new Error(data.error);
        setCotizacion(data as Cotizacion);
      })
      .catch((e: unknown) => { if (vigente) { setCotizacion(null); setError(mensajeError(e)); } })
      .finally(() => { if (vigente) setCargandoPrecio(false); });
    return () => { vigente = false; };
  }, [pack, nivel]);

  async function comprar(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!pack && !nivel) return setError('Elegí al menos una invitación o un paquete de galería.');
    if (!sesion || esAnonima(sesion)) return navegar(`/entrar?modo=crear&next=${encodeURIComponent(retorno)}`);
    setEnviando(true);
    const scope = `checkout:${encodeURIComponent([pack, nivel, titulo.trim(), tipo, fecha, eventoExistente ?? ''].join('|'))}`;
    let idempotencyKey = '';
    try { idempotencyKey = sessionStorage.getItem(scope) ?? ''; } catch { /* almacenamiento opcional */ }
    if (!idempotencyKey) idempotencyKey = crypto.randomUUID();
    try { sessionStorage.setItem(scope, idempotencyKey); } catch { /* el servidor sigue protegiendo el pedido */ }
    const { data, error: invokeError } = await supabase.functions.invoke('crear-compra', {
      body: {
        idempotency_key: idempotencyKey,
        event_title: titulo.trim(), event_type: tipo, event_date: fecha || null,
        gallery_pack: pack || null, invitation_tier: nivel || null, payment_method: metodo,
        event_id: eventoExistente,
      },
    });
    setEnviando(false);
    if (invokeError || data?.error) return setError(data?.error ?? mensajeError(invokeError));
    if (data?.payment_method === 'transferencia') { try { sessionStorage.removeItem(scope); } catch { /* almacenamiento opcional */ } return navegar(`/panel/compra/${data.order_id}?pago=transferencia`); }
    let destinoPago: URL;
    try { destinoPago = new URL(data?.url); } catch { return setError('No llegó el enlace seguro de pago. Escribinos para revisar el pedido.'); }
    if (!['mercadopago.com.ar', 'mercadopago.com'].some((dominio) => destinoPago.hostname === dominio || destinoPago.hostname.endsWith(`.${dominio}`))) return setError('El enlace de pago no pertenece a Mercado Pago. Escribinos para revisar el pedido.');
    try { sessionStorage.removeItem(scope); } catch { /* almacenamiento opcional */ }
    window.location.assign(destinoPago.href);
  }

  return (
    <main className="compra-pagina">
      <header className="compra-barra"><Marca /><Link className="compra-volver" to={sesion && !esAnonima(sesion) ? '/panel' : '/'}>{sesion && !esAnonima(sesion) ? 'Mis eventos' : 'Volver'}</Link></header>
      <div className="compra-cabecera"><p className="etiqueta centrada">Tu evento, a tu manera</p><h1>Armá tu propuesta</h1><p>Elegí lo que necesitás. Vas a ver el precio actualizado antes de pagar.</p></div>
      <form className="compra-layout" onSubmit={comprar}>
        <section className="compra-formularios" aria-label="Productos y datos del evento">
          <div className="compra-bloque">
            <div className="compra-paso"><span>1</span><div><h2>Elegí tus productos</h2><p>Podés comprar una sola opción o combinarlas.</p></div></div>
            <fieldset className="compra-opciones">
              <legend>Galería de fotos <small>Opcional</small></legend>
              {[
                ['', 'Sin galería', 'Solo quiero una invitación'],
                ['basico', 'Galería Básica', 'Álbum compartido con QR'],
                ['experiencia', 'Experiencia', 'Galería, pantalla en vivo y trivia'],
                ['completo', 'Completo', 'Experiencia + invitación Estándar incluida'],
              ].map(([value, name, desc]) => <label className={`compra-opcion ${pack === value ? 'seleccionada' : ''}`} key={value || 'ninguna'}>
                <input type="radio" name="pack" checked={pack === value} onChange={() => { setPack(value as Pack | ''); if (value === 'completo') setNivel('standard'); }} />
                <span className="compra-radio" aria-hidden="true" /><span className="compra-opcion-texto"><strong>{name}</strong><small>{desc}</small></span>
                {value === 'completo' && <span className="compra-incluye">Incluye Estándar</span>}
              </label>)}
            </fieldset>
            <fieldset className="compra-opciones">
              <legend>Invitación digital <small>Opcional</small></legend>
              {[
                ['', 'Sin invitación', ''],
                ['standard', 'Estándar', 'Diseño personalizado para compartir'],
                ['premium', 'Premium', 'Más detalles y opciones visuales'],
                ['deluxe', 'Deluxe', 'Experiencia completa y personalizada'],
              ].map(([value, name, desc]) => <label className={`compra-opcion ${nivel === value ? 'seleccionada' : ''}`} key={value || 'ninguna-invitacion'}>
                <input type="radio" name="nivel" checked={nivel === value} disabled={pack === 'completo' && value === ''} onChange={() => setNivel(value as Nivel | '')} />
                <span className="compra-radio" aria-hidden="true" /><span className="compra-opcion-texto"><strong>{name}</strong>{desc && <small>{desc}</small>}</span>
              </label>)}
            </fieldset>
          </div>

          <div className="compra-bloque">
            <div className="compra-paso"><span>2</span><div><h2>Contanos del evento</h2><p>Estos datos identifican la compra y preparan tu galería.</p></div></div>
            <label className="campo"><span>Nombre del evento</span><input required maxLength={120} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Sofía y Martín" /></label>
            <div className="campos-dobles">
              <label className="campo"><span>Tipo de evento</span><select value={tipo} onChange={(e) => setTipo(e.target.value as TipoEvento)}>{tipos.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
              <label className="campo"><span>Fecha <small>Opcional</small></span><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
            </div>
          </div>

          <div className="compra-bloque">
            <div className="compra-paso"><span>3</span><div><h2>Elegí cómo pagar</h2><p>La transferencia queda pendiente hasta que confirmemos la acreditación.</p></div></div>
            <div className="compra-metodos">
              <label className={metodo === 'mercado_pago' ? 'seleccionada' : ''}><input type="radio" name="pago" checked={metodo === 'mercado_pago'} onChange={() => setMetodo('mercado_pago')} /><span><strong>Mercado Pago</strong><small>Pago online seguro</small></span></label>
              <label className={metodo === 'transferencia' ? 'seleccionada' : ''}><input type="radio" name="pago" checked={metodo === 'transferencia'} onChange={() => setMetodo('transferencia')} /><span><strong>Transferencia</strong><small>Te indicamos el alias para transferir</small></span></label>
            </div>
          </div>
        </section>

        <aside className="compra-resumen tarjeta">
          <p className="etiqueta">Resumen</p><h2>Tu compra</h2>
          {cargandoPrecio && <p className="ayuda">Calculando precio…</p>}
          {!cargandoPrecio && cotizacion ? <>
            <ul className="compra-lineas">{cotizacion.productos.map((p, i) => <li key={`${p.codigo}-${i}`}><span>{p.nombre}</span><strong>{dinero(p.precio)}</strong></li>)}</ul>
            {cotizacion.descuento > 0 && <p className="compra-descuento"><span>Descuento del combo</span><strong>−{dinero(cotizacion.descuento)}</strong></p>}
            <div className="compra-total"><span>Total</span><strong>{dinero(cotizacion.total)}</strong></div>
            <p className="compra-legal">El precio se confirma en el servidor al iniciar el pago.</p>
          </> : <div className="compra-resumen-vacio"><span aria-hidden="true">♡</span><p>Elegí una invitación, una galería o ambas para ver el total.</p></div>}
          {error && <p className="error" role="alert">{error}</p>}
          <button className="boton boton-primario boton-grande boton-ancho" disabled={enviando || cargandoPrecio || !cotizacion}>
            {enviando ? 'Preparando compra…' : !sesion || esAnonima(sesion) ? 'Continuar con mi cuenta' : metodo === 'transferencia' ? 'Solicitar transferencia' : 'Continuar al pago'}
          </button>
          {(!sesion || esAnonima(sesion)) && <p className="compra-cuenta">Necesitás una cuenta para consultar tu pedido y completar los datos del evento. <Link to={`/entrar?modo=entrar&next=${encodeURIComponent(retorno)}`}>Ya tengo cuenta</Link></p>}
          <p className="compra-seguridad">🔒 Tus datos se usan para preparar y administrar este pedido.</p>
        </aside>
      </form>
      <PieSitio compacto />
    </main>
  );
}
