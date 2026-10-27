import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import EncabezadoPanel from '../componentes/EncabezadoPanel';
import { invocar } from '../lib/funciones';
import './compra-evento.css';

type Transferencia = {
  id: string; event_id: string | null; titulo_evento: string; fecha_evento: string | null;
  productos: Array<{ nombre: string }>; total: number; moneda: string; created_at: string;
  compra_pagos: Array<{ numero_transferencia: string | null }>;
};
type Pedido = {
  id: string; email: string; titulo_evento: string; fecha_evento: string | null; invitation_tier: string;
  estado: string; datos_invitacion: Record<string, string> | null; datos_completos: boolean; url_invitacion: string | null; created_at: string;
};

const dinero = (n: number, moneda: string) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: moneda, maximumFractionDigits: 0 }).format(Number(n));
const fecha = (value: string) => new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const NIVELES: Record<string, string> = { standard: 'Estándar', premium: 'Premium', deluxe: 'Deluxe' };
const ESTADOS: Record<string, string> = {
  transferencia_pendiente: 'Transferencia sin confirmar', pagada: 'Pagada · por preparar', preparando: 'En preparación', entregada: 'Entregada',
};
const ETIQUETAS: Record<string, string> = {
  nombres: 'Nombres', hora: 'Horario', lugar: 'Lugar', direccion: 'Dirección', mapa: 'Mapa', frase: 'Frase',
  cronograma: 'Cronograma', vestimenta: 'Vestimenta', regalos: 'Regalos', alias_regalo: 'Alias para regalos',
  titular_regalo: 'Titular', rsvp: 'Confirmación', whatsapp: 'WhatsApp', colores: 'Colores o estilo',
  galeria_bienvenida: 'Bienvenida de la galería', notas: 'Notas', preguntas_trivia: 'Preguntas de trivia',
};

