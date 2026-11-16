// Vercel forwards named rewrite captures as query parameters. Keep that private
// routing metadata outside the API's strict query schemas.
function removeRoutingCapture(req) {
  const url = new URL(req.url, 'http://findmew.internal');
  if (url.searchParams.has('__findmew_route')) {
    url.searchParams.delete('__findmew_route');
    req.url = url.pathname + url.search;
  }
  if (req.query && Object.hasOwn(req.query, '__findmew_route')) delete req.query.__findmew_route;
}

/** Reuse the application within a warm Vercel instance without starting a listener. */
export function createServerlessHandler(bootstrap) {
  let pending;
  return async function handleRequest(req, res) {
    try {
      removeRoutingCapture(req);
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
