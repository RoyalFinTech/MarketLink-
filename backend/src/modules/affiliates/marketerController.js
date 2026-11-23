'use strict';
const service=require('./marketerService');
const wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(error){next(error);}};
const actor=req=>({id:req.user.id,role:(req.user.roles||[]).includes('super_admin')?'super_admin':'admin'});

exports.status=wrap(async(req,res)=>res.json({success:true,data:await service.getMyStatus(req.user.id)}));
exports.apply=wrap(async(req,res)=>res.status(201).json({success:true,message:'Your Affiliate Marketer application has been submitted for Admin review.',data:await service.submitApplication(req.user.id,req.body)}));
exports.dashboard=wrap(async(req,res)=>res.json({success:true,data:await service.getDashboard(req.user.id)}));
exports.adminList=wrap(async(req,res)=>res.json({success:true,data:await service.listApplications(req.query)}));
exports.adminReview=wrap(async(req,res)=>res.json({success:true,data:await service.reviewApplication(req.params.id,req.body.decision,req.body.reason,actor(req))}));
