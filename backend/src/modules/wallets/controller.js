'use strict';

const service = require('./service');
const wrap = fn => async (req, res, next) => {
  try { await fn(req, res); } catch (err) { next(err); }
};

exports.getMine = wrap(async (req, res) => res.json({ success: true, data: await service.getWallet(req.user.id) }));
exports.transactions = wrap(async (req, res) => res.json({ success: true, data: await service.listTransactions(req.user.id, req.query) }));
exports.deposits = wrap(async (req, res) => res.json({ success: true, data: await service.listDeposits(req.user.id, req.query) }));
exports.getDeposit = wrap(async (req, res) => res.json({ success: true, data: await service.getDeposit(req.user.id, req.params.id) }));
exports.createDeposit = wrap(async (req, res) => {
  const data = await service.initiateDeposit(req.user.id, req.body);
  res.status(201).json({ success: true, data });
});
exports.continueDeposit = wrap(async (req, res) => res.json({
  success: true, data: await service.continueDeposit(req.user.id, req.params.id, req.body),
}));
exports.withdrawals = wrap(async (req, res) => res.json({
  success: true, data: await service.listWithdrawals(req.user.id, req.query),
}));
exports.getVendorPayoutProfile = wrap(async (req, res) => res.json({ success: true, data: await service.getVendorPayoutProfile(req.user.id) }));
exports.saveVendorPayoutProfile = wrap(async (req, res) => res.json({ success: true, data: await service.saveVendorPayoutProfile(req.user.id, req.body) }));
exports.getRiderPayoutProfile = wrap(async (req, res) => res.json({ success: true, data: await service.getRiderPayoutProfile(req.user.id) }));
exports.saveRiderPayoutProfile = wrap(async (req, res) => res.json({ success: true, data: await service.saveRiderPayoutProfile(req.user.id, req.body) }));
exports.requestWithdrawal = wrap(async (req, res) => {
  const data = await service.requestWithdrawal(req.user.id, req.body);
  res.status(201).json({ success: true, message: 'DAHA Wallet withdrawal request submitted for review.', data });
});
