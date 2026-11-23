'use strict';
const {calculateWithdrawalDebit,validateWithdrawalFeePct,resolveWithdrawalServiceFeePct}=require('./walletWithdrawalFees');
describe('DAHA Wallet withdrawal service fee',()=>{
 test('adds a transparent 2% fee on top of the requested payout',()=>expect(calculateWithdrawalDebit(100,2)).toEqual({payoutAmount:100,serviceFeePct:2,serviceFeeAmount:2,walletDebitAmount:102}));
 test('rounds the fee to two Dalasi decimals before reserving wallet funds',()=>expect(calculateWithdrawalDebit(52.35,2)).toEqual({payoutAmount:52.35,serviceFeePct:2,serviceFeeAmount:1.05,walletDebitAmount:53.4}));
 test('allows zero only when Admin explicitly sets a zero service fee',()=>expect(validateWithdrawalFeePct(0,400)).toBe(0));
 test('rejects an unsafe or invalid stored fee percentage',()=>expect(()=>validateWithdrawalFeePct(12,400)).toThrow(expect.objectContaining({code:'INVALID_WITHDRAWAL_FEE_SETTINGS'})));

 test('waives a second DAHA percentage fee for vendors, riders and affiliates whose payout costs were funded by orders',()=>{
  expect(resolveWithdrawalServiceFeePct({isMarketplacePayee:true,configuredFeePct:2})).toBe(0);
 });
 test('keeps the configured customer cash-out service fee',()=>{
  expect(resolveWithdrawalServiceFeePct({isMarketplacePayee:false,configuredFeePct:2})).toBe(2);
 });
});
