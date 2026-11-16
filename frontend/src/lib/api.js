export const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
let tokenProvider = async () => null;
export function setTokenProvider(provider) {
  tokenProvider = provider;
}
export async function request(
  path,
  { method = 'GET', body, key, publicRequest = false, blob = false, signal } = {}
) {
  if (method !== 'GET' && !navigator.onLine)
    throw new Error('Kamu sedang offline. Sambungkan internet untuk melakukan aksi ini.');
  const token = publicRequest ? null : await tokenProvider();
  let response;
  try {
    response = await fetch(`${API}/api${path}`, {
      method,
      signal:
        signal ||
        (typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(30000) : undefined),
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...(key ? { 'Idempotency-Key': key } : {}),
      },
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    window.dispatchEvent(new Event('findmew:unreachable'));
    throw new Error('Server belum dapat dijangkau. Periksa koneksi lalu coba lagi.');
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const error = new Error(payload?.error?.message || 'Permintaan belum berhasil. Coba lagi.');
    error.status = response.status;
    error.code = payload?.error?.code;
    if (response.status === 401) window.dispatchEvent(new Event('findmew:expired'));
    throw error;
  }
  return blob ? response.blob() : response.json();
}
