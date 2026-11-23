'use strict';
const DEFAULT_WITHDRAWAL_SERVICE_FEE_PCT=2;
const MAX_WITHDRAWAL_SERVICE_FEE_PCT=10;
function validateWithdrawalFeePct(value,statusCode=500){
 const pct=Number(value==null?DEFAULT_WITHDRAWAL_SERVICE_FEE_PCT:value);
 if(!Number.isFinite(pct)||pct<0||pct>MAX_WITHDRAWAL_SERVICE_FEE_PCT){const error=new Error('DAHA Wallet withdrawal service fee must be between 0% and 10%.');error.statusCode=statusCode;error.status=statusCode;error.code='INVALID_WITHDRAWAL_FEE_SETTINGS';throw error;}
 return Number(pct.toFixed(2));
}
function roundGmd(value){return Math.round((Number(value)+Number.EPSILON)*100)/100;}
function calculateWithdrawalDebit(payoutAmount,feePct){
 const amount=roundGmd(payoutAmount);
 if(!Number.isFinite(amount)||amount<=0){const error=new Error('Withdrawal amount must be greater than zero.');error.statusCode=400;error.status=400;error.code='INVALID_AMOUNT';throw error;}
 const pct=validateWithdrawalFeePct(feePct,400),feeAmount=roundGmd(amount*pct/100);
 return {payoutAmount:amount,serviceFeePct:pct,serviceFeeAmount:feeAmount,walletDebitAmount:roundGmd(amount+feeAmount)};
}
module.exports={DEFAULT_WITHDRAWAL_SERVICE_FEE_PCT,MAX_WITHDRAWAL_SERVICE_FEE_PCT,validateWithdrawalFeePct,roundGmd,calculateWithdrawalDebit};
