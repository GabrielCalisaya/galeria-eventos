import { useEffect, useState, type ReactNode } from 'react';
import { urlPublica } from '../lib/supabase';
import type { Media } from '../lib/tipos';

type Props = {
  fotos: Media[];
  /** Contenido extra sobre cada miniatura (por ejemplo, el botón de ocultar). */
  acciones?: (foto: Media) => ReactNode;
};

export default function Galeria({ fotos, acciones }: Props) {
  const [abierta, setAbierta] = useState<number | null>(null);

  return (
    <>
      <ul className="grilla">
        {fotos.map((f, i) => (
          <li key={f.id} className={f.oculta ? 'grilla-item oculta' : 'grilla-item'}>
            <button
              type="button"
              className="grilla-foto"
              onClick={() => setAbierta(i)}
              aria-label={`Foto de ${f.autor_nombre}`}
            >
              <img src={urlPublica(f.key_thumb)} alt="" loading="lazy" decoding="async" />
            </button>
            {acciones?.(f)}
          </li>
        ))}
      </ul>
      {abierta !== null && fotos[abierta] && (
        <Visor
          fotos={fotos}
          indice={abierta}
          onCambiar={setAbierta}
          onCerrar={() => setAbierta(null)}
        />
      )}
    </>
  );
}

function Visor({
  fotos,
  indice,
  onCambiar,
  onCerrar,
}: {
  fotos: Media[];
  indice: number;
  onCambiar: (i: number) => void;
  onCerrar: () => void;
}) {
  const foto = fotos[indice];
  const anterior = () => indice > 0 && onCambiar(indice - 1);
  const siguiente = () => indice < fotos.length - 1 && onCambiar(indice + 1);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
      if (e.key === 'ArrowLeft') anterior();
      if (e.key === 'ArrowRight') siguiente();
    };
    window.addEventListener('keydown', tecla);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', tecla);
      document.body.style.overflow = '';
    };
  });

  // Deslizar con el dedo para pasar de foto.
  const [inicioX, setInicioX] = useState<number | null>(null);

  return (
    <div className="visor" role="dialog" aria-modal="true" aria-label="Foto ampliada">
      <img
        className="visor-foto"
        src={urlPublica(foto.key_original)}
        alt={`Foto de ${foto.autor_nombre}`}
        onTouchStart={(e) => setInicioX(e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (inicioX === null) return;
          const dx = e.changedTouches[0].clientX - inicioX;
          if (dx > 50) anterior();
          if (dx < -50) siguiente();
          setInicioX(null);
        }}
      />
      <div className="visor-barra">
        <span className="visor-autor">{foto.autor_nombre}</span>
        <a className="visor-boton" href={urlPublica(foto.key_original)} download target="_blank" rel="noreferrer">
          Descargar
        </a>
        <button type="button" className="visor-boton" onClick={onCerrar}>
          Cerrar
        </button>
      </div>
      {indice > 0 && (
        <button type="button" className="visor-flecha izquierda" onClick={anterior} aria-label="Foto anterior">
          ‹
        </button>
      )}
      {indice < fotos.length - 1 && (
        <button type="button" className="visor-flecha derecha" onClick={siguiente} aria-label="Foto siguiente">
          ›
        </button>
      )}
    </div>
  );
}
