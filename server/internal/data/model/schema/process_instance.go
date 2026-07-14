package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type ProcessInstance struct {
	ent.Schema
}

func (ProcessInstance) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Checks: map[string]string{
			"process_instances_status_allowed":   "status IN ('active', 'completed', 'blocked')",
			"process_instances_lifecycle_bundle": "((status = 'completed' AND completed_at IS NOT NULL) OR (status IN ('active', 'blocked') AND completed_at IS NULL))",
		}},
	}
}

func (ProcessInstance) Fields() []ent.Field {
	return []ent.Field{
		field.String("process_key").
			NotEmpty().
			MaxLen(64),
		field.String("process_version").
			NotEmpty().
			MaxLen(64),
		field.String("variant_key").
			Optional().
			Nillable().
			MaxLen(128),
		field.String("config_revision").
			NotEmpty().
			MaxLen(128),
		field.String("definition_hash").
			NotEmpty().
			MaxLen(128),
		field.JSON("module_contract_snapshot", map[string]any{}).
			Optional(),
		field.String("business_ref_type").
			NotEmpty().
			MaxLen(64),
		field.Int("business_ref_id").
			Positive(),
		field.String("business_ref_no").
			Optional().
			Nillable().
			MaxLen(128),
		field.String("correlation_key").
			Optional().
			Nillable().
			MaxLen(128),
		field.String("idempotency_key").
			NotEmpty().
			MaxLen(128),
		field.String("status").
			NotEmpty().
			MaxLen(32).
			Default("active"),
		field.Time("started_at").
			Default(time.Now).
			Immutable(),
		field.Time("completed_at").
			Optional().
			Nillable(),
		field.Int("created_by").
			Optional().
			Nillable().
			Positive(),
		field.Int("updated_by").
			Optional().
			Nillable().
			Positive(),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

func (ProcessInstance) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("nodes", ProcessNodeInstance.Type),
		edge.To("workflow_tasks", WorkflowTask.Type).
			Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}

func (ProcessInstance) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("process_key", "business_ref_type", "business_ref_id").Unique(),
		index.Fields("process_key", "business_ref_type", "business_ref_id", "idempotency_key").Unique(),
		index.Fields("config_revision", "process_key"),
		index.Fields("business_ref_type", "business_ref_id"),
		index.Fields("status", "updated_at"),
		index.Fields("correlation_key"),
	}
}
