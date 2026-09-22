const accessService = require('../modules/access/access.service');

async function requireAccess(req, res, next) {
  if (!accessService.isGateEnabled()) return next();
  const authorization = String(req.headers.authorization || '');
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  try {
    const decoded = await accessService.verifyIdToken(match?.[1] || '');
    const expiresAtMs = Number(decoded[accessService.ACCESS_CLAIM_EXPIRES_AT] || 0);
    const hasActiveAccess = decoded[accessService.ACCESS_CLAIM_GRANTED] === true && (!expiresAtMs || expiresAtMs > Date.now());
    if (!hasActiveAccess) return res.status(403).json({ error: 'Ative um cupom válido para usar o MedTutor.', code: 'access_required' });
    req.authenticatedUser = decoded;
    return next();
  } catch (error) {
    const status = error.statusCode || 401;
    return res.status(status).json({ error: status === 503 ? 'A validação segura de acesso está indisponível no servidor.' : error.message, code: error.code || 'access_validation_failed' });
  }
}

function withAccess(handler) {
  return (req, res) => requireAccess(req, res, () => handler(req, res));
}

module.exports = { requireAccess, withAccess };
