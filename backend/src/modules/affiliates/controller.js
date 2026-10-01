'use strict';
const { query }=require('../../config/db');
const wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
exports.resolve=wrap(async(req,res)=>{
 const {rows:[a]}=await query('SELECT affiliate_code,commission_pct FROM affiliates WHERE affiliate_code=$1',[String(req.params.code).toUpperCase()]);
 if(!a)return res.status(404).json({success:false,error:'Affiliate code not found.'});
 res.json({success:true,data:{affiliateCode:a.affiliate_code,commissionPct:Number(a.commission_pct)}});
});
exports.click=wrap(async(req,res)=>{
 const {rows:[a]}=await query('UPDATE affiliates SET total_clicks=total_clicks+1 WHERE affiliate_code=$1 RETURNING affiliate_code',[String(req.body.code).toUpperCase()]);
 if(!a)return res.status(404).json({success:false,error:'Affiliate code not found.'});
 res.json({success:true,data:{tracked:true,affiliateCode:a.affiliate_code}});
});
exports.me=wrap(async(req,res)=>{
 const {rows:[a]}=await query('SELECT affiliate_code,commission_pct,total_clicks,total_orders,total_earnings,created_at FROM affiliates WHERE user_id=$1',[req.user.id]);
 res.json({success:true,data:a||null});
});
