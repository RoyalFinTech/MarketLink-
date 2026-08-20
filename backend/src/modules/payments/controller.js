// src/modules/payments/controller.js
'use strict';
const svc = require('./service');
const { AppError } = require('../../middleware/errorHandler');
const wrap = fn => async (req, res, next) => { try { await fn(req, res); } catch(e) { next(e); } };
exports.initiate = wrap(async (req,res) => {
  const result = await svc.initiatePayment({ ...req.body, customerId: req.user.id });
  res.status(result.existing ? 200 : 201).json({ success: true, data: result });
});
exports.confirm  = wrap(async (req,res) => res.json({ success:true, data: await svc.confirmPayment(req.params.id, req.user.id, req.user.roles) }));
exports.refund   = wrap(async (req,res) => {
  const actor = { id: req.user.id, role: (req.user.roles||[])[0] };
  res.json({ success:true, data: await svc.refund(req.params.id, req.body, actor) });
});
exports.history  = wrap(async (req,res) => res.json({ success:true, data: await svc.getHistory(req.user.id, req.query) }));
exports.webhook  = wrap(async (req,res) => {
  // Webhook handler — verify signature then call confirmPayment
  // Provider: read x-paystack-signature or stripe-signature header
  // This endpoint must be excluded from JSON body parsing (raw buffer needed for signature)
  logger.info('Payment webhook received', { provider: req.params.provider, body: req.body });
  res.json({ received: true });
});
