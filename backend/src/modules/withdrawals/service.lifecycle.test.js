'use strict';

jest.mock('../../config/db',()=>({query:jest.fn(),withTransaction:jest.fn()}));
jest.mock('bcryptjs',()=>({compare:jest.fn()}));
jest.mock('../../integrations/modempay',()=>({
  isConfigured:jest.fn(()=>true),
  isWebhookConfigured:jest.fn(()=>true),
  isH2H:jest.fn(()=>false),
  isH2HApproved:jest.fn(()=>true),
  quoteTransferFee:jest.fn(),
  initiateTransfer:jest.fn(),
  retrieveTransfer:jest.fn(),
}));

const {query,withTransaction}=require('../../config/db');
const bcrypt=require('bcryptjs');
const modemPay=require('../../integrations/modempay');
const service=require('./service');

describe('affiliate marketer withdrawal request lifecycle',()=>{
  let clientQuery;
  beforeEach(()=>{
    jest.clearAllMocks();
    clientQuery=jest.fn();
    withTransaction.mockImplementation(fn=>fn({query:clientQuery}));
    bcrypt.compare.mockResolvedValue(true);
    modemPay.isConfigured.mockReturnValue(true);
    modemPay.isWebhookConfigured.mockReturnValue(true);
    modemPay.isH2H.mockReturnValue(false);
    modemPay.isH2HApproved.mockReturnValue(true);
    modemPay.quoteTransferFee.mockResolvedValue({fee:1,currency:'GMD',network:'wave'});
  });

  test('Admin reconciliation retrieves and completes a confirmed provider transfer exactly once',async()=>{
    const withdrawalId='8b7d5c24-46e4-4e8b-9db8-0f62b6c5f831';
    const pending={id:withdrawalId,user_id:'affiliate-user',wallet_id:'wallet-1',status:'payout_pending',provider_ref:'provider-ref-1',amount:'50',wallet_debit_amount:'50',service_fee_amount:'0'};
    const completed={...pending,status:'completed',provider_status:'completed'};
    query.mockResolvedValueOnce({rows:[pending]}).mockResolvedValueOnce({rows:[]});
    modemPay.retrieveTransfer.mockResolvedValue({
      id:'provider-ref-1',status:'completed',amount:50,currency:'GMD',fee:0,
      metadata:{withdrawal_id:withdrawalId}
    });
    clientQuery
      .mockResolvedValueOnce({rows:[pending]})
      .mockResolvedValueOnce({rows:[{id:'wallet-1',balance:'50'}]})
      .mockResolvedValueOnce({rows:[]})
      .mockResolvedValueOnce({rows:[completed]})
      .mockResolvedValueOnce({rows:[]});

    const result=await service.reconcileProviderWithdrawal(withdrawalId,{id:'admin-user',role:'super_admin'});

    expect(result).toMatchObject({status:'completed'});
    expect(modemPay.retrieveTransfer).toHaveBeenCalledWith('provider-ref-1');
    expect(clientQuery.mock.calls.filter(([sql])=>sql.includes('UPDATE wallets SET balance=balance-$1'))).toHaveLength(1);
    expect(clientQuery.mock.calls.filter(([sql])=>sql.includes("VALUES ($1,'debit','withdrawal'"))).toHaveLength(1);
  });

  test('Admin reconciliation refuses a provider amount mismatch without changing wallet or withdrawal',async()=>{
    const withdrawalId='8b7d5c24-46e4-4e8b-9db8-0f62b6c5f831';
    const pending={id:withdrawalId,status:'payout_pending',provider_ref:'provider-ref-1',amount:'50'};
    query.mockResolvedValueOnce({rows:[pending]});
    modemPay.retrieveTransfer.mockResolvedValue({
      id:'provider-ref-1',status:'completed',amount:49,currency:'GMD',
      metadata:{withdrawal_id:withdrawalId}
    });

    await expect(service.reconcileProviderWithdrawal(withdrawalId,{id:'admin-user',role:'super_admin'}))
      .rejects.toMatchObject({code:'PROVIDER_AMOUNT_MISMATCH',statusCode:409});
    expect(withTransaction).not.toHaveBeenCalled();
    expect(clientQuery).not.toHaveBeenCalled();
  });

  test('Admin reconciliation keeps a pending provider transfer reserved without debiting wallet',async()=>{
    const withdrawalId='8b7d5c24-46e4-4e8b-9db8-0f62b6c5f831';
    const pending={id:withdrawalId,status:'payout_pending',provider_ref:'provider-ref-1',amount:'50'};
    const refreshed={...pending,provider_status:'pending'};
    query.mockResolvedValueOnce({rows:[pending]}).mockResolvedValueOnce({rows:[]});
    modemPay.retrieveTransfer.mockResolvedValue({
      id:'provider-ref-1',status:'pending',amount:50,currency:'GMD',
      metadata:{withdrawal_id:withdrawalId}
    });
    clientQuery
      .mockResolvedValueOnce({rows:[pending]})
      .mockResolvedValueOnce({rows:[refreshed]});

    const result=await service.reconcileProviderWithdrawal(withdrawalId,{id:'admin-user',role:'super_admin'});

    expect(result).toMatchObject({status:'payout_pending',provider_status:'pending'});
    expect(clientQuery.mock.calls.some(([sql])=>/UPDATE wallets|INSERT INTO transactions/.test(sql))).toBe(false);
  });

  test('enforces the D50 minimum before opening a transaction',async()=>{
    await expect(service.requestWithdrawal('affiliate-user',{
      amount:49.98,payoutMethod:'wave',payoutDetails:{account_number:'871234567',beneficiary_name:'Awa Jallow'},pin:'1234'
    })).rejects.toMatchObject({code:'BELOW_MINIMUM',statusCode:400});
    expect(withTransaction).not.toHaveBeenCalled();
  });

  test('accepts an affiliate payout number different from login phone and reserves the wallet debit',async()=>{
    const inserted={id:'withdrawal-1',status:'processing',amount:50,wallet_debit_amount:50};
    clientQuery
      .mockResolvedValueOnce({rows:[{pin_hash:'hashed-pin',status:'active'}]})
      .mockResolvedValueOnce({rows:[]})
      .mockResolvedValueOnce({rows:[]})
      .mockResolvedValueOnce({rows:[{user_id:'affiliate-user'}]})
      .mockResolvedValueOnce({rows:[{value:'0'}]})
      .mockResolvedValueOnce({rows:[{id:'wallet-1',balance:'100'}]})
      .mockResolvedValueOnce({rows:[{pending:'0'}]})
      .mockResolvedValueOnce({rows:[inserted]});

    const result=await service.requestWithdrawal('affiliate-user',{
      amount:50,payoutMethod:'wave',
      payoutDetails:{account_number:'871234567',beneficiary_name:'Awa Jallow'},pin:'1234'
    });

    expect(result).toEqual(inserted);
    expect(bcrypt.compare).toHaveBeenCalledWith('1234','hashed-pin');
    expect(clientQuery.mock.calls[5][0]).toContain('FOR UPDATE');
    expect(clientQuery.mock.calls[7][0]).toContain("VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'processing')");
    expect(clientQuery.mock.calls[7][1][0]).toBe('affiliate-user');
    expect(JSON.parse(clientQuery.mock.calls[7][1][7])).toEqual({
      account_number:'871234567',beneficiary_name:'Awa Jallow'
    });
  });

  test('serializes withdrawal reservations on the wallet row and counts existing reservations before inserting',async()=>{
    clientQuery
      .mockResolvedValueOnce({rows:[{pin_hash:'hashed-pin',status:'active'}]})
      .mockResolvedValueOnce({rows:[]})
      .mockResolvedValueOnce({rows:[]})
      .mockResolvedValueOnce({rows:[{user_id:'affiliate-user'}]})
      .mockResolvedValueOnce({rows:[{value:'0'}]})
      .mockResolvedValueOnce({rows:[{id:'wallet-1',balance:'100'}]})
      .mockResolvedValueOnce({rows:[{pending:'60'}]});

    await expect(service.requestWithdrawal('affiliate-user',{
      amount:50,payoutMethod:'wave',
      payoutDetails:{account_number:'871234567',beneficiary_name:'Awa Jallow'},pin:'1234'
    })).rejects.toMatchObject({code:'INSUFFICIENT_BALANCE',statusCode:400});

    const walletLockIndex=clientQuery.mock.calls.findIndex(([sql])=>/FROM wallets WHERE user_id=\$1 FOR UPDATE/.test(sql));
    const reservationSumIndex=clientQuery.mock.calls.findIndex(([sql])=>/SUM\(COALESCE\(wallet_debit_amount,amount\)\)/.test(sql));
    expect(walletLockIndex).toBeGreaterThanOrEqual(0);
    expect(reservationSumIndex).toBeGreaterThan(walletLockIndex);
    expect(clientQuery.mock.calls.some(([sql])=>/INSERT INTO withdrawals/.test(sql))).toBe(false);
  });

  test('rejects an invalid Gambian payout number before reserving wallet funds',async()=>{
    clientQuery
      .mockResolvedValueOnce({rows:[{pin_hash:'hashed-pin',status:'active'}]})
      .mockResolvedValueOnce({rows:[]})
      .mockResolvedValueOnce({rows:[]})
      .mockResolvedValueOnce({rows:[{user_id:'affiliate-user'}]})
      .mockResolvedValueOnce({rows:[{value:'0'}]});

    await expect(service.requestWithdrawal('affiliate-user',{
      amount:50,payoutMethod:'afrimoney',
      payoutDetails:{account_number:'771234567',beneficiary_name:'Awa Jallow'},pin:'1234'
    })).rejects.toMatchObject({code:'INVALID_ACCOUNT_NUMBER',statusCode:400});
    expect(clientQuery).toHaveBeenCalledTimes(4);
  });

  test('does not reserve funds when the account PIN is incorrect',async()=>{
    bcrypt.compare.mockResolvedValue(false);
    clientQuery.mockResolvedValueOnce({rows:[{pin_hash:'hashed-pin',status:'active'}]});
    await expect(service.requestWithdrawal('affiliate-user',{
      amount:50,payoutMethod:'wave',
      payoutDetails:{account_number:'871234567',beneficiary_name:'Awa Jallow'},pin:'9999'
    })).rejects.toMatchObject({code:'INVALID_WITHDRAWAL_PIN',statusCode:401});
    expect(clientQuery).toHaveBeenCalledTimes(1);
  });

  test('Admin rejection is limited to an uninitiated processing request and releases its reservation',async()=>{
    const pending={id:'withdrawal-2',user_id:'affiliate-user',status:'processing'};
    const rejected={...pending,status:'rejected',provider_status:'rejected_by_admin'};
    clientQuery
      .mockResolvedValueOnce({rows:[pending]})
      .mockResolvedValueOnce({rows:[rejected]})
      .mockResolvedValueOnce({rows:[]});

    const result=await service.reject('withdrawal-2','admin-user');

    expect(result).toEqual(rejected);
    expect(clientQuery.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(clientQuery.mock.calls[1][0]).toContain("status='rejected'");
    expect(clientQuery.mock.calls[2][0]).toContain('INSERT INTO notifications');
    expect(clientQuery.mock.calls.some(([sql])=>/UPDATE wallets|INSERT INTO transactions/.test(sql))).toBe(false);
  });

  test('a verified provider failure releases a payout reservation without debiting the wallet',async()=>{
    const withdrawalId='8b7d5c24-46e4-4e8b-9db8-0f62b6c5f831';
    const pending={id:withdrawalId,user_id:'affiliate-user',wallet_id:'wallet-1',status:'payout_pending',provider_ref:'provider-ref-1',amount:'50',currency:'GMD'};
    const rejected={...pending,status:'rejected',provider_status:'failed'};
    clientQuery
      .mockResolvedValueOnce({rows:[pending]})
      .mockResolvedValueOnce({rows:[rejected]})
      .mockResolvedValueOnce({rows:[]});

    const result=await service.processProviderWebhook({
      event:'transfer.failed',
      payload:{metadata:{withdrawal_id:withdrawalId},id:'provider-ref-1',amount:50,currency:'GMD',status:'failed'}
    });

    expect(result).toMatchObject({processed:true,data:{status:'rejected',provider_status:'failed'}});
    expect(clientQuery.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(clientQuery.mock.calls[1][0]).toContain("status='rejected'");
    expect(clientQuery.mock.calls[2][0]).toContain('INSERT INTO notifications');
    expect(clientQuery.mock.calls.some(([sql])=>/UPDATE wallets|INSERT INTO transactions/.test(sql))).toBe(false);
  });

  test.each([
    ['transfer.failed','completed'],
    ['transfer.cancelled','succeeded'],
    ['transfer.succeeded','failed'],
    ['transfer.flagged','completed'],
    ['transfer.reversed','failed'],
  ])('ignores %s when payload status is %s',async(event,status)=>{
    const withdrawalId='8b7d5c24-46e4-4e8b-9db8-0f62b6c5f831';
    const result=await service.processProviderWebhook({
      event,
      payload:{metadata:{withdrawal_id:withdrawalId},id:'provider-ref-1',amount:50,currency:'GMD',status}
    });
    expect(result).toEqual({ignored:true,reason:'event_status_mismatch'});
    expect(withTransaction).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(clientQuery).not.toHaveBeenCalled();
  });

  test('a provider failure with a mismatched reference cannot release a withdrawal reservation',async()=>{
    const withdrawalId='8b7d5c24-46e4-4e8b-9db8-0f62b6c5f831';
    clientQuery.mockResolvedValueOnce({rows:[{id:withdrawalId,status:'payout_pending',provider_ref:'provider-ref-1',amount:'50'}]});
    const result=await service.processProviderWebhook({
      event:'transfer.failed',
      payload:{metadata:{withdrawal_id:withdrawalId},id:'wrong-reference',amount:50,currency:'GMD',status:'failed'}
    });
    expect(result).toEqual({processed:true,data:{ignored:true,reason:'provider_reference_mismatch'}});
    expect(clientQuery).toHaveBeenCalledTimes(1);
  });

  test('a successful provider webhook with a mismatched amount cannot bind or debit the withdrawal',async()=>{
    const withdrawalId='8b7d5c24-46e4-4e8b-9db8-0f62b6c5f831';
    clientQuery.mockResolvedValueOnce({rows:[{id:withdrawalId,status:'payout_pending',provider_ref:null,amount:'50'}]});
    const result=await service.processProviderWebhook({
      event:'transfer.succeeded',
      payload:{metadata:{withdrawal_id:withdrawalId},id:'provider-ref-1',amount:49.98,currency:'GMD',status:'succeeded'}
    });
    expect(result).toEqual({ignored:true,reason:'amount_mismatch'});
    expect(clientQuery).toHaveBeenCalledTimes(1);
    expect(clientQuery.mock.calls.some(([sql])=>sql.includes('UPDATE withdrawals SET provider_ref'))).toBe(false);
    expect(clientQuery.mock.calls.some(([sql])=>/UPDATE wallets|INSERT INTO transactions/.test(sql))).toBe(false);
  });

  test('a failed provider webhook with the wrong currency cannot release the withdrawal reservation',async()=>{
    const withdrawalId='8b7d5c24-46e4-4e8b-9db8-0f62b6c5f831';
    clientQuery.mockResolvedValueOnce({rows:[{id:withdrawalId,status:'payout_pending',provider_ref:'provider-ref-1',amount:'50'}]});
    const result=await service.processProviderWebhook({
      event:'transfer.failed',
      payload:{metadata:{withdrawal_id:withdrawalId},id:'provider-ref-1',amount:50,currency:'USD',status:'failed'}
    });
    expect(result).toMatchObject({processed:true,data:{ignored:true,reason:'currency_mismatch'}});
    expect(clientQuery).toHaveBeenCalledTimes(1);
    expect(clientQuery.mock.calls.some(([sql])=>sql.includes("status='rejected'"))).toBe(false);
  });

  test('a matching successful provider webhook debits the wallet and writes one withdrawal ledger entry',async()=>{
    const withdrawalId='8b7d5c24-46e4-4e8b-9db8-0f62b6c5f831';
    const unbound={id:withdrawalId,user_id:'affiliate-user',wallet_id:'wallet-1',status:'payout_pending',provider_ref:null,amount:'50',wallet_debit_amount:'50',service_fee_amount:'0'};
    const bound={...unbound,provider_ref:'provider-ref-1'};
    const completed={...bound,status:'completed',provider_status:'completed'};
    clientQuery
      .mockResolvedValueOnce({rows:[unbound]})
      .mockResolvedValueOnce({rows:[{id:withdrawalId}]})
      .mockResolvedValueOnce({rows:[bound]})
      .mockResolvedValueOnce({rows:[{id:'wallet-1',balance:'50'}]})
      .mockResolvedValueOnce({rows:[]})
      .mockResolvedValueOnce({rows:[completed]})
      .mockResolvedValueOnce({rows:[]});

    const result=await service.processProviderWebhook({
      event:'transfer.succeeded',
      payload:{metadata:{withdrawal_id:withdrawalId},id:'provider-ref-1',amount:50,currency:'GMD',status:'succeeded',fee:0}
    });

    expect(result).toMatchObject({processed:true,data:{status:'completed',provider_status:'completed'}});
    expect(clientQuery.mock.calls.filter(([sql])=>sql.includes('UPDATE wallets SET balance=balance-$1'))).toHaveLength(1);
    expect(clientQuery.mock.calls.filter(([sql])=>sql.includes("INSERT INTO transactions (wallet_id,type,category,amount,balance_after,reference_type,reference_id,description) VALUES ($1,'debit','withdrawal'"))).toHaveLength(1);
    expect(clientQuery.mock.calls.some(([sql])=>sql.includes("status='completed',provider_status='completed'"))).toBe(true);
  });

  test('a repeated success webhook after completion does not debit or ledger-credit a second time',async()=>{
    const withdrawalId='8b7d5c24-46e4-4e8b-9db8-0f62b6c5f831';
    const completed={id:withdrawalId,status:'completed',provider_status:'completed'};
    clientQuery.mockResolvedValueOnce({rows:[completed]});
    query.mockResolvedValueOnce({rows:[completed]});
    const result=await service.processProviderWebhook({
      event:'transfer.succeeded',
      payload:{metadata:{withdrawal_id:withdrawalId},id:'provider-ref-1',amount:50,currency:'GMD',status:'succeeded'}
    });
    expect(result).toMatchObject({duplicate:true,data:{status:'completed'}});
    expect(clientQuery).toHaveBeenCalledTimes(1);
    expect(clientQuery.mock.calls.some(([sql])=>/UPDATE wallets|INSERT INTO transactions/.test(sql))).toBe(false);
  });

  test('a reversal webhook with a mismatched amount cannot credit the wallet',async()=>{
    const withdrawalId='8b7d5c24-46e4-4e8b-9db8-0f62b6c5f831';
    clientQuery.mockResolvedValueOnce({rows:[{id:withdrawalId,status:'completed',provider_status:'completed',provider_ref:'provider-ref-1',amount:'50',wallet_id:'wallet-1'}]});
    const result=await service.processProviderWebhook({
      event:'transfer.reversed',
      payload:{metadata:{withdrawal_id:withdrawalId},id:'provider-ref-1',amount:49.98,currency:'GMD',status:'reversed'}
    });
    expect(result).toEqual({ignored:true,reason:'amount_mismatch'});
    expect(clientQuery).toHaveBeenCalledTimes(1);
    expect(clientQuery.mock.calls.some(([sql])=>/UPDATE wallets|INSERT INTO transactions|status='rejected'/.test(sql))).toBe(false);
  });

  test('a reversal webhook with a non-GMD currency cannot credit the wallet',async()=>{
    const withdrawalId='8b7d5c24-46e4-4e8b-9db8-0f62b6c5f831';
    clientQuery.mockResolvedValueOnce({rows:[{id:withdrawalId,status:'completed',provider_status:'completed',provider_ref:'provider-ref-1',amount:'50',wallet_id:'wallet-1'}]});
    const result=await service.processProviderWebhook({
      event:'transfer.reversed',
      payload:{metadata:{withdrawal_id:withdrawalId},id:'provider-ref-1',amount:50,currency:'USD',status:'reversed'}
    });
    expect(result).toEqual({ignored:true,reason:'currency_mismatch'});
    expect(clientQuery).toHaveBeenCalledTimes(1);
    expect(clientQuery.mock.calls.some(([sql])=>/UPDATE wallets|INSERT INTO transactions|status='rejected'/.test(sql))).toBe(false);
  });

  test('a flagged payout with a mismatched amount remains reserved and is not marked for review',async()=>{
    const withdrawalId='8b7d5c24-46e4-4e8b-9db8-0f62b6c5f831';
    clientQuery.mockResolvedValueOnce({rows:[{id:withdrawalId,status:'payout_pending',provider_status:'completed',provider_ref:'provider-ref-1',amount:'50'}]});
    const result=await service.processProviderWebhook({
      event:'transfer.flagged',
      payload:{metadata:{withdrawal_id:withdrawalId},id:'provider-ref-1',amount:49.98,currency:'GMD',status:'flagged'}
    });
    expect(result).toEqual({ignored:true,reason:'amount_mismatch'});
    expect(clientQuery).toHaveBeenCalledTimes(1);
    expect(clientQuery.mock.calls.some(([sql])=>sql.includes("provider_status='flagged'"))).toBe(false);
  });

  test('an unknown provider outcome can be retried only with the same withdrawal idempotency key',async()=>{
    const withdrawalId='8b7d5c24-46e4-4e8b-9db8-0f62b6c5f831';
    const processing={id:withdrawalId,user_id:'affiliate-user',wallet_id:'wallet-1',status:'processing',payout_method:'wave',payout_details:{account_number:'871234567',beneficiary_name:'Awa Jallow'},amount:'50',wallet_debit_amount:'50',service_fee_amount:'0'};
    const reserved={...processing,status:'payout_pending',provider_status:'initiating'};
    const unknown={...reserved,provider_status:'unknown'};
    clientQuery
      .mockResolvedValueOnce({rows:[processing]})
      .mockResolvedValueOnce({rows:[{id:'wallet-1',balance:'100'}]})
      .mockResolvedValueOnce({rows:[{amount:'0'}]})
      .mockResolvedValueOnce({rows:[reserved]})
      .mockResolvedValueOnce({rows:[unknown]})
      .mockResolvedValueOnce({rows:[{id:'wallet-1',balance:'100'}]})
      .mockResolvedValueOnce({rows:[{amount:'0'}]})
      .mockResolvedValueOnce({rows:[reserved]});
    query
      .mockResolvedValueOnce({rows:[]})
      .mockResolvedValueOnce({rows:[unknown]})
      .mockResolvedValueOnce({rows:[]})
      .mockResolvedValueOnce({rows:[unknown]});
    modemPay.initiateTransfer.mockRejectedValue({code:'MODEM_PAY_NETWORK_ERROR',statusCode:503});

    const first=await service.approve(withdrawalId,'admin-user');
    const second=await service.approve(withdrawalId,'admin-user');

    expect(first).toMatchObject({id:withdrawalId,status:'payout_pending',provider_status:'unknown'});
    expect(second).toMatchObject({id:withdrawalId,status:'payout_pending',provider_status:'unknown'});
    expect(modemPay.initiateTransfer).toHaveBeenCalledTimes(2);
    expect(modemPay.initiateTransfer.mock.calls[0][0].idempotencyKey).toBe('marketlink-withdrawal-'+withdrawalId);
    expect(modemPay.initiateTransfer.mock.calls[1][0].idempotencyKey).toBe('marketlink-withdrawal-'+withdrawalId);
    expect(query.mock.calls.filter(([sql])=>sql.includes("provider_status='unknown'"))).toHaveLength(2);
  });

  test('blocks Admin payout approval before any transaction when the provider is not configured',async()=>{
    modemPay.isConfigured.mockReturnValue(false);
    await expect(service.approve('8b7d5c24-46e4-4e8b-9db8-0f62b6c5f831','admin-user'))
      .rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE',statusCode:503});
    expect(withTransaction).not.toHaveBeenCalled();
    expect(modemPay.quoteTransferFee).not.toHaveBeenCalled();
    expect(modemPay.initiateTransfer).not.toHaveBeenCalled();
  });

  test('a synchronous completed provider response debits the wallet exactly once',async()=>{
    const withdrawalId='8b7d5c24-46e4-4e8b-9db8-0f62b6c5f831';
    const processing={id:withdrawalId,user_id:'affiliate-user',wallet_id:'wallet-1',status:'processing',payout_method:'wave',payout_details:{account_number:'871234567',beneficiary_name:'Awa Jallow'},amount:'50',wallet_debit_amount:'50',service_fee_amount:'0',provider_fee_quote:null};
    const reserved={...processing,status:'payout_pending',provider_status:'initiating'};
    const bound={...reserved,provider_ref:'provider-ref-1',provider_status:'completed'};
    const completed={...bound,status:'completed',provider_status:'completed'};
    clientQuery
      .mockResolvedValueOnce({rows:[processing]})
      .mockResolvedValueOnce({rows:[{id:'wallet-1',balance:'100'}]})
      .mockResolvedValueOnce({rows:[{amount:'0'}]})
      .mockResolvedValueOnce({rows:[reserved]})
      .mockResolvedValueOnce({rows:[bound]})
      .mockResolvedValueOnce({rows:[{id:'wallet-1',balance:'50'}]})
      .mockResolvedValueOnce({rows:[]})
      .mockResolvedValueOnce({rows:[completed]})
      .mockResolvedValueOnce({rows:[]});
    query
      .mockResolvedValueOnce({rows:[]})
      .mockResolvedValueOnce({rows:[bound]});
    modemPay.initiateTransfer.mockResolvedValue({
      id:'provider-ref-1',status:'completed',amount:50,currency:'GMD',
      fee:0,metadata:{withdrawal_id:withdrawalId}
    });

    const result=await service.approve(withdrawalId,'admin-user');

    expect(result).toMatchObject({id:withdrawalId,status:'completed',provider_ref:'provider-ref-1'});
    expect(clientQuery.mock.calls.filter(([sql])=>sql.includes('UPDATE wallets SET balance=balance-$1'))).toHaveLength(1);
    expect(clientQuery.mock.calls.filter(([sql])=>sql.includes("VALUES ($1,'debit','withdrawal'"))).toHaveLength(1);
    expect(modemPay.initiateTransfer).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey:'marketlink-withdrawal-'+withdrawalId,
      amount:50,currency:'GMD',network:'wave',accountNumber:'871234567'
    }));
  });

  test('a failed payout fee quote restores the request to an uninitiated state and sends no transfer',async()=>{
    const withdrawalId='8b7d5c24-46e4-4e8b-9db8-0f62b6c5f831';
    const processing={id:withdrawalId,user_id:'affiliate-user',wallet_id:'wallet-1',status:'processing',payout_method:'wave',payout_details:{account_number:'871234567',beneficiary_name:'Awa Jallow'},amount:'50',wallet_debit_amount:'50',service_fee_amount:'0'};
    const reserved={...processing,status:'payout_pending',provider_status:'initiating'};
    clientQuery
      .mockResolvedValueOnce({rows:[processing]})
      .mockResolvedValueOnce({rows:[{id:'wallet-1',balance:'100'}]})
      .mockResolvedValueOnce({rows:[{amount:'0'}]})
      .mockResolvedValueOnce({rows:[reserved]});
    query.mockResolvedValueOnce({rows:[]});
    modemPay.quoteTransferFee.mockRejectedValue(new Error('fee service unavailable'));

    await expect(service.approve(withdrawalId,'admin-user'))
      .rejects.toMatchObject({code:'PAYOUT_FEE_QUOTE_FAILED',statusCode:503});

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("SET status='processing',provider_status='fee_quote_failed'"),
      expect.any(Array)
    );
    expect(modemPay.initiateTransfer).not.toHaveBeenCalled();
  });
  test('Admin cannot reject a payout after provider initiation has begun',async()=>{
    const pending={id:'withdrawal-payout-pending',user_id:'affiliate-user',status:'payout_pending',provider_status:'initiating'};
    clientQuery.mockResolvedValueOnce({rows:[pending]});

    await expect(service.reject(pending.id,'admin-user'))
      .rejects.toMatchObject({code:'ALREADY_PROCESSED',statusCode:409});

    expect(clientQuery).toHaveBeenCalledTimes(1);
    expect(clientQuery.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(clientQuery.mock.calls.some(([sql])=>/UPDATE withdrawals|UPDATE wallets|INSERT INTO transactions/.test(sql))).toBe(false);
  });

  test('a repeated provider failure after rejection cannot release or debit funds a second time',async()=>{
    const withdrawalId='8b7d5c24-46e4-4e8b-9db8-0f62b6c5f831';
    const rejected={id:withdrawalId,user_id:'affiliate-user',wallet_id:'wallet-1',status:'rejected',provider_status:'failed',provider_ref:'provider-ref-1',amount:'50'};
    clientQuery.mockResolvedValueOnce({rows:[rejected]});

    const result=await service.processProviderWebhook({
      event:'transfer.failed',
      payload:{metadata:{withdrawal_id:withdrawalId},id:'provider-ref-1',amount:50,currency:'GMD',status:'failed'}
    });

    expect(result).toMatchObject({processed:true,data:{duplicate:true,data:{status:'rejected',provider_status:'failed'}}});
    expect(clientQuery).toHaveBeenCalledTimes(1);
    expect(clientQuery.mock.calls.some(([sql])=>/UPDATE withdrawals|UPDATE wallets|INSERT INTO transactions/.test(sql))).toBe(false);
  });

  test('a terminal rejected withdrawal does not acknowledge a failure callback with a mismatched provider reference',async()=>{
    const withdrawalId='8b7d5c24-46e4-4e8b-9db8-0f62b6c5f831';
    const rejected={id:withdrawalId,status:'rejected',provider_status:'failed',provider_ref:'provider-ref-1',amount:'50'};
    clientQuery.mockResolvedValueOnce({rows:[rejected]});

    const result=await service.processProviderWebhook({
      event:'transfer.failed',
      payload:{metadata:{withdrawal_id:withdrawalId},id:'wrong-provider-ref',amount:50,currency:'GMD',status:'failed'}
    });

    expect(result).toEqual({processed:true,data:{ignored:true,reason:'provider_reference_mismatch'}});
    expect(clientQuery).toHaveBeenCalledTimes(1);
    expect(clientQuery.mock.calls.some(([sql])=>/UPDATE withdrawals|UPDATE wallets|INSERT INTO transactions/.test(sql))).toBe(false);
  });

  test('a terminal rejected withdrawal does not acknowledge a failure callback with a mismatched amount',async()=>{
    const withdrawalId='8b7d5c24-46e4-4e8b-9db8-0f62b6c5f831';
    const rejected={id:withdrawalId,status:'rejected',provider_status:'failed',provider_ref:'provider-ref-1',amount:'50'};
    clientQuery.mockResolvedValueOnce({rows:[rejected]});

    const result=await service.processProviderWebhook({
      event:'transfer.failed',
      payload:{metadata:{withdrawal_id:withdrawalId},id:'provider-ref-1',amount:49,currency:'GMD',status:'failed'}
    });

    expect(result).toEqual({processed:true,data:{ignored:true,reason:'amount_mismatch'}});
    expect(clientQuery).toHaveBeenCalledTimes(1);
    expect(clientQuery.mock.calls.some(([sql])=>/UPDATE withdrawals|UPDATE wallets|INSERT INTO transactions/.test(sql))).toBe(false);
  });

});
