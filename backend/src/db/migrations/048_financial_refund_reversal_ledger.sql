-- Financial reversals for settled order refunds.
-- Original credits are immutable; reversals are appended as debit transactions.
CREATE TABLE IF NOT EXISTS public.financial_reversals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id UUID NOT NULL UNIQUE REFERENCES public.payments(id) ON DELETE RESTRICT,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'GMD' CHECK (currency = 'GMD'),
  status VARCHAR(24) NOT NULL DEFAULT 'recovery_required'
    CHECK (status IN ('recovery_required','completed')),
  reason TEXT,
  recovery_reason TEXT,
  recovery_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  requested_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  completed_by UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_financial_reversals_status_created
  ON public.financial_reversals(status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.financial_reversal_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reversal_id UUID NOT NULL REFERENCES public.financial_reversals(id) ON DELETE RESTRICT,
  beneficiary_type VARCHAR(20) NOT NULL
    CHECK (beneficiary_type IN ('customer','vendor','rider','affiliate','platform')),
  beneficiary_user_id UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  wallet_id UUID REFERENCES public.wallets(id) ON DELETE RESTRICT,
  original_transaction_id UUID REFERENCES public.transactions(id) ON DELETE RESTRICT,
  reversal_transaction_id UUID UNIQUE REFERENCES public.transactions(id) ON DELETE RESTRICT,
  platform_earning_id UUID REFERENCES public.platform_earnings(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'GMD' CHECK (currency = 'GMD'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT financial_reversal_lines_one_type_per_reversal
    UNIQUE (reversal_id, beneficiary_type),
  CONSTRAINT financial_reversal_lines_target_check CHECK (
    (beneficiary_type = 'platform' AND wallet_id IS NULL AND platform_earning_id IS NOT NULL)
    OR
    (beneficiary_type <> 'platform' AND wallet_id IS NOT NULL AND beneficiary_user_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_financial_reversal_lines_reversal
  ON public.financial_reversal_lines(reversal_id);

-- Idempotency keys for appended reversal debits and the customer refund credit.
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_order_financial_reversal
  ON public.transactions(wallet_id, reference_type, reference_id)
  WHERE reference_type IN (
    'order_vendor_reversal',
    'order_rider_reversal',
    'order_affiliate_reversal'
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_payment_refund_credit
  ON public.transactions(wallet_id, reference_type, reference_id)
  WHERE reference_type = 'payment_refund_credit';

ALTER TABLE public.financial_reversals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_reversal_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.financial_reversals, public.financial_reversal_lines
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_reversals,
  public.financial_reversal_lines TO service_role;

COMMENT ON TABLE public.financial_reversals IS
  'Admin full-refund workflow. A recovery_required row means no customer refund or beneficiary debit has been applied.';
COMMENT ON TABLE public.financial_reversal_lines IS
  'Immutable plan and transaction links for a financial reversal. Original earning credits are never deleted.';
