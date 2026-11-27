export const MAX_SOURCE_PHOTO_BYTES = 25 * 1024 * 1024;

/** Downscales a photo to JPEG before upload; the server re-encodes it to WebP. */
export async function compressImage(file, maxSide = 1600) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b && b.size <= 4 * 1024 * 1024
            ? resolve(b)
            : reject(Error('Foto hasil kompresi masih terlalu besar. Pilih foto lain.')),
        'image/jpeg',
        0.82
      )
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
