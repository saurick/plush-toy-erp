package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
	"time"
)

type FinancePayment struct{ ent.Schema }

func (FinancePayment) Hooks() []ent.Hook {
	return []ent.Hook{rejectMutationOps(ent.OpDelete|ent.OpDeleteOne, "finance payments are immutable accounting source documents; reverse them instead of deleting them")}
}
func (FinancePayment) Annotations() []schema.Annotation {
	return []schema.Annotation{entsql.Annotation{Checks: map[string]string{
		"finance_payments_direction_allowed":    "direction IN ('RECEIPT', 'DISBURSEMENT')",
		"finance_payments_status_allowed":       "status IN ('DRAFT', 'APPROVED', 'REJECTED', 'POSTED', 'REVERSED', 'CANCELLED')",
		"finance_payments_counterparty_allowed": "counterparty_type IN ('CUSTOMER', 'SUPPLIER')",
		"finance_payments_direction_party_pair": "((direction = 'RECEIPT' AND counterparty_type = 'CUSTOMER') OR (direction = 'DISBURSEMENT' AND counterparty_type = 'SUPPLIER'))",
		"finance_payments_amount_positive":      "amount > 0", "finance_payments_currency_allowed": "currency IN ('USD', 'CNY', 'HKD')",
		"finance_payments_version_positive": "version > 0", "finance_payments_intent_bundle": "length(trim(idempotency_key)) BETWEEN 1 AND 128 AND length(idempotency_payload_hash) = 64",
		"finance_payments_maker_checker": "approved_by IS NULL OR approved_by <> created_by",
		"finance_payments_lifecycle_audit": `
(
  (status = 'DRAFT'
    AND approved_at IS NULL AND approved_by IS NULL
    AND rejected_at IS NULL AND rejected_by IS NULL AND reject_reason IS NULL
    AND posted_at IS NULL AND posted_by IS NULL
    AND cancelled_at IS NULL AND cancelled_by IS NULL AND cancel_reason IS NULL
    AND reversed_at IS NULL AND reversed_by IS NULL AND reverse_reason IS NULL)
  OR
  (status = 'APPROVED'
    AND approved_at IS NOT NULL AND approved_by IS NOT NULL
    AND rejected_at IS NULL AND rejected_by IS NULL AND reject_reason IS NULL
    AND posted_at IS NULL AND posted_by IS NULL
    AND cancelled_at IS NULL AND cancelled_by IS NULL AND cancel_reason IS NULL
    AND reversed_at IS NULL AND reversed_by IS NULL AND reverse_reason IS NULL)
  OR
  (status = 'REJECTED'
    AND approved_at IS NULL AND approved_by IS NULL
    AND rejected_at IS NOT NULL AND rejected_by IS NOT NULL
    AND reject_reason IS NOT NULL AND length(trim(reject_reason)) BETWEEN 1 AND 255
    AND posted_at IS NULL AND posted_by IS NULL
    AND cancelled_at IS NULL AND cancelled_by IS NULL AND cancel_reason IS NULL
    AND reversed_at IS NULL AND reversed_by IS NULL AND reverse_reason IS NULL)
  OR
  (status = 'POSTED'
    AND approved_at IS NOT NULL AND approved_by IS NOT NULL
    AND rejected_at IS NULL AND rejected_by IS NULL AND reject_reason IS NULL
    AND posted_at IS NOT NULL AND posted_by IS NOT NULL
    AND cancelled_at IS NULL AND cancelled_by IS NULL AND cancel_reason IS NULL
    AND reversed_at IS NULL AND reversed_by IS NULL AND reverse_reason IS NULL)
  OR
  (status = 'REVERSED'
    AND approved_at IS NOT NULL AND approved_by IS NOT NULL
    AND rejected_at IS NULL AND rejected_by IS NULL AND reject_reason IS NULL
    AND posted_at IS NOT NULL AND posted_by IS NOT NULL
    AND cancelled_at IS NULL AND cancelled_by IS NULL AND cancel_reason IS NULL
    AND reversed_at IS NOT NULL AND reversed_by IS NOT NULL
    AND reverse_reason IS NOT NULL AND length(trim(reverse_reason)) BETWEEN 1 AND 255)
  OR
  (status = 'CANCELLED'
    AND (
      (approved_at IS NULL AND approved_by IS NULL
        AND rejected_at IS NULL AND rejected_by IS NULL AND reject_reason IS NULL)
      OR
      (approved_at IS NOT NULL AND approved_by IS NOT NULL
        AND rejected_at IS NULL AND rejected_by IS NULL AND reject_reason IS NULL)
      OR
      (approved_at IS NULL AND approved_by IS NULL
        AND rejected_at IS NOT NULL AND rejected_by IS NOT NULL
        AND reject_reason IS NOT NULL AND length(trim(reject_reason)) BETWEEN 1 AND 255)
    )
    AND posted_at IS NULL AND posted_by IS NULL
    AND cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL
    AND cancel_reason IS NOT NULL AND length(trim(cancel_reason)) BETWEEN 1 AND 255
    AND reversed_at IS NULL AND reversed_by IS NULL AND reverse_reason IS NULL)
)`,
	}}}
}
func (FinancePayment) Fields() []ent.Field {
	return []ent.Field{
		field.String("payment_no").NotEmpty().MaxLen(64).Immutable(), field.String("direction").NotEmpty().MaxLen(16).Immutable(), field.String("status").NotEmpty().Default("DRAFT").MaxLen(16),
		field.String("counterparty_type").NotEmpty().MaxLen(16).Immutable(), field.Int("counterparty_id").Positive().Immutable(),
		immutableDecimalQuantityField("amount"), field.String("currency").NotEmpty().MaxLen(16).Immutable(),
		field.String("account_ref").NotEmpty().MaxLen(128).Immutable(), field.String("evidence_ref").NotEmpty().MaxLen(255).Immutable(),
		field.String("idempotency_key").NotEmpty().MaxLen(128).Immutable(), field.String("idempotency_payload_hash").NotEmpty().MinLen(64).MaxLen(64).Immutable(),
		field.Int("version").Default(1).Positive(), field.Time("occurred_at").Default(time.Now).Immutable(),
		field.Time("approved_at").Optional().Nillable(), field.Int("approved_by").Optional().Nillable().Positive(),
		field.Time("rejected_at").Optional().Nillable(), field.Int("rejected_by").Optional().Nillable().Positive(), field.String("reject_reason").Optional().Nillable().MaxLen(255),
		field.Time("posted_at").Optional().Nillable(), field.Int("posted_by").Optional().Nillable().Positive(),
		field.Time("cancelled_at").Optional().Nillable(), field.Int("cancelled_by").Optional().Nillable().Positive(), field.String("cancel_reason").Optional().Nillable().MaxLen(255),
		field.Time("reversed_at").Optional().Nillable(), field.Int("reversed_by").Optional().Nillable().Positive(), field.String("reverse_reason").Optional().Nillable().MaxLen(255),
		field.Int("created_by").Positive().Immutable(), field.Time("created_at").Default(time.Now).Immutable(), field.Time("updated_at").Default(time.Now).UpdateDefault(time.Now),
	}
}
func (FinancePayment) Edges() []ent.Edge {
	return []ent.Edge{edge.To("allocations", FinanceAllocation.Type)}
}
func (FinancePayment) Indexes() []ent.Index {
	return []ent.Index{index.Fields("payment_no").Unique(), index.Fields("created_by", "idempotency_key").Unique(), index.Fields("counterparty_type", "counterparty_id", "currency", "status")}
}
