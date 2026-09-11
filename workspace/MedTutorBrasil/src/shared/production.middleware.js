const zlib = require('zlib');

function apiRateLimit({ windowMs = 60_000, maxRequests = 120 } = {}) {
  const clients = new Map();
  let lastCleanup = Date.now();

  return (req, res, next) => {
    if (!req.pathname?.startsWith('/api/') && !req.url?.startsWith('/api/')) return next();

    const now = Date.now();
    const clientId = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
    const record = clients.get(clientId);
    const current = !record || now >= record.resetAt
      ? { count: 0, resetAt: now + windowMs }
      : record;

    current.count += 1;
    clients.set(clientId, current);
    res.setHeader('RateLimit-Limit', String(maxRequests));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, maxRequests - current.count)));

    if (current.count > maxRequests) {
      res.setHeader('Retry-After', String(Math.ceil((current.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'Muitas requisições. Tente novamente em instantes.' });
    }

    if (now - lastCleanup > windowMs) {
      lastCleanup = now;
      for (const [key, value] of clients) if (now >= value.resetAt) clients.delete(key);
    }
    next();
  };
}

function staticCacheHeaders(req, res, next) {
  const path = req.pathname || new URL(req.url, 'http://localhost').pathname;
  if (path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
  } else if (/^(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(req.headers.host || '')) {
    // Durante desenvolvimento, nunca reutilize bundles antigos após uma alteração.
    res.setHeader('Cache-Control', 'no-store, max-age=0');
  } else if (path === '/' || path.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-cache');
  } else if (/\.(?:js|css|svg|png|jpe?g|webp|ico|woff2?)$/i.test(path)) {
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  }
  next();
}

function compression(req, res, next) {
  const acceptEncoding = req.headers['accept-encoding'] || '';
  const encoding = /\bbr\b/.test(acceptEncoding) && zlib.brotliCompress ? 'br'
    : /\bgzip\b/.test(acceptEncoding) ? 'gzip'
      : null;
  if (!encoding || req.method === 'HEAD') return next();

  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);
  const chunks = [];
  let passthrough = false;
  const canCompress = () => /(?:text|json|javascript|xml|svg)/i.test(String(res.getHeader?.('Content-Type') || res.getHeader?.('content-type') || ''));

  res.write = (chunk, chunkEncoding, callback) => {
    if (!canCompress()) {
      passthrough = true;
      return originalWrite(chunk, chunkEncoding, callback);
    }
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, chunkEncoding));
    if (typeof callback === 'function') callback();
    return true;
  };

  res.end = (chunk, chunkEncoding, callback) => {
    if (passthrough || !canCompress()) return originalEnd(chunk, chunkEncoding, callback);
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, chunkEncoding));
    const body = Buffer.concat(chunks);
    const compressible = body.length >= 1024 && !res.getHeader?.('Content-Encoding');
    if (!compressible) return originalEnd(body, callback);

    const finish = (error, compressed) => {
      if (error) return originalEnd(body, callback);
      res.setHeader('Content-Encoding', encoding);
      res.setHeader('Vary', 'Accept-Encoding');
      res.removeHeader('Content-Length');
      originalEnd(compressed, callback);
    };
    return encoding === 'br' ? zlib.brotliCompress(body, finish) : zlib.gzip(body, finish);
  };
  return next();
}

module.exports = { apiRateLimit, compression, staticCacheHeaders };
