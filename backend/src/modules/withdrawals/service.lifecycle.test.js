'use strict';

jest.mock('../../config/db',()=>({query:jest.fn(),withTransaction:jest.fn()}));
jest.mock('bcryptjs',()=>({compare:jest.fn()}));

const {query,withTransaction}=require('../../config/db');
const bcrypt=require('bcryptjs');
const service=require('./service');

describe('affiliate marketer withdrawal request lifecycle',()=>{
  let clientQuery;
  beforeEach(()=>{
    jest.clearAllMocks();
    clientQuery=jest.fn();
    withTransaction.mockImplementation(fn=>fn({query:clientQuery}));
    bcrypt.compare.mockResolvedValue(true);
  });

  test('enforces the D50 minimum before opening a transaction',async()=>{
    await expect(service.requestWithdrawal('affiliate-user',{
      amount:49.99,payoutMethod:'wave',payoutDetails:{account_number:'871234567',beneficiary_name:'Awa Jallow'},pin:'1234'
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

  test('a provider failure with a mismatched reference cannot release a withdrawal reservation',async()=>{
    const withdrawalId='8b7d5c24-46e4-4e8b-9db8-0f62b6c5f831';
    clientQuery.mockResolvedValueOnce({rows:[{id:withdrawalId,status:'payout_pending',provider_ref:'provider-ref-1',amount:'50'}]});
    const result=await service.processProviderWebhook({
      event:'transfer.failed',
      payload:{metadata:{withdrawal_id:withdrawalId},id:'wrong-reference',amount:50,currency:'GMD',status:'failed'}
    });
    expect(result).toEqual({ignored:true,reason:'provider_reference_mismatch'});
    expect(clientQuery).toHaveBeenCalledTimes(1);
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
});
