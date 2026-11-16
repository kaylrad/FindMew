/** Reuse the application within a warm Vercel instance without starting a listener. */
export function createServerlessHandler(bootstrap) {
  let pending;
  return async function handleRequest(req, res) {
    try {
      pending ||= Promise.resolve()
        .then(bootstrap)
        .catch((error) => {
          pending = undefined;
          throw error;
        });
      const app = await pending;
      return app(req, res);
    } catch {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(
        JSON.stringify({
          error: { code: 'NOT_READY', message: 'Layanan belum siap. Silakan coba lagi.' },
        })
      );
    }
  };
}
