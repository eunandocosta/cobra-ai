const express = require('../../shared/express');
const controller = require('./access.controller');
const router = express.Router();

const redemptionAttempts = new Map();
function limitCouponAttempts(req, res, next) {
  const now = Date.now();
  const client = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const current = redemptionAttempts.get(client);
  if (current && current.resetAt > now && current.count >= 8) {
    return res.status(429).json({ error: 'Muitas tentativas de cupom. Aguarde alguns minutos e tente novamente.', code: 'coupon_rate_limited' });
  }
  if (!current || current.resetAt <= now) redemptionAttempts.set(client, { count: 1, resetAt: now + 10 * 60 * 1000 });
  else current.count += 1;
  if (redemptionAttempts.size > 2000) {
    for (const [key, item] of redemptionAttempts) if (item.resetAt <= now) redemptionAttempts.delete(key);
  }
  return next();
}

router.get('/status', (req, res) => controller.status(req, res));
router.post('/redeem', limitCouponAttempts, (req, res) => controller.redeem(req, res));

module.exports = router;
