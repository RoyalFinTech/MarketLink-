'use strict';
const svc = require('./service');
const wrap = fn => async (req,res,next) => { try { await fn(req,res); } catch(e) { next(e); } };
exports.createRequest = wrap(async (req,res) => res.status(201).json({success:true,data:await svc.createRequest(req.user.id,req.body)}));
exports.myRequests = wrap(async (req,res) => res.json({success:true,data:await svc.myRequests(req.user.id)}));
exports.adminList = wrap(async (req,res) => res.json({success:true,data:await svc.adminList(req.query)}));
exports.adminReview = wrap(async (req,res) => res.json({success:true,data:await svc.adminReview(req.params.id,req.user.id,req.body)}));
