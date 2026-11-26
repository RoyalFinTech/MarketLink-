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

  test('marks a failed DAHA deposit by external idempotency reference when metadata ID is absent', async () => {
    const clientQuery=jest.fn().mockResolvedValue({rows:[{id:'deposit-123'}]});
    const result=await service.failDepositWebhook(clientQuery,{
      external_reference:'marketlink-daha-deposit-deposit-123'
    },'charge.failed');
    expect(result).toEqual({processed:true,depositId:'deposit-123',status:'failed'});
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('WHERE idempotency_key=$1'),
      ['marketlink-daha-deposit-deposit-123','charge.failed']
    );
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
