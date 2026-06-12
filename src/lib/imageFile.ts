// Util de cliente: convertir un File a un data URL cuadrado y comprimido.
// Lo usan la foto de perfil y la "Foto trucha" del modo Diversión.

export const SQUARE_IMAGE_SIZE = 256; // px del lado del cuadrado final

/** Lee un File, lo recorta al centro en un cuadrado y lo comprime a JPEG data URL. */
export function fileToSquareDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("La imagen no es válida."));
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = SQUARE_IMAGE_SIZE;
        canvas.height = SQUARE_IMAGE_SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("No se pudo procesar la imagen."));
        ctx.drawImage(img, sx, sy, side, side, 0, 0, SQUARE_IMAGE_SIZE, SQUARE_IMAGE_SIZE);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
