// Compresión en el celular antes de subir: menos datos con mala señal
// y menos almacenamiento. Genera la foto (lado mayor 1920 px) y la miniatura (480 px).
//
// Cuidados para celulares:
// - Los canvas se liberan apenas se usan: iPhone tiene un tope de memoria para canvas
//   y, si se acumulan, deja de procesar fotos después de unas cuantas.
// - Si el navegador puede, decodifica la foto ya achicada (menos memoria con fotos de 50+ MP).
// - Las fotos HEIC/HEIF que el navegador no sabe leer se convierten con heic2any (se carga solo si hace falta).

const LADO_FOTO = 1920;
const LADO_MINIATURA = 480;

export type ImagenProcesada = {
  foto: Blob;
  miniatura: Blob;
  ancho: number;
  alto: number;
};

type Fuente = ImageBitmap | HTMLImageElement;

const esHeic = (a: Blob & { name?: string }) =>
  /image\/hei[cf]/i.test(a.type) || /\.(heic|heif)$/i.test(a.name ?? '');

async function conImg(archivo: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(archivo);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // La imagen ya decodificada sigue disponible para dibujarla.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

async function decodificar(archivo: Blob): Promise<Fuente> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(archivo, { imageOrientation: 'from-image' });
    } catch {
      // Fotos muy grandes (50–200 MP) pueden no entrar en memoria: decodificar ya achicada.
      try {
        return await createImageBitmap(archivo, { imageOrientation: 'from-image', resizeWidth: LADO_FOTO, resizeQuality: 'high' });
      } catch {
        // Algunos navegadores no aceptan opciones o el formato; se intenta con <img>.
      }
    }
  }
  return conImg(archivo);
}

async function heicAJpeg(archivo: Blob): Promise<Blob> {
  const { default: heic2any } = await import('heic2any');
  const r = await heic2any({ blob: archivo, toType: 'image/jpeg', quality: 0.85 });
  return Array.isArray(r) ? r[0] : r;
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

function liberar(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

function dibujar(fuente: CanvasImageSource, ancho: number, alto: number, ladoMax: number) {
  const escala = Math.min(1, ladoMax / Math.max(ancho, alto));
  const w = Math.max(1, Math.round(ancho * escala));
  const h = Math.max(1, Math.round(alto * escala));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    liberar(canvas);
    throw new Error('El navegador no permite procesar fotos');
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(fuente, 0, 0, w, h);
  return { canvas, w, h };
}

async function comprimir(archivo: Blob): Promise<ImagenProcesada> {
  const fuente = await decodificar(archivo);
  const anchoOriginal = 'naturalWidth' in fuente ? fuente.naturalWidth : fuente.width;
  const altoOriginal = 'naturalHeight' in fuente ? fuente.naturalHeight : fuente.height;
  if (!anchoOriginal || !altoOriginal) throw new Error('Foto vacía');
  let grande: ReturnType<typeof dibujar> | undefined;
  let chica: ReturnType<typeof dibujar> | undefined;
  try {
    grande = dibujar(fuente, anchoOriginal, altoOriginal, LADO_FOTO);
    if ('close' in fuente) fuente.close();
    const foto = await aBlob(grande.canvas, 0.78);
    chica = dibujar(grande.canvas, grande.w, grande.h, LADO_MINIATURA);
    const miniatura = await aBlob(chica.canvas, 0.7);
    return { foto, miniatura, ancho: grande.w, alto: grande.h };
  } finally {
    if ('close' in fuente) fuente.close();
    if (grande) liberar(grande.canvas);
    if (chica) liberar(chica.canvas);
  }
}

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function procesarImagen(archivo: File): Promise<ImagenProcesada> {
  try {
    return await comprimir(archivo);
  } catch (primerError) {
    // HEIC que el navegador no sabe leer (Android/Chrome): convertir y volver a intentar.
    if (esHeic(archivo)) {
      try {
        return await comprimir(await heicAJpeg(archivo));
      } catch {
        /* sigue abajo */
      }
    }
    // Falta de memoria momentánea: esperar a que el navegador libere y probar otra vez.
    await pausa(1500);
    try {
      return await comprimir(archivo);
    } catch {
      throw primerError;
    }
  }
}
