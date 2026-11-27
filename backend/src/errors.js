export class AppError extends Error {
  constructor(code, message, status = 400, options = {}) {
    super(message, options);
    this.code = code;
    this.status = status;
    this.retryAfter = options.retryAfter;
  }
}
const messages = {
  FOOD_EMPTY: ['Mangkuk kosong. Beli makanan di Store untuk memberi makan MyMew.', 409],
  FEED_COOLDOWN: ['MyMew baru saja makan. Tunggu 30 detik sebelum memberi makan lagi.', 409],
  ARCHIVED_PRODUCT: [
    'Barang koleksi klasik ini sudah tidak dijual. Barang yang dimiliki tetap tersimpan di tas.',
    409,
  ],
  INVALID_LOADOUT: ['Pilih maksimal satu aksesoris kepala dan satu kacamata yang valid.', 400],
  NOT_FOUND: ['Data tidak ditemukan.', 404],
  INSUFFICIENT_COINS: ['Koinmu belum cukup. Temukan Mew lagi, yuk!', 409],
  OUT_OF_STOCK: ['Barang ini belum ada di tasmu.', 409],
  ALREADY_OWNED: ['Aksesoris ini sudah kamu miliki.', 409],
  PLAY_COOLDOWN: ['Mochi istirahat sebentar. Coba lagi dalam 30 detik.', 429],
  REQUEST_CONFLICT: ['Identitas permintaan sudah dipakai untuk aksi berbeda.', 409],
  REQUEST_ALREADY_USED: ['Foto dari permintaan ini sudah dihapus. Ambil foto baru.', 409],
  UPLOAD_NOT_READY: ['Upload belum siap. Silakan coba lagi.', 409],
  OWN_COLLECTION_LIKE: ['Like hanya untuk koleksi penjelajah lain.', 409],
  INVALID_LIKE: ['Status like tidak valid.', 400],
};
export function databaseError(error) {
  for (const [code, [message, status]] of Object.entries(messages))
    if (error.message?.includes(code)) return new AppError(code, message, status);
  if (error.code === '23505')
    return new AppError('CONFLICT', 'Username atau data tersebut sudah digunakan.', 409);
  return new AppError(
    'DATABASE_ERROR',
    'Database belum dapat memproses permintaan. Periksa konfigurasi dan coba lagi.',
    503
  );
}
export const fail = (code) => {
  const [message, status] = messages[code] || [code, 400];
  throw new AppError(code, message, status);
};
