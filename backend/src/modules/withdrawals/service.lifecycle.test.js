'use strict';

jest.mock('../../config/db',()=>({query:jest.fn(),withTransaction:jest.fn()}));
jest.mock('bcryptjs',()=>({compare:jest.fn()}));

const {withTransaction}=require('../../config/db');
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
    expect(clientQuery).toHaveBeenCalledTimes(5);
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
});
