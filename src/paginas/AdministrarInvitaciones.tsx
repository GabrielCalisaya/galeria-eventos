import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import EncabezadoPanel from '../componentes/EncabezadoPanel';
import { supabase } from '../lib/supabase';

type CompraInvitacion = {
  id: string; titulo_evento: string; tipo_evento: string; tipo_invitacion: string | null; fecha_evento: string | null;
  invitation_tier: string; estado: string; datos_invitacion: Record<string, string>; datos_completos: boolean;
  url_invitacion: string | null; wordpress_url: string | null; wordpress_edit_url: string | null;
  invitacion_sync_estado: string; invitacion_sync_error: string | null; wordpress_event_id: number | null;
};

export default function AdministrarInvitaciones() {
  const [compras, setCompras] = useState<CompraInvitacion[]>([]);
  const [enlaces, setEnlaces] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    const { data, error: invokeError } = await supabase.functions.invoke('administrar-invitaciones', { method: 'GET' });
    setCargando(false);
    if (invokeError || data?.error) { setError(data?.error ?? 'No se pudieron cargar las invitaciones.'); return; }
    const rows = (data?.compras ?? []) as CompraInvitacion[];
    setCompras(rows);
    setEnlaces((old) => Object.fromEntries(rows.map((row) => [row.id, old[row.id] ?? row.url_invitacion ?? row.wordpress_url ?? ''])));
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  async function accion(compra: CompraInvitacion, accion: 'reintentar' | 'entregar') {
    setActualizando(compra.id); setError(''); setAviso('');
    const { data, error: invokeError } = await supabase.functions.invoke('administrar-invitaciones', {
      body: { compra_id: compra.id, accion, ...(accion === 'entregar' ? { url_invitacion: enlaces[compra.id] } : {}) },
    });
    setActualizando(null);
    if (invokeError || data?.error) { setError(data?.error ?? 'No se pudo actualizar el pedido.'); return; }
    setAviso(accion === 'entregar' ? `La invitación de “${compra.titulo_evento}” quedó entregada.` : `Se preparó el borrador de “${compra.titulo_evento}”.`);
    await cargar();
  }

  return <main className="panel"><EncabezadoPanel /><div className="panel-columna administracion-transferencias">
    <Link className="volver" to="/panel">← Mis eventos</Link>
    <div className="fila-titulo"><div><p className="etiqueta">Administración</p><h1>Invitaciones compradas</h1><p>Revisá las fichas, abrí el editor visual de WordPress y registrá la entrega.</p></div><button type="button" className="boton" onClick={() => void cargar()} disabled={cargando}>Actualizar lista</button></div>
    {error && <p className="error" role="alert">{error}</p>}{aviso && <p className="compra-alerta" role="status">{aviso}</p>}
    {cargando && <div className="cargando" aria-busy="true" />}
    {!cargando && !error && compras.length === 0 && <div className="vacio"><p>No hay invitaciones pagadas para preparar.</p></div>}
    {!cargando && compras.map((compra) => <article className="tarjeta admin-transferencia" key={compra.id}>
      <div className="admin-transferencia-datos"><p className="etiqueta">Pedido · {compra.id.slice(0, 8).toUpperCase()}</p><h2>{compra.titulo_evento}</h2><p>{compra.fecha_evento ?? 'Sin fecha'} · {compra.tipo_invitacion ?? 'Formato pendiente'} · {compra.invitation_tier}</p><p>Estado: <strong>{compra.estado === 'entregada' ? 'Entregada' : compra.invitacion_sync_estado === 'preparando' ? 'Borrador preparado' : compra.invitacion_sync_estado === 'error' ? 'Requiere reintento' : 'Ficha pendiente'}</strong></p>
        {compra.datos_completos && <details><summary>Revisar ficha recibida</summary><dl>{Object.entries(compra.datos_invitacion ?? {}).filter(([, value]) => value).map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{value}</dd></div>)}</dl></details>}
        {compra.invitacion_sync_error && <p className="error">{compra.invitacion_sync_error}</p>}
        {!compra.datos_completos && <p>La ficha todavía no está completa. El pedido se sincronizará cuando el cliente la envíe.</p>}
        {compra.wordpress_edit_url && <p><a href={compra.wordpress_edit_url} target="_blank" rel="noreferrer">Abrir editor visual de la invitación ↗</a></p>}
        {compra.wordpress_url && <p><a href={compra.wordpress_url} target="_blank" rel="noreferrer">Ver página pública ↗</a> (se habilita al terminarla en WordPress)</p>}
        {compra.estado !== 'entregada' && <>
          {compra.datos_completos && !compra.wordpress_event_id && <button type="button" className="boton" disabled={actualizando === compra.id} onClick={() => void accion(compra, 'reintentar')}>{actualizando === compra.id ? 'Preparando…' : 'Reintentar preparación'}</button>}
          {compra.wordpress_event_id && <form className="formulario" onSubmit={(event) => { event.preventDefault(); void accion(compra, 'entregar'); }}><label className="campo"><span>Enlace final para el cliente</span><input type="url" required value={enlaces[compra.id] ?? ''} onChange={(event) => setEnlaces((old) => ({ ...old, [compra.id]: event.target.value }))} placeholder="https://invitaciones.newtech.net.ar/…" /></label><button type="submit" className="boton boton-primario" disabled={actualizando === compra.id}>{actualizando === compra.id ? 'Guardando…' : 'Registrar entrega'}</button></form>}
        </>}
        {compra.estado === 'entregada' && compra.url_invitacion && <p><a href={compra.url_invitacion} target="_blank" rel="noreferrer">Abrir invitación entregada ↗</a></p>}
      </div>
    </article>)}
  </div></main>;
}
