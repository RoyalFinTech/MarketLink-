// src/modules/payments/controller.js
'use strict';
const svc = require('./service');
const modemPay = require('../../integrations/modempay');
const logger = require('../../utils/logger');

const wrap = fn => async (req, res, next) => {
  try { await fn(req, res, next); } catch (e) { next(e); }
};

exports.initiate = wrap(async (req,res) => {
  const result = await svc.initiatePayment({ ...req.body, customerId: req.user.id });
  res.status(result.existing ? 200 : 201).json({ success:true, data:result });
});

exports.confirm = wrap(async (req,res) => {
  res.json({ success:true, data:await svc.confirmPayment(req.params.id, req.user.id, req.user.roles) });
});

exports.refund = wrap(async (req,res) => {
  const actor = { id:req.user.id, role:(req.user.roles||[])[0] };
  res.json({ success:true, data:await svc.refund(req.params.id, req.body, actor) });
});

exports.history = wrap(async (req,res) => {
  res.json({ success:true, data:await svc.getHistory(req.user.id, req.query) });
});

exports.webhook = async (req,res,next) => {
  try {
    const signature = req.headers['x-modem-signature'];
    const rawBody = Buffer.isBuffer(req.body) ? req.body : req.rawBody;
    if (!modemPay.verifyWebhookSignature(rawBody, signature)) {
      return res.status(400).json({ success:false, error:'Invalid Modem Pay webhook signature.' });
    }
    const rawBody = Buffer.isBuffer(req.body) ? req.body : req.rawBody;
    const event = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString('utf8')) : req.body;
    const result = await svc.processWebhook({
      event,
      rawBody,
    });
    return res.status(200).json({ received:true, data:result });
  } catch (e) {
    logger.error('Modem Pay webhook processing failed', { error:e.message });
    next(e);
  }
};