/** Administración de NewTech: confirmar transferencias y seguir las invitaciones. El servidor valida el acceso en cada llamada. */
export default function Administracion() {
  const [transferencias, setTransferencias] = useState<Transferencia[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [urls, setUrls] = useState<Record<string, string>>({});

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const [t, p] = await Promise.all([
        invocar<{ compras: Transferencia[] }>('administrar-transferencias?vista=transferencias'),
        invocar<{ pedidos: Pedido[] }>('administrar-transferencias?vista=pedidos'),
      ]);
      setTransferencias(t.compras ?? []);
      setPedidos(p.pedidos ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  async function ejecutar(clave: string, accion: () => Promise<string>) {
    setOcupado(clave);
    setError('');
    setAviso('');
    try {
      setAviso(await accion());
      await cargar();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  function confirmar(t: Transferencia) {
    if (!window.confirm(`¿Verificaste en tu cuenta la acreditación de ${dinero(t.total, t.moneda)} para “${t.titulo_evento}”?`)) return;
    void ejecutar(t.id, async () => {
      await invocar('administrar-transferencias', { compra_id: t.id });
      return `Transferencia de “${t.titulo_evento}” confirmada.${t.event_id ? ' La galería quedó activa.' : ''}`;
    });
  }

  function cambiarEstado(p: Pedido, estado: 'preparando' | 'entregada') {
    const url = (urls[p.id] ?? p.url_invitacion ?? '').trim();
    void ejecutar(p.id, async () => {
      const r = await invocar<{ correo_enviado?: boolean }>('administrar-transferencias', { compra_id: p.id, accion: 'estado', estado, url_invitacion: url });
      if (estado === 'preparando') return `“${p.titulo_evento}” quedó en preparación.`;
      return `“${p.titulo_evento}” quedó entregada.${r.correo_enviado ? ' Le avisamos al cliente por correo.' : ''}`;
    });
  }

  return (
    <main className="panel">
      <EncabezadoPanel />
      <div className="panel-columna administracion-transferencias">
        <Link className="volver" to="/panel">← Mis eventos</Link>
        <div className="fila-titulo">
          <div><p className="etiqueta">Administración</p><h1>Pedidos</h1></div>
          <button type="button" className="boton" onClick={() => void cargar()} disabled={cargando}>Actualizar</button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {aviso && <p className="compra-alerta" role="status">{aviso}</p>}
        {cargando && <div className="cargando" aria-busy="true" />}

        {!cargando && !error && <>
          <h2>Transferencias por confirmar</h2>
          <p className="ayuda">Verificá la acreditación en tu cuenta antes de confirmar.</p>
          {transferencias.length === 0 ? <div className="vacio"><p>No hay transferencias pendientes.</p></div> : (
            <ul className="admin-transferencias-lista">
              {transferencias.map((t) => (
                <li className="tarjeta admin-transferencia" key={t.id}>
                  <div className="admin-transferencia-datos">
                    <p className="etiqueta">Referencia · {t.id.slice(0, 8).toUpperCase()}</p>
                    <h3>{t.titulo_evento}</h3>
                    <p>{t.fecha_evento ? `${t.fecha_evento} · ` : ''}Pedido {fecha(t.created_at)}</p>
                    <p>Incluye: {(t.productos ?? []).map((x) => x.nombre).join(' + ')}</p>
                    {t.compra_pagos?.[0]?.numero_transferencia && <p>Alias: <strong>{t.compra_pagos[0].numero_transferencia}</strong></p>}
                  </div>
                  <div className="admin-transferencia-accion">
                    <strong>{dinero(t.total, t.moneda)}</strong>
                    <button type="button" className="boton boton-primario" disabled={ocupado !== null} onClick={() => confirmar(t)}>
                      {ocupado === t.id ? 'Confirmando…' : 'Confirmar acreditación'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <h2>Invitaciones</h2>
          <p className="ayuda">La ficha que completó cada cliente. Al entregar, pegá la URL final: el cliente la ve en su pedido y le llega por correo.</p>
          {pedidos.length === 0 ? <div className="vacio"><p>Todavía no hay pedidos de invitación.</p></div> : (
            <ul className="admin-transferencias-lista">
              {pedidos.map((p) => {
                const datos = Object.entries(p.datos_invitacion ?? {}).filter(([, v]) => v);
                return (
                  <li className="tarjeta admin-pedido" key={p.id}>
                    <div className="admin-transferencia-datos">
                      <p className="etiqueta">{NIVELES[p.invitation_tier] ?? p.invitation_tier} · {ESTADOS[p.estado] ?? p.estado}</p>
                      <h3>{p.titulo_evento}</h3>
                      <p>{p.fecha_evento ? `${p.fecha_evento} · ` : ''}{p.email} · Referencia {p.id.slice(0, 8).toUpperCase()}</p>
                      {datos.length === 0 ? <p className="ayuda">El cliente todavía no completó la ficha.</p> : (
                        <details>
                          <summary>{p.datos_completos ? 'Ficha completa' : 'Ficha en borrador'} ({datos.length} datos)</summary>
                          <dl className="admin-ficha">
                            {datos.map(([k, v]) => <div key={k}><dt>{ETIQUETAS[k] ?? k}</dt><dd>{v}</dd></div>)}
                          </dl>
                        </details>
                      )}
                      {p.url_invitacion && <p>Invitación: <a href={p.url_invitacion} target="_blank" rel="noreferrer">{p.url_invitacion}</a></p>}
                    </div>
                    {['pagada', 'preparando', 'entregada'].includes(p.estado) && (
                      <div className="admin-pedido-acciones">
                        {p.estado === 'pagada' && (
                          <button type="button" className="boton" disabled={ocupado !== null} onClick={() => cambiarEstado(p, 'preparando')}>Marcar en preparación</button>
                        )}
                        <label className="campo">
                          <span>URL final de la invitación</span>
                          <input type="url" placeholder="https://invitaciones.newtech.net.ar/…" value={urls[p.id] ?? p.url_invitacion ?? ''} onChange={(e) => setUrls((u) => ({ ...u, [p.id]: e.target.value }))} />
                        </label>
                        <button type="button" className="boton boton-primario" disabled={ocupado !== null || !(urls[p.id] ?? p.url_invitacion ?? '').trim()} onClick={() => cambiarEstado(p, 'entregada')}>
                          {ocupado === p.id ? 'Guardando…' : p.estado === 'entregada' ? 'Actualizar URL' : 'Marcar entregada'}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>}
      </div>
    </main>
  );
}
