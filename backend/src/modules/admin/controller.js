// src/modules/admin/controller.js
'use strict';
const svc = require('./service');
const { AppError } = require('../../middleware/errorHandler');
const wrap = fn => async (req,res,next) => { try { await fn(req,res); } catch(e) { next(e); } };
const actor = req => ({ id: req.user.id, role: (req.user.roles||[]).includes('super_admin') ? 'super_admin' : ((req.user.roles||[])[0] || 'admin') });
exports.dashboard  = wrap(async (req,res) => res.json({ success:true, data: await svc.getDashboard() }));
exports.users      = wrap(async (req,res) => { const data=await svc.getUsers(req.query); res.json({ success:true, data:{...data,canManageAdminRoles:(req.user.roles||[]).includes('super_admin')} }); });
exports.grantAdminRole = wrap(async (req,res) => res.json({ success:true, data: await svc.grantAdminRole(req.params.id, actor(req)) }));
exports.suspend    = wrap(async (req,res) => {
  if (!req.body.reason?.trim()) throw new AppError('Reason required.',400,'VALIDATION_ERROR');
  res.json({ success:true, data: await svc.suspendUser(req.params.id, req.body.reason, actor(req)) });
});
exports.reinstate  = wrap(async (req,res) => res.json({ success:true, data: await svc.reinstateUser(req.params.id, actor(req)) }));
exports.analytics  = wrap(async (req,res) => res.json({ success:true, data: await svc.getAnalytics(req.query) }));
exports.settings   = wrap(async (req,res) => res.json({ success:true, data: await svc.getSystemSettings() }));
exports.commissionSettings = wrap(async (req,res) => res.json({ success:true, data: await svc.getMarketplaceCommissionSettings() }));
exports.updateCommissionSettings = wrap(async (req,res) => res.json({ success:true, data: await svc.updateMarketplaceCommissionSettings(req.body, actor(req)) }));
exports.deliveryPricingSettings = wrap(async (req,res) => res.json({ success:true, data: await svc.getDeliveryPricingSettings() }));
exports.updateDeliveryPricingSettings = wrap(async (req,res) => res.json({ success:true, data: await svc.updateDeliveryPricingSettings(req.body, actor(req)) }));
exports.riderPricingOverrides = wrap(async (req,res) => res.json({success:true,data:await svc.listAdminRiderPricing(req.query)}));
exports.setRiderPricingOverride = wrap(async (req,res) => res.json({success:true,data:await svc.updateAdminRiderPricingOverride(req.params.id,req.body,actor(req))}));
exports.clearRiderPricingOverride = wrap(async (req,res) => res.json({success:true,data:await svc.updateAdminRiderPricingOverride(req.params.id,{clearOverride:true},actor(req))}));
exports.vendorProductPricing = wrap(async (req,res) => res.json({success:true,data:await svc.listVendorProductPricing(req.query)}));
exports.setVendorProductPriceOverride = wrap(async (req,res) => res.json({success:true,data:await svc.updateVendorProductPriceOverride(req.params.id,req.body,actor(req))}));
exports.paymentReadiness = wrap(async (req,res) => res.json({success:true,data:await svc.getPaymentReadiness()}));

exports.setSetting = wrap(async (req,res) => res.json({ success:true, data: await svc.updateSystemSetting(req.params.key, req.body.value, req.user.id) }));
exports.auditLogs  = wrap(async (req,res) => res.json({ success:true, data: await svc.getAuditLogs(req.query) }));
exports.reports    = wrap(async (req,res) => res.json({ success:true, data: await svc.getReports(req.query) }));
exports.affiliates = wrap(async (req,res) => res.json({ success:true, data: await svc.getAffiliateDirectory(req.query) }));
// ── Read-only financial reconciliation ──────────────────────────────
const financialReconciliationSvc = require('./financialReconciliation');
exports.financialReconciliation = wrap(async (req,res) => res.json({ success:true, data: await financialReconciliationSvc.getFinancialReconciliation(req.query) }));
exports.transactions = wrap(async (req,res) => res.json({ success:true, data: await svc.getAdminTransactions(req.query) }));
exports.withdrawalFeeReport = wrap(async (req,res) => res.json({ success:true, data: await svc.getWithdrawalFeeReport(req.query) }));
exports.failedPayments = wrap(async (req,res) => res.json({ success:true, data: await svc.getFailedPayments(req.query) }));

exports.retryFinancialSettlement = wrap(async (req,res) => {
  if (req.body.confirmation !== 'RETRY_SETTLEMENT') {
    throw new AppError('Explicit settlement retry confirmation is required.',400,'CONFIRMATION_REQUIRED');
  }
  const result = await svc.retryFinancialSettlement(req.params.id, actor(req), req.body.reason.trim());
  if (!result.settled) {
    throw new AppError('Settlement was not performed: '+result.reason+'. No wallet balances were changed.',409,'SETTLEMENT_NOT_ELIGIBLE');
  }
  res.json({
    success:true,
    message:result.alreadySettled?'This order was already settled. No additional wallet credit was created.':'Order settlement completed using the existing idempotent financial routine.',
    data:result,
  });
});

// ── Withdrawals (admin approval workflow) ───────────────────────────
const withdrawalsSvc = require('../withdrawals/service');
exports.pendingWithdrawals = wrap(async (req,res) => res.json({ success:true, data: await withdrawalsSvc.listPendingForAdmin(req.query) }));
exports.approveWithdrawal = wrap(async (req,res) => {
  const data = await withdrawalsSvc.approve(req.params.id, req.user.id);
  const message = data.status === 'completed'
    ? 'Withdrawal was paid and confirmed by Modem Pay.'
    : 'Modem Pay payout started or is awaiting reconciliation. DAHA balance is debited only after provider confirmation.';
  res.json({ success:true, message, data });
});
exports.rejectWithdrawal   = wrap(async (req,res) => res.json({ success:true, message:'Withdrawal rejected.', data: await withdrawalsSvc.reject(req.params.id, req.user.id) }));


exports.supportTickets = wrap(async (req,res) => res.json({success:true,data:await svc.listSupportTickets(req.query)}));
exports.supportTicket = wrap(async (req,res) => res.json({success:true,data:await svc.getSupportTicket(req.params.id)}));
exports.updateSupportTicket = wrap(async (req,res) => res.json({success:true,data:await svc.updateSupportTicket(req.params.id,req.body,actor(req))}));
exports.replySupportTicket = wrap(async (req,res) => res.status(201).json({success:true,data:await svc.replySupportTicket(req.params.id,req.body.body,actor(req))}));
exports.crmProfile = wrap(async (req,res) => res.json({success:true,data:await svc.getCrmProfile(req.params.id)}));
exports.addCrmNote = wrap(async (req,res) => res.status(201).json({success:true,data:await svc.addCrmNote(req.params.id,req.body.note,actor(req))}));
exports.conversations = wrap(async (req,res) => res.json({success:true,data:await svc.listAdminConversations(req.query)}));
exports.startConversation = wrap(async (req,res) => res.status(201).json({success:true,data:await svc.startAdminConversation(req.body.participantUserId,actor(req))}));
exports.conversationMessages = wrap(async (req,res) => res.json({success:true,data:await svc.getAdminConversationMessages(req.params.id,req.query)}));
exports.sendConversationMessage = wrap(async (req,res) => res.status(201).json({success:true,data:await svc.sendAdminConversationMessage(req.params.id,req.body.body,actor(req))}));

