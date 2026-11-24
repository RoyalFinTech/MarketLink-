'use strict';

jest.mock('../../config/db', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));
jest.mock('../../integrations/modempay', () => ({
  isConfigured: jest.fn(),
  isWebhookConfigured: jest.fn(),
  isH2H: jest.fn(),
  isH2HApproved: jest.fn(),
  quoteTransferFee: jest.fn(),
  initiateTransfer: jest.fn(),
}));

const { query, withTransaction } = require('../../config/db');
const modemPay = require('../../integrations/modempay');
const service = require('./service');

const withdrawal = (overrides = {}) => ({
  id: '11111111-1111-4111-8111-111111111111',
  user_id: 'affiliate-user',
  wallet_id: 'wallet-1',
  amount: '50.00',
  wallet_debit_amount: '50.00',
  service_fee_amount: '0.00',
  status: 'payout_pending',
  provider_ref: 'provider-transfer-1',
  ...overrides,
});

describe('DAHA withdrawal admin and provider lifecycle', () => {
  let clientQuery;

  beforeEach(() => {
    jest.clearAllMocks();
    clientQuery = jest.fn();
    withTransaction.mockImplementation((callback) => callback({ query: clientQuery }));
    modemPay.isConfigured.mockReturnValue(false);
    modemPay.isWebhookConfigured.mockReturnValue(true);
    modemPay.isH2H.mockReturnValue(false);
    modemPay.isH2HApproved.mockReturnValue(false);
  });

  test('does not start an Admin payout when the provider is not configured', async () => {
    await expect(service.approve(withdrawal().id, 'admin-1'))
      .rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE', statusCode: 503 });
    expect(withTransaction).not.toHaveBeenCalled();
    expect(modemPay.initiateTransfer).not.toHaveBeenCalled();
  });

  test('Admin rejection locks and transitions only a processing request', async () => {
    clientQuery
      .mockResolvedValueOnce({ rows: [withdrawal({ status: 'processing' })] })
      .mockResolvedValueOnce({ rows: [withdrawal({ status: 'rejected', provider_status: 'rejected_by_admin' })] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.reject(withdrawal().id, 'admin-1');

    expect(result.status).toBe('rejected');
    expect(clientQuery.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(clientQuery.mock.calls[1][0]).toContain("status='rejected'");
    expect(clientQuery.mock.calls[2][0]).toContain('INSERT INTO notifications');
  });

  test('Admin cannot reject a payout after provider processing has begun', async () => {
    clientQuery.mockResolvedValueOnce({ rows: [withdrawal()] });

    await expect(service.reject(withdrawal().id, 'admin-1'))
      .rejects.toMatchObject({ code: 'ALREADY_PROCESSED', statusCode: 409 });
    expect(clientQuery).toHaveBeenCalledTimes(1);
  });

  test('a verified successful provider callback debits the wallet and writes one ledger debit', async () => {
    const completed = withdrawal({ status: 'completed', provider_status: 'completed' });
    clientQuery
      .mockResolvedValueOnce({ rows: [withdrawal()] }) // bind callback reference under lock
      .mockResolvedValueOnce({ rows: [{ id: withdrawal().id }] })
      .mockResolvedValueOnce({ rows: [withdrawal()] }) // completion lock
      .mockResolvedValueOnce({ rows: [{ id: 'wallet-1', balance: '50.00' }] })
      .mockResolvedValueOnce({ rows: [] }) // wallet ledger debit
      .mockResolvedValueOnce({ rows: [completed] })
      .mockResolvedValueOnce({ rows: [] }); // notification

    const result = await service.processProviderWebhook({
      event: 'transfer.succeeded',
      payload: {
        id: 'provider-transfer-1',
        amount: '50.00',
        currency: 'GMD',
        status: 'completed',
        metadata: { withdrawal_id: withdrawal().id },
      },
    });

    expect(result.processed).toBe(true);
    expect(result.data.status).toBe('completed');
    expect(clientQuery.mock.calls[3][0]).toContain('balance=balance-$1');
    expect(clientQuery.mock.calls[4][0]).toContain('INSERT INTO transactions');
    expect(clientQuery.mock.calls[5][0]).toContain("status='completed'");
  });

  test('duplicate successful callbacks do not debit the wallet a second time', async () => {
    const completed = withdrawal({ status: 'completed', provider_status: 'completed' });
    clientQuery.mockResolvedValueOnce({ rows: [completed] });
    query.mockResolvedValueOnce({ rows: [completed] });

    const result = await service.processProviderWebhook({
      event: 'transfer.succeeded',
      payload: {
        id: 'provider-transfer-1',
        amount: '50.00',
        currency: 'GMD',
        status: 'completed',
        metadata: { withdrawal_id: withdrawal().id },
      },
    });

    expect(result.duplicate).toBe(true);
    expect(clientQuery).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith('SELECT * FROM withdrawals WHERE id=$1', [withdrawal().id]);
  });

  test('successful callback with a mismatched amount is ignored before any wallet debit', async () => {
    clientQuery.mockResolvedValueOnce({ rows: [withdrawal()] });

    const result = await service.processProviderWebhook({
      event: 'transfer.succeeded',
      payload: {
        id: 'provider-transfer-1',
        amount: '500.00',
        currency: 'GMD',
        status: 'completed',
        metadata: { withdrawal_id: withdrawal().id },
      },
    });

    expect(result).toEqual({ ignored: true, reason: 'amount_mismatch' });
    expect(clientQuery).toHaveBeenCalledTimes(1);
  });

  test('failed provider callback rejects the pending request and releases its reservation', async () => {
    const rejected = withdrawal({ status: 'rejected', provider_status: 'failed' });
    clientQuery
      .mockResolvedValueOnce({ rows: [withdrawal()] })
      .mockResolvedValueOnce({ rows: [rejected] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.processProviderWebhook({
      event: 'transfer.failed',
      payload: {
        id: 'provider-transfer-1',
        amount: '50.00',
        currency: 'GMD',
        status: 'failed',
        metadata: { withdrawal_id: withdrawal().id },
      },
    });

    expect(result.processed).toBe(true);
    expect(result.data.status).toBe('rejected');
    expect(clientQuery.mock.calls[1][0]).toContain("status='rejected'");
    expect(clientQuery.mock.calls[2][0]).toContain('INSERT INTO notifications');
  });
});
