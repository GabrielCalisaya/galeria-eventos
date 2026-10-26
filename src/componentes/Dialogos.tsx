import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type OpcionesConfirmar = {
  titulo: string;
  mensaje?: ReactNode;
  aceptar?: string;
  cancelar?: string;
  peligro?: boolean;
};

type Aviso = { id: number; texto: string; tipo: 'ok' | 'error' };

type Contexto = {
  confirmar: (o: OpcionesConfirmar) => Promise<boolean>;
  avisar: (texto: string, tipo?: 'ok' | 'error') => void;
};

const Ctx = createContext<Contexto | null>(null);

/** Modales de confirmación y avisos breves, propios de la app (sin los diálogos del navegador). */
export function DialogosProvider({ children }: { children: ReactNode }) {
  const [pedido, setPedido] = useState<(OpcionesConfirmar & { resolver: (v: boolean) => void }) | null>(null);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const siguienteId = useRef(1);

  const confirmar = useCallback(
    (o: OpcionesConfirmar) => new Promise<boolean>((resolver) => setPedido({ ...o, resolver })),
    [],
  );

  const avisar = useCallback((texto: string, tipo: 'ok' | 'error' = 'ok') => {
    const id = siguienteId.current++;
    setAvisos((prev) => [...prev, { id, texto, tipo }]);
    setTimeout(() => setAvisos((prev) => prev.filter((a) => a.id !== id)), 3200);
  }, []);

  const cerrar = (valor: boolean) => {
    pedido?.resolver(valor);
    setPedido(null);
  };

  return (
    <Ctx.Provider value={{ confirmar, avisar }}>
      {children}
      {pedido && (
        <Modal titulo={pedido.titulo} onCerrar={() => cerrar(false)}>
          {pedido.mensaje && <div className="modal-mensaje">{pedido.mensaje}</div>}
          <div className="modal-acciones">
            <button type="button" className="boton" onClick={() => cerrar(false)}>
              {pedido.cancelar ?? 'Cancelar'}
            </button>
            <button
              type="button"
              className={pedido.peligro ? 'boton boton-peligro' : 'boton boton-primario'}
              onClick={() => cerrar(true)}
              autoFocus
            >
              {pedido.aceptar ?? 'Aceptar'}
            </button>
          </div>
        </Modal>
      )}
      <div className="avisos" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className={`aviso aviso-${a.tipo}`}>
            <span aria-hidden="true">{a.tipo === 'ok' ? '✓' : '!'}</span> {a.texto}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useDialogos(): Contexto {
  const c = useContext(Ctx);
  if (!c) throw new Error('useDialogos necesita DialogosProvider');
  return c;
}

/** Ventana modal accesible: cierra con Escape o tocando afuera, y devuelve el foco al salir. */
export function Modal({
  titulo,
  children,
  onCerrar,
  ancho = 'normal',
}: {
  titulo: string;
  children: ReactNode;
  onCerrar: () => void;
  ancho?: 'normal' | 'grande';
}) {
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
      if (e.key === 'Tab' && caja.current) {
        const enfocables = caja.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (enfocables.length === 0) return;
        const primero = enfocables[0];
        const ultimo = enfocables[enfocables.length - 1];
        if (e.shiftKey && document.activeElement === primero) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primero.focus();
        }
      }
    };
    document.addEventListener('keydown', tecla);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!caja.current?.contains(document.activeElement)) caja.current?.focus();
    return () => {
      document.removeEventListener('keydown', tecla);
      document.body.style.overflow = overflow;
      previo?.focus?.();
    };
  }, [onCerrar]);

  return (
    <div className="modal-fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div
        ref={caja}
        className={ancho === 'grande' ? 'modal modal-grande' : 'modal'}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
      >
        <div className="modal-cabecera">
          <h2>{titulo}</h2>
          <button type="button" className="modal-cerrar" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
