import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import EncabezadoPanel from '../componentes/EncabezadoPanel';
import { supabase } from '../lib/supabase';

type PagoTransferencia = { id: string; metodo: string; estado: string; numero_transferencia: string | null; monto: number; moneda: string; created_at: string };
type CompraTransferencia = {
  id: string; user_id: string; event_id: string | null; titulo_evento: string; tipo_evento: string; fecha_evento: string | null;
  gallery_pack: string | null; invitation_tier: string | null; productos: Array<{ tipo: string; nombre: string }>;
  total: number; moneda: string; created_at: string; compra_pagos: PagoTransferencia[];
};
const dinero = (n: number, moneda: string) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: moneda, maximumFractionDigits: 0 }).format(Number(n));
const fecha = (value: string) => new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export default function AdministrarTransferencias() {
  const [compras, setCompras] = useState<CompraTransferencia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    const { data, error: invokeError } = await supabase.functions.invoke('administrar-transferencias', { method: 'GET' });
    setCargando(false);
    if (invokeError || data?.error) {
      setError(data?.error ?? 'No se pudieron cargar las transferencias pendientes.');
      return;
    }
    setCompras((data?.compras ?? []) as CompraTransferencia[]);
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  async function confirmar(compra: CompraTransferencia) {
    const aceptar = window.confirm(`¿Confirmaste en tu cuenta bancaria la acreditación de ${dinero(compra.total, compra.moneda)} para “${compra.titulo_evento}”?`);
    if (!aceptar) return;
    setActualizando(compra.id);
    setError('');
    setAviso('');
    const { data, error: invokeError } = await supabase.functions.invoke('administrar-transferencias', { body: { compra_id: compra.id } });
    setActualizando(null);
    if (invokeError || data?.error) {
      setError(data?.error ?? 'No se pudo confirmar la transferencia.');
      return;
    }
    setAviso(`Transferencia de “${compra.titulo_evento}” confirmada.${compra.event_id ? ' La galería quedó activada.' : ''}${data?.email_enviado === false ? ' No pudimos enviar el correo de confirmación.' : ' Se envió el correo de confirmación.'}`);
    await cargar();
  }

  return (
    <main className="panel">
      <EncabezadoPanel />
      <div className="panel-columna administracion-transferencias">
        <Link className="volver" to="/panel">← Mis eventos</Link>
        <div className="fila-titulo">
          <div><p className="etiqueta">Administración</p><h1>Transferencias pendientes</h1><p>Verificá la acreditación en la cuenta bancaria antes de confirmar.</p></div>
          <button type="button" className="boton" onClick={() => void cargar()} disabled={cargando}>Actualizar lista</button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {aviso && <p className="compra-alerta" role="status">{aviso}</p>}
        {cargando && <div className="cargando" aria-busy="true" />}
        {!cargando && !error && compras.length === 0 && <div className="vacio"><p>No hay transferencias pendientes de confirmación.</p></div>}
        {!cargando && compras.length > 0 && <ul className="admin-transferencias-lista">
          {compras.map((compra) => {
            const pago = compra.compra_pagos?.[0];
            return <li className="tarjeta admin-transferencia" key={compra.id}>
              <div className="admin-transferencia-datos">
                <p className="etiqueta">Referencia · {compra.id.slice(0, 8).toUpperCase()}</p>
                <h2>{compra.titulo_evento}</h2>
                <p>{compra.fecha_evento ? `${compra.fecha_evento} · ` : ''}Pedido {fecha(compra.created_at)}</p>
                <p>Incluye: {(compra.productos ?? []).map((producto) => producto.nombre).join(' + ')}</p>
                {pago?.numero_transferencia && <p>Número para transferir: <strong>{pago.numero_transferencia}</strong></p>}
                {compra.event_id && <p>Evento: <code>{compra.event_id}</code></p>}
              </div>
              <div className="admin-transferencia-accion">
                <strong>{dinero(compra.total, compra.moneda)}</strong>
                <button type="button" className="boton boton-primario" disabled={actualizando !== null} onClick={() => void confirmar(compra)}>
                  {actualizando === compra.id ? 'Confirmando…' : 'Confirmar acreditación'}
                </button>
              </div>
            </li>;
          })}
        </ul>}
      </div>
    </main>
  );
}
