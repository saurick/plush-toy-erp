-- Modify "finance_facts" table
ALTER TABLE "finance_facts" ADD CONSTRAINT "finance_facts_currency_allowed" CHECK ((currency)::text = ANY ((ARRAY['USD'::character varying, 'CNY'::character varying, 'HKD'::character varying])::text[])), ADD CONSTRAINT "finance_facts_fee_amount_nonnegative" CHECK (fee_amount >= (0)::numeric), ADD COLUMN "fee_amount" numeric(20,6) NOT NULL DEFAULT 0;
