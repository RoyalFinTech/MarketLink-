'use strict';

jest.mock('../../config/db', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));
jest.mock('../../integrations/modempay', () => ({
  isConfigured: jest.fn(() => true),
  isWebhookConfigured: jest.fn(() => true),
  isH2H: jest.fn(() => true),
  isH2HApproved: jest.fn(() => true),
  createPaymentIntent: jest.fn(),
}));

const { query } = require('../../config/db');
const modemPay = require('../../integrations/modempay');
const service = require('./service');

describe('DAHA deposit Gambian mobile number handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    modemPay.isConfigured.mockReturnValue(true);
    modemPay.isWebhookConfigured.mockReturnValue(true);
    modemPay.isH2H.mockReturnValue(true);
    modemPay.isH2HApproved.mockReturnValue(true);
  });

  test('accepts a full nine-digit number and sends only the seven subscriber digits to Modem Pay H2H', async () => {
    query
      .mockResolvedValueOnce({ rows: [] }) // ensure wallet insert
      .mockResolvedValueOnce({ rows: [{ id: 'wallet-1', user_id: 'user-1', balance: '0.00' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'deposit-1', amount: '50.00', status: 'initiating' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'deposit-1', amount: '50.00', status: 'pending' }] });
    modemPay.createPaymentIntent.mockResolvedValue({
      reference: 'provider-ref-1',
      status: 'pending',
      nextStep: { auth_mode: 'confirm' },
    });

    const result = await service.initiateDeposit('user-1', {
      amount: 50,
      method: 'wave',
      accountNumber: '87 123 4567',
    });

    expect(result.deposit.id).toBe('deposit-1');
    expect(modemPay.createPaymentIntent).toHaveBeenCalledWith(expect.objectContaining({
      network: 'wave',
      accountNumber: '1234567',
    }));
  });

  test('marks a failed DAHA deposit only after matching identity, amount, currency and provider reference', async () => {
    const deposit={id:'deposit-123',idempotency_key:'marketlink-daha-deposit-deposit-123',provider_ref:'provider-ref-123',amount:'50.00',currency:'GMD',status:'pending'};
    const clientQuery=jest.fn()
      .mockResolvedValueOnce({rows:[deposit]})
      .mockResolvedValueOnce({rows:[{id:'deposit-123'}]});
    const result=await service.failDepositWebhook({query:clientQuery},{
      external_reference:'marketlink-daha-deposit-deposit-123',
      id:'provider-ref-123',amount:50,currency:'GMD',status:'failed'
    },'charge.failed');
    expect(result).toEqual({processed:true,depositId:'deposit-123',status:'failed'});
    expect(clientQuery.mock.calls[0][0]).toContain('SELECT * FROM wallet_deposits WHERE idempotency_key=$1 FOR UPDATE');
    expect(clientQuery.mock.calls[1][0]).toContain("status='failed'");
    expect(clientQuery.mock.calls[1][1]).toEqual(['provider-ref-123','charge.failed','deposit-123']);
  });

  test('does not release a deposit when the failure event contradicts its payload status',async()=>{
    const deposit={id:'deposit-123',idempotency_key:'marketlink-daha-deposit-deposit-123',provider_ref:'provider-ref-123',amount:'50.00',currency:'GMD',status:'pending'};
    const clientQuery=jest.fn().mockResolvedValueOnce({rows:[deposit]});
    const result=await service.failDepositWebhook({query:clientQuery},{
      external_reference:'marketlink-daha-deposit-deposit-123',
      id:'provider-ref-123',amount:50,currency:'GMD',status:'completed'
    },'charge.failed');
    expect(result).toMatchObject({processed:true,ignored:true,reason:'event_status_mismatch'});
    expect(clientQuery).toHaveBeenCalledTimes(0);
  });

  test.each([
    ['amount_mismatch',{id:'provider-ref-123',amount:49,currency:'GMD'}],
    ['currency_mismatch',{id:'provider-ref-123',amount:50,currency:'USD'}],
    ['provider_reference_mismatch',{id:'another-provider-ref',amount:50,currency:'GMD'}],
  ])('does not fail a DAHA deposit when the signed callback has %s',async(reason,payload)=>{
    const deposit={id:'deposit-123',idempotency_key:'marketlink-daha-deposit-deposit-123',provider_ref:'provider-ref-123',amount:'50.00',currency:'GMD',status:'pending'};
    const clientQuery=jest.fn().mockResolvedValueOnce({rows:[deposit]});
    const result=await service.failDepositWebhook({query:clientQuery},{
      ...payload,external_reference:'marketlink-daha-deposit-deposit-123'
    },'charge.failed');
    expect(result).toMatchObject({processed:true,ignored:true,reason});
    expect(clientQuery).toHaveBeenCalledTimes(1);
  });

  test('rejects legacy seven-digit input instead of silently treating it as a full number', async () => {
    await expect(service.initiateDeposit('user-1', {
      amount: 50,
      method: 'wave',
      accountNumber: '1234567',
    })).rejects.toMatchObject({ code: 'INVALID_ACCOUNT_NUMBER' });

    expect(query).not.toHaveBeenCalled();
    expect(modemPay.createPaymentIntent).not.toHaveBeenCalled();
  });

  test('rejects a nine-digit number with an unsupported Gambian prefix', async () => {
    await expect(service.initiateDeposit('user-1', {
      amount: 50,
      method: 'wave',
      accountNumber: '881234567',
    })).rejects.toMatchObject({ code: 'INVALID_ACCOUNT_NUMBER' });

    expect(query).not.toHaveBeenCalled();
  });
});
