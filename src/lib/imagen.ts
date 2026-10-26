// Compresión en el celular antes de subir: menos datos con mala señal
// y menos almacenamiento. Genera la foto (lado mayor 2048 px) y la miniatura (480 px).

const LADO_FOTO = 2048;
const LADO_MINIATURA = 480;

export type ImagenProcesada = {
  foto: Blob;
  miniatura: Blob;
  ancho: number;
  alto: number;
};

async function decodificar(archivo: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      // Respeta la orientación EXIF (fotos verticales del celular).
      return await createImageBitmap(archivo, { imageOrientation: 'from-image' });
    } catch {
      // Algunos navegadores no aceptan opciones o el formato; se intenta con <img>.
    }
  }
  const url = URL.createObjectURL(archivo);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function aBlob(canvas: HTMLCanvasElement, calidad: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la foto'))),
      'image/jpeg',
      calidad,
    );
  });
}

function dibujar(fuente: CanvasImageSource, ancho: number, alto: number, ladoMax: number) {
  const escala = Math.min(1, ladoMax / Math.max(ancho, alto));
  const w = Math.round(ancho * escala);
  const h = Math.round(alto * escala);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('El navegador no permite procesar fotos');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(fuente, 0, 0, w, h);
  return { canvas, w, h };
}

export async function procesarImagen(archivo: File): Promise<ImagenProcesada> {
  const fuente = await decodificar(archivo);
  const anchoOriginal = 'naturalWidth' in fuente ? fuente.naturalWidth : fuente.width;
  const altoOriginal = 'naturalHeight' in fuente ? fuente.naturalHeight : fuente.height;
  try {
    const grande = dibujar(fuente, anchoOriginal, altoOriginal, LADO_FOTO);
    const foto = await aBlob(grande.canvas, 0.8);
    const chica = dibujar(grande.canvas, grande.w, grande.h, LADO_MINIATURA);
    const miniatura = await aBlob(chica.canvas, 0.72);
    return { foto, miniatura, ancho: grande.w, alto: grande.h };
  } finally {
    if ('close' in fuente) fuente.close();
  }
}
