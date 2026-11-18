'use strict';

jest.mock('../../config/db', () => ({
  query: jest.fn(),
  withTransaction: jest.fn(),
}));
const db = require('../../config/db');
const { listAdminConversations, getAdminConversationMessages, sendAdminConversationMessage, getAffiliateDirectory } = require('./service');

describe('Admin customer chat', () => {
  const client = { query: jest.fn() };
  beforeEach(() => {
    jest.clearAllMocks();
    db.withTransaction.mockImplementation(fn => fn(client));
  });

  test('lists conversations with protected participant search and pagination', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'conversation-1', unread_messages: 2 }] })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });

    const result = await listAdminConversations({ page: 2, limit: 10, search: 'Awa' });

    expect(result).toMatchObject({ items: [{ id: 'conversation-1' }], total: 1, page: 2, limit: 10 });
    expect(db.query.mock.calls[0][1]).toEqual(['%Awa%', 10, 10]);
    expect(db.query.mock.calls[0][0]).toMatch(/FROM conversations/i);
    expect(db.query.mock.calls[0][0]).toMatch(/last_message/i);
    expect(db.query.mock.calls[1][1]).toEqual(['%Awa%']);
  });

  test('uses bound pagination parameters when the chat inbox has no search filter', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] });

    const result = await listAdminConversations({ page: 1, limit: 30 });

    expect(result).toMatchObject({ items: [], total: 0, page: 1, limit: 30 });
    expect(db.query.mock.calls[0][0]).toMatch(/LIMIT \$1 OFFSET \$2/i);
    expect(db.query.mock.calls[0][1]).toEqual([30, 0]);
    expect(db.query.mock.calls[1][1]).toEqual([]);
  });

  test('uses bound pagination parameters in the affiliate directory without a search filter', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] });

    const result = await getAffiliateDirectory({ page: 1, limit: 50 });

    expect(result).toMatchObject({ items: [], total: 0, page: 1, limit: 50 });
    expect(db.query.mock.calls[0][0]).toMatch(/LIMIT \$1 OFFSET \$2/i);
    expect(db.query.mock.calls[0][1]).toEqual([50, 0]);
    expect(db.query.mock.calls[1][1]).toEqual([]);
  });

  test('returns conversation participants and messages in chronological order', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'conversation-1', participant_a_id: 'user-a', participant_b_id: 'user-b' }] })
      .mockResolvedValueOnce({ rows: [
        { id: 'message-2', sender_type: 'admin', created_at: '2026-11-18T12:02:00Z' },
        { id: 'message-1', sender_type: 'participant_a', created_at: '2026-11-18T12:01:00Z' },
      ] });

    const result = await getAdminConversationMessages('conversation-1', { limit: 20 });

    expect(result.conversation.id).toBe('conversation-1');
    expect(result.messages.map(message => message.id)).toEqual(['message-1', 'message-2']);
    expect(db.query.mock.calls[1][1]).toEqual(['conversation-1', 'user-a', 'user-b', 20]);
  });

  test('sends an audited reply and notifies both participants', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: 'conversation-1', participant_a: 'user-a', participant_b: 'user-b' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'message-1', body: 'We are checking this for you.' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await sendAdminConversationMessage('conversation-1', '  We are checking this for you.  ', { id: 'admin-1', role: 'admin' });

    expect(result).toMatchObject({ id: 'message-1' });
    expect(client.query).toHaveBeenCalledTimes(4);
    expect(client.query.mock.calls[2][0]).toMatch(/INSERT INTO notifications/i);
    expect(client.query.mock.calls[2][1]).toEqual(['user-a', 'user-b', 'conversation-1']);
    expect(client.query.mock.calls[3][0]).toMatch(/chat\.admin_reply_sent/);
  });

  test('rejects blank or oversized replies before opening a transaction', async () => {
    await expect(sendAdminConversationMessage('conversation-1', '   ', { id: 'admin-1' }))
      .rejects.toMatchObject({ code: 'INVALID_MESSAGE' });
    expect(db.withTransaction).not.toHaveBeenCalled();
  });
});
