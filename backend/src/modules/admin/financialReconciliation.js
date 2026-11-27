'use strict';

const { query } = require('../../config/db');

const moneyTolerance = 0.01;

async function getFinancialReconciliation({ limit = 50 } = {}) {
  const pageSize = Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 100);
  const [
    missingCommission, pendingSettlement, amountMismatches, missingRecipients,
    missingCredits, withdrawalQueue, walletMismatches, codRemittancesNeedingAttention, duplicateReferences, settlementCreditMismatches, refundReversalRecovery,
  ] = await Promise.all([
    query(`SELECT o.id, o.order_number, o.total, o.payment_method, o.payment_status,
                  o.vendor_payout, o.rider_payout, o.affiliate_commission_amount,
                  o.delivered_at, o.updated_at
           FROM orders o
           LEFT JOIN commission_records c ON c.order_id=o.id
           WHERE o.status='delivered' AND o.payment_status='confirmed' AND c.id IS NULL
           ORDER BY o.delivered_at DESC NULLS LAST LIMIT $1`, [pageSize]),
    query(`SELECT o.id, o.order_number, c.id AS commission_id, c.status,
                  o.total, c.vendor_payout, c.rider_payout, c.affiliate_commission_amount,
                  o.delivered_at
           FROM orders o JOIN commission_records c ON c.order_id=o.id
           WHERE o.status='delivered' AND o.payment_status='confirmed' AND c.status='pending'
           ORDER BY o.delivered_at ASC NULLS LAST LIMIT $1`, [pageSize]),
    query(`SELECT o.id, o.order_number, c.id AS commission_id, c.status,
                  o.total AS order_total, c.order_total AS ledger_total,
                  o.vendor_payout AS order_vendor_payout, c.vendor_payout AS ledger_vendor_payout,
                  o.rider_payout AS order_rider_payout, c.rider_payout AS ledger_rider_payout,
                  o.affiliate_commission_amount AS order_affiliate_amount,
                  c.affiliate_commission_amount AS ledger_affiliate_amount,
                  o.platform_net_fee AS order_platform_net, c.platform_net_amount AS ledger_platform_net,
                  o.platform_fee AS order_platform_fee, c.commission_amount AS ledger_platform_fee
           FROM orders o JOIN commission_records c ON c.order_id=o.id
           WHERE ABS(COALESCE(o.total,0)-COALESCE(c.order_total,0)) > $1
              OR ABS(COALESCE(o.vendor_payout,0)-COALESCE(c.vendor_payout,0)) > $1
              OR ABS(COALESCE(o.rider_payout,0)-COALESCE(c.rider_payout,0)) > $1
              OR ABS(COALESCE(o.affiliate_commission_amount,0)-COALESCE(c.affiliate_commission_amount,0)) > $1
              OR ABS(COALESCE(o.platform_net_fee,0)-COALESCE(c.platform_net_amount,0)) > $1
              OR ABS(COALESCE(o.platform_fee,0)-COALESCE(c.commission_amount,0)) > $1
              OR o.vendor_id IS DISTINCT FROM c.vendor_id
              OR o.affiliate_user_id IS DISTINCT FROM c.affiliate_user_id
           ORDER BY o.updated_at DESC LIMIT $2`, [moneyTolerance, pageSize]),
    query(`SELECT o.id, o.order_number, o.total, o.vendor_id,
                  o.rider_payout, d.rider_id, o.affiliate_commission_amount, o.affiliate_user_id
           FROM orders o
           LEFT JOIN deliveries d ON d.order_id=o.id
           LEFT JOIN users vu ON vu.id=o.vendor_id
           LEFT JOIN users ru ON ru.id=d.rider_id
           LEFT JOIN users au ON au.id=o.affiliate_user_id
           WHERE o.status='delivered' AND o.payment_status='confirmed'
             AND ((COALESCE(o.vendor_payout,0)>0 AND vu.id IS NULL)
               OR (COALESCE(o.rider_payout,0)>0 AND (d.id IS NULL OR d.rider_id IS NULL OR ru.id IS NULL))
               OR (COALESCE(o.affiliate_commission_amount,0)>0 AND (o.affiliate_user_id IS NULL OR au.id IS NULL)))
           ORDER BY o.delivered_at DESC NULLS LAST LIMIT $1`, [pageSize]),
    query(`SELECT o.id, o.order_number, o.total, o.vendor_payout, o.rider_payout,
                  o.affiliate_commission_amount, o.platform_net_fee,
                  c.status AS commission_status,
                  (COALESCE(o.vendor_payout,0)>0 AND NOT EXISTS (
                    SELECT 1 FROM transactions t WHERE t.reference_type='order_vendor_payout'
                      AND t.reference_id=o.id AND t.category='vendor_sale' AND t.type='credit')) AS vendor_credit_missing,
                  (COALESCE(o.rider_payout,0)>0 AND NOT EXISTS (
                    SELECT 1 FROM transactions t WHERE t.reference_type='order_rider_payout'
                      AND t.reference_id=o.id AND t.category='delivery_earning' AND t.type='credit')) AS rider_credit_missing,
                  (COALESCE(o.rider_payout,0)>0 AND NOT EXISTS (
                    SELECT 1 FROM rider_earnings re WHERE re.order_id=o.id AND re.rider_id=d.rider_id
                      AND ABS(COALESCE(re.amount,0)-COALESCE(o.rider_payout,0)) <= $1)) AS rider_earning_record_missing,
                  (COALESCE(o.affiliate_commission_amount,0)>0 AND NOT EXISTS (
                    SELECT 1 FROM transactions t WHERE t.reference_type='order_affiliate_payout'
                      AND t.reference_id=o.id AND t.category='affiliate_commission' AND t.type='credit')) AS affiliate_credit_missing,
                  (NOT EXISTS (SELECT 1 FROM platform_earnings pe WHERE pe.order_id=o.id)) AS platform_earning_missing,
                  (EXISTS (SELECT 1 FROM platform_earnings pe WHERE pe.order_id=o.id
                    AND ABS(COALESCE(pe.commission_amount,0)-COALESCE(o.platform_net_fee,0)) > $1)) AS platform_earning_mismatch
           FROM orders o JOIN commission_records c ON c.order_id=o.id
           LEFT JOIN deliveries d ON d.order_id=o.id
           WHERE o.status='delivered' AND o.payment_status='confirmed' AND c.status='paid'
             AND ((COALESCE(o.vendor_payout,0)>0 AND NOT EXISTS (
                    SELECT 1 FROM transactions t WHERE t.reference_type='order_vendor_payout' AND t.reference_id=o.id AND t.category='vendor_sale' AND t.type='credit'))
               OR (COALESCE(o.rider_payout,0)>0 AND NOT EXISTS (
                    SELECT 1 FROM transactions t WHERE t.reference_type='order_rider_payout' AND t.reference_id=o.id AND t.category='delivery_earning' AND t.type='credit'))
               OR (COALESCE(o.rider_payout,0)>0 AND NOT EXISTS (
                    SELECT 1 FROM rider_earnings re WHERE re.order_id=o.id AND re.rider_id=d.rider_id
                      AND ABS(COALESCE(re.amount,0)-COALESCE(o.rider_payout,0)) <= $1))
               OR EXISTS (SELECT 1 FROM platform_earnings pe WHERE pe.order_id=o.id
                    AND ABS(COALESCE(pe.commission_amount,0)-COALESCE(o.platform_net_fee,0)) > $1)
               OR (COALESCE(o.affiliate_commission_amount,0)>0 AND NOT EXISTS (
                    SELECT 1 FROM transactions t WHERE t.reference_type='order_affiliate_payout' AND t.reference_id=o.id AND t.category='affiliate_commission' AND t.type='credit'))
               OR NOT EXISTS (SELECT 1 FROM platform_earnings pe WHERE pe.order_id=o.id)
               )
           ORDER BY o.delivered_at DESC NULLS LAST LIMIT $2`, [moneyTolerance, pageSize]),
    query(`SELECT w.id, w.user_id, u.full_name, w.amount, w.payout_method, w.status,
                  w.provider_status, w.provider_ref, w.created_at,
                  EXTRACT(EPOCH FROM (now()-w.created_at))/3600 AS age_hours
           FROM withdrawals w LEFT JOIN users u ON u.id=w.user_id
           WHERE w.status IN ('initiating','processing','payout_pending')
              OR w.provider_status IN ('flagged','unknown','unknown_reference','initiation_unknown','failed','cancelled','initiation_failed','reversed')
              OR (w.status='rejected' AND w.provider_status='reversed')
           ORDER BY w.created_at ASC LIMIT $1`, [pageSize]),
    query(`SELECT w.id AS wallet_id, w.user_id, w.balance AS wallet_balance,
                  latest.balance_after AS ledger_balance, latest.created_at AS last_transaction_at,
                  (COALESCE(w.balance,0)-COALESCE(latest.balance_after,0)) AS difference,
                  (latest.created_at IS NULL) AS has_no_ledger_entries
           FROM wallets w
           LEFT JOIN LATERAL (
             SELECT t.balance_after,t.created_at FROM transactions t
             WHERE t.wallet_id=w.id ORDER BY t.created_at DESC,t.id DESC LIMIT 1
           ) latest ON TRUE
           WHERE ABS(COALESCE(w.balance,0)-COALESCE(latest.balance_after,0)) > $1
           ORDER BY ABS(COALESCE(w.balance,0)-COALESCE(latest.balance_after,0)) DESC LIMIT $2`, [moneyTolerance, pageSize]),
    query(`SELECT r.id AS remittance_id,r.payment_id,r.order_id,r.rider_id,r.amount,r.currency,
                  r.deposit_method,r.provider_reference,r.proof_url,r.review_note,
                  r.status AS remittance_status,r.submitted_at,r.reviewed_at,
                  o.order_number,o.status AS order_status,
                  o.payment_status,p.status AS payment_record_status,
                  c.status AS commission_status,rider.full_name AS rider_name
           FROM cod_cash_remittances r
           JOIN payments p ON p.id=r.payment_id
           JOIN orders o ON o.id=r.order_id
           LEFT JOIN commission_records c ON c.order_id=o.id
           LEFT JOIN users rider ON rider.id=r.rider_id
           WHERE r.status='submitted'
              OR (r.status='verified' AND (p.status<>'confirmed' OR COALESCE(c.status,'')<>'paid'))
           ORDER BY r.submitted_at ASC LIMIT $1`, [pageSize]),
    query(`SELECT 'wallet_transaction_reference' AS kind, reference_type, reference_id,
                  category, count(*) AS duplicate_count, sum(amount) AS amount_total
           FROM transactions
           WHERE reference_id IS NOT NULL AND reference_type IS NOT NULL
           GROUP BY reference_type,reference_id,category HAVING count(*)>1
           UNION ALL
           SELECT 'payment_provider_reference', 'payment', NULL::uuid, provider_ref,
                  count(*) AS duplicate_count, sum(amount) AS amount_total
           FROM payments WHERE provider_ref IS NOT NULL AND btrim(provider_ref)<>''
           GROUP BY provider_ref HAVING count(*)>1
           UNION ALL
           SELECT 'withdrawal_provider_reference', 'withdrawal', NULL::uuid, provider_ref,
                  count(*) AS duplicate_count, sum(amount) AS amount_total
           FROM withdrawals WHERE provider_ref IS NOT NULL AND btrim(provider_ref)<>''
           GROUP BY provider_ref HAVING count(*)>1
           LIMIT $1`, [pageSize]),
    query(`SELECT o.id, o.order_number, o.vendor_id, d.rider_id,
                  o.affiliate_user_id, o.vendor_payout, o.rider_payout,
                  o.affiliate_commission_amount, o.platform_net_fee,
                  o.payout_fee_recovery_amount,
                  COALESCE(vtx.credit_count,0) AS vendor_credit_count,
                  COALESCE(vtx.credit_amount,0) AS vendor_credit_amount,
                  COALESCE(vtx.wrong_recipient_count,0) AS vendor_wrong_recipient_count,
                  COALESCE(rtx.credit_count,0) AS rider_credit_count,
                  COALESCE(rtx.credit_amount,0) AS rider_credit_amount,
                  COALESCE(rtx.wrong_recipient_count,0) AS rider_wrong_recipient_count,
                  COALESCE(atx.credit_count,0) AS affiliate_credit_count,
                  COALESCE(atx.credit_amount,0) AS affiliate_credit_amount,
                  COALESCE(atx.wrong_recipient_count,0) AS affiliate_wrong_recipient_count,
                  COALESCE(pe.earning_count,0) AS platform_earning_count,
                  COALESCE(pe.commission_amount,0) AS platform_earning_amount,
                  COALESCE(pe.payout_fee_recovery_amount,0) AS platform_recovery_amount
           FROM orders o
           JOIN commission_records c ON c.order_id=o.id AND c.status='paid'
           LEFT JOIN deliveries d ON d.order_id=o.id
           LEFT JOIN LATERAL (
             SELECT COUNT(*) FILTER (WHERE t.type='credit')::int AS credit_count,
                    COALESCE(SUM(t.amount) FILTER (WHERE t.type='credit'),0) AS credit_amount,
                    COUNT(*) FILTER (WHERE t.type='credit' AND w.user_id IS DISTINCT FROM o.vendor_id)::int AS wrong_recipient_count
             FROM transactions t LEFT JOIN wallets w ON w.id=t.wallet_id
             WHERE t.reference_type='order_vendor_payout' AND t.reference_id=o.id AND t.category='vendor_sale'
           ) vtx ON TRUE
           LEFT JOIN LATERAL (
             SELECT COUNT(*) FILTER (WHERE t.type='credit')::int AS credit_count,
                    COALESCE(SUM(t.amount) FILTER (WHERE t.type='credit'),0) AS credit_amount,
                    COUNT(*) FILTER (WHERE t.type='credit' AND w.user_id IS DISTINCT FROM d.rider_id)::int AS wrong_recipient_count
             FROM transactions t LEFT JOIN wallets w ON w.id=t.wallet_id
             WHERE t.reference_type='order_rider_payout' AND t.reference_id=o.id AND t.category='delivery_earning'
           ) rtx ON TRUE
           LEFT JOIN LATERAL (
             SELECT COUNT(*) FILTER (WHERE t.type='credit')::int AS credit_count,
                    COALESCE(SUM(t.amount) FILTER (WHERE t.type='credit'),0) AS credit_amount,
                    COUNT(*) FILTER (WHERE t.type='credit' AND w.user_id IS DISTINCT FROM o.affiliate_user_id)::int AS wrong_recipient_count
             FROM transactions t LEFT JOIN wallets w ON w.id=t.wallet_id
             WHERE t.reference_type='order_affiliate_payout' AND t.reference_id=o.id AND t.category='affiliate_commission'
           ) atx ON TRUE
           LEFT JOIN LATERAL (
             SELECT COUNT(*)::int AS earning_count,
                    COALESCE(MAX(commission_amount),0) AS commission_amount,
                    COALESCE(MAX(payout_fee_recovery_amount),0) AS payout_fee_recovery_amount
             FROM platform_earnings WHERE order_id=o.id AND status='earned'
           ) pe ON TRUE
           WHERE o.status='delivered' AND o.payment_status='confirmed'
             AND (
               (COALESCE(o.vendor_payout,0)>0 AND (COALESCE(vtx.credit_count,0)<>1 OR ABS(COALESCE(vtx.credit_amount,0)-o.vendor_payout)>$1 OR COALESCE(vtx.wrong_recipient_count,0)>0))
               OR (COALESCE(o.vendor_payout,0)<=0 AND COALESCE(vtx.credit_count,0)>0)
               OR (COALESCE(o.rider_payout,0)>0 AND (COALESCE(rtx.credit_count,0)<>1 OR ABS(COALESCE(rtx.credit_amount,0)-o.rider_payout)>$1 OR COALESCE(rtx.wrong_recipient_count,0)>0))
               OR (COALESCE(o.rider_payout,0)<=0 AND COALESCE(rtx.credit_count,0)>0)
               OR (COALESCE(o.affiliate_commission_amount,0)>0 AND (COALESCE(atx.credit_count,0)<>1 OR ABS(COALESCE(atx.credit_amount,0)-o.affiliate_commission_amount)>$1 OR COALESCE(atx.wrong_recipient_count,0)>0))
               OR (COALESCE(o.affiliate_commission_amount,0)<=0 AND COALESCE(atx.credit_count,0)>0)
               OR COALESCE(pe.earning_count,0)<>1
               OR ABS(COALESCE(pe.commission_amount,0)-COALESCE(o.platform_net_fee,0))>$1
               OR ABS(COALESCE(pe.payout_fee_recovery_amount,0)-COALESCE(o.payout_fee_recovery_amount,0))>$1
             )
           ORDER BY o.delivered_at DESC NULLS LAST LIMIT $2`, [moneyTolerance, pageSize]),
    query(`SELECT fr.id AS reversal_id,fr.payment_id,fr.order_id,fr.amount,fr.currency,
                  fr.recovery_reason,fr.recovery_details,fr.attempt_count,fr.created_at,fr.updated_at,
                  p.method AS payment_method,p.status AS payment_status,p.refund_status,
                  o.order_number,o.status AS order_status,o.payment_status AS order_payment_status,
                  requested_by.full_name AS requested_by_name
           FROM financial_reversals fr
           JOIN payments p ON p.id=fr.payment_id
           JOIN orders o ON o.id=fr.order_id
           LEFT JOIN users requested_by ON requested_by.id=fr.requested_by
           WHERE fr.status='recovery_required'
           ORDER BY fr.updated_at ASC LIMIT $1`, [pageSize])
  ]);

  const sections = {
    deliveredWithoutCommission: missingCommission.rows,
    pendingSettlement: pendingSettlement.rows,
    amountMismatches: amountMismatches.rows,
    missingRecipients: missingRecipients.rows,
    missingWalletCredits: missingCredits.rows,
    withdrawalsNeedingAttention: withdrawalQueue.rows,
    walletLedgerMismatches: walletMismatches.rows,
    codRemittancesNeedingAttention: codRemittancesNeedingAttention.rows,
    duplicateReferences: duplicateReferences.rows,
    settlementCreditMismatches: settlementCreditMismatches.rows,
    refundsNeedingRecovery: refundReversalRecovery.rows,
  };
  const counts = Object.fromEntries(Object.entries(sections).map(([key, rows]) => [key, rows.length]));
  return {
    generatedAt: new Date().toISOString(),
    limit: pageSize,
    readOnly: true,
    counts,
    totalFindings: Object.values(counts).reduce((sum, count) => sum + count, 0),
    sections,
    note: 'Lists are capped to the requested limit per section. A zero count means no matching records were found by this check.',
  };
}

module.exports = { getFinancialReconciliation };
