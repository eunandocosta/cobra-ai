const accessService = require('./access.service');

function getBearerToken(req) {
  return String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1] || '';
}

class AccessController {
  async status(req, res) {
    try {
      if (!accessService.isGateEnabled()) return res.json({ required: false, active: true, access: 'not_required' });
      const token = await accessService.verifyIdToken(getBearerToken(req));
      const result = await accessService.getStatus(token);
      return res.json(result);
    } catch (error) {
      return res.status(error.statusCode || 503).json({ error: error.message || 'Não foi possível validar o acesso.', code: error.code || 'access_status_failed' });
    }
  }

  async redeem(req, res) {
    try {
      if (!accessService.isGateEnabled()) return res.json({ required: false, active: true, access: 'not_required' });
      const token = await accessService.verifyIdToken(getBearerToken(req));
      const result = await accessService.redeemCoupon(token, req.body?.code);
      return res.json(result);
    } catch (error) {
      return res.status(error.statusCode || 503).json({ error: error.message || 'Não foi possível ativar o cupom.', code: error.code || 'coupon_redemption_failed' });
    }
  }
}

module.exports = new AccessController();
