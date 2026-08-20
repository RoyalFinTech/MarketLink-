// src/modules/customers/controller.js
'use strict';
const svc = require('./service');
const wrap = fn => async (req, res, next) => {
  try { await fn(req, res); } catch (e) { next(e); }
};

exports.getMyProfile     = wrap(async (req, res) => res.json({ success: true, data: await svc.getProfile(req.user.id) }));
exports.updateMyProfile  = wrap(async (req, res) => res.json({ success: true, data: await svc.updateProfile(req.user.id, req.body) }));
exports.listAddresses    = wrap(async (req, res) => res.json({ success: true, data: await svc.listAddresses(req.user.id) }));
exports.addAddress       = wrap(async (req, res) => res.status(201).json({ success: true, data: await svc.addAddress(req.user.id, req.body) }));
exports.updateAddress    = wrap(async (req, res) => res.json({ success: true, data: await svc.updateAddress(req.user.id, req.params.addressId, req.body) }));
exports.deleteAddress    = wrap(async (req, res) => res.json({ success: true, data: await svc.deleteAddress(req.user.id, req.params.addressId) }));
exports.getWishlist      = wrap(async (req, res) => res.json({ success: true, data: await svc.getWishlist(req.user.id, req.query) }));
exports.addToWishlist    = wrap(async (req, res) => res.status(201).json({ success: true, data: await svc.addToWishlist(req.user.id, req.params.productId) }));
exports.removeWishlist   = wrap(async (req, res) => res.json({ success: true, data: await svc.removeFromWishlist(req.user.id, req.params.productId) }));
exports.orderHistory     = wrap(async (req, res) => res.json({ success: true, data: await svc.getOrderHistory(req.user.id, req.query) }));
exports.getWallet        = wrap(async (req, res) => res.json({ success: true, data: await svc.getWallet(req.user.id) }));
exports.getWalletTxns    = wrap(async (req, res) => res.json({ success: true, data: await svc.getWalletTransactions(req.user.id, req.query) }));
exports.getLoyalty       = wrap(async (req, res) => res.json({ success: true, data: await svc.getLoyaltyPoints(req.user.id) }));
exports.getNotifications = wrap(async (req, res) => res.json({ success: true, data: await svc.getNotifications(req.user.id, req.query) }));
exports.markRead         = wrap(async (req, res) => res.json({ success: true, data: await svc.markNotificationsRead(req.user.id, req.body.ids) }));
// Admin
exports.list             = wrap(async (req, res) => res.json({ success: true, data: await svc.list(req.query) }));
exports.getById          = wrap(async (req, res) => res.json({ success: true, data: await svc.getProfile(req.params.id) }));
