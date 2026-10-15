-- migration-risk: maintenance
-- affected-table: finance_facts
-- expected-lock: ROW EXCLUSIVE while reconciling explicitly marked simulated outsourcing payable snapshots
-- preflight: scripts/qa/finance-fact-due-at-preflight.sql
-- recovery: restore verified backup or apply a forward-fix migration; never edit an applied revision
-- maintenance-required: true

UPDATE finance_facts AS target
   SET payment_term = 'CASH_ON_SHIPMENT',
       payment_term_days = 0
  FROM outsourcing_facts AS source_fact
  JOIN outsourcing_orders AS source_order
    ON source_order.id = source_fact.source_id
 WHERE target.fact_type = 'PAYABLE'
   AND target.source_type = 'OUTSOURCING_FACT'
   AND target.source_id = source_fact.id
   AND target.counterparty_type = 'SUPPLIER'
   AND target.counterparty_id = source_order.supplier_id
   AND source_fact.source_type = 'OUTSOURCING_ORDER'
   AND source_fact.supplier_id = source_order.supplier_id
   AND source_order.supplier_snapshot ->> 'simulated_only' = 'true'
   AND target.payment_term IS NULL
   AND target.payment_term_days IS NULL;
