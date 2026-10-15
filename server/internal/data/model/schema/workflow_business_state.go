package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type WorkflowBusinessState struct {
	ent.Schema
}

func (WorkflowBusinessState) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Checks: map[string]string{
			"workflow_business_states_status_allowed": "business_status_key IN ('project_pending', 'project_approved', 'engineering_preparing', 'material_preparing', 'production_ready', 'production_processing', 'qc_pending', 'iqc_pending', 'qc_failed', 'warehouse_processing', 'warehouse_inbound_pending', 'inbound_done', 'shipment_pending', 'shipping_released', 'shipped', 'reconciling', 'settled', 'blocked', 'cancelled', 'closed')",
		}},
	}
}

func (WorkflowBusinessState) Fields() []ent.Field {
	return []ent.Field{
		// Workflow state is a coordination projection for a source object, not a posted business fact.
		field.String("source_type").
			NotEmpty().
			MaxLen(64),
		field.Int("source_id").
			Positive(),
		field.String("source_no").
			Optional().
			Nillable().
			MaxLen(128),
		field.Int("order_id").
			Optional().
			Nillable().
			Positive(),
		field.Int("batch_id").
			Optional().
			Nillable().
			Positive(),
		field.String("business_status_key").
			NotEmpty().
			MaxLen(64),
		field.String("owner_role_key").
			Optional().
			Nillable().
			MaxLen(32),
		field.String("blocked_reason").
			Optional().
			Nillable().
			MaxLen(255),
		field.Time("status_changed_at").
			Default(time.Now),
		// Payload preserves workflow context only; fact tables remain the source of posted business truth.
		field.JSON("payload", map[string]any{}).
			Optional(),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

func (WorkflowBusinessState) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("source_type", "source_id").Unique(),
		index.Fields("business_status_key"),
		index.Fields("order_id", "batch_id"),
	}
}
