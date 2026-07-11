package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type ProcessNodeInstance struct {
	ent.Schema
}

func (ProcessNodeInstance) Fields() []ent.Field {
	return []ent.Field{
		field.Int("process_instance_id").
			Positive(),
		field.String("node_key").
			NotEmpty().
			MaxLen(128),
		field.String("node_type").
			NotEmpty().
			MaxLen(32),
		field.Int("attempt").
			Default(1).
			Positive(),
		field.String("status").
			NotEmpty().
			MaxLen(32).
			Default("waiting"),
		field.String("owner_pool_key").
			Optional().
			Nillable().
			MaxLen(64),
		field.String("required_capability_key").
			Optional().
			Nillable().
			MaxLen(128),
		field.String("form_profile_key").
			Optional().
			Nillable().
			MaxLen(128),
		field.String("action_set_key").
			Optional().
			Nillable().
			MaxLen(128),
		field.JSON("policy_snapshot", map[string]any{}).
			Optional(),
		field.Time("due_at").
			Optional().
			Nillable(),
		field.Time("started_at").
			Optional().
			Nillable(),
		field.Time("completed_at").
			Optional().
			Nillable(),
		field.String("outcome").
			Optional().
			Nillable().
			MaxLen(64),
		field.String("domain_command_fingerprint").
			Optional().
			Nillable().
			MinLen(64).
			MaxLen(64),
		field.Int("domain_command_protocol_version").
			Optional().
			Nillable().
			NonNegative(),
		field.String("domain_command_result_state").
			Optional().
			Nillable().
			MaxLen(32),
		field.JSON("domain_command_result", map[string]any{}).
			Optional(),
		field.String("domain_command_result_hash").
			Optional().
			Nillable().
			MinLen(64).
			MaxLen(64),
		field.String("domain_command_effect_state").
			Optional().
			Nillable().
			MaxLen(32),
		field.String("domain_command_effect_ref_type").
			Optional().
			Nillable().
			MaxLen(64),
		field.Int("domain_command_effect_ref_id").
			Optional().
			Nillable().
			Positive(),
		field.Time("domain_command_result_recorded_at").
			Optional().
			Nillable(),
		field.Int("domain_command_result_recorded_by").
			Optional().
			Nillable().
			Positive(),
		field.JSON("domain_command_compensation", map[string]any{}).
			Optional(),
		field.String("domain_command_compensation_hash").
			Optional().
			Nillable().
			MinLen(64).
			MaxLen(64),
		field.Time("domain_command_compensated_at").
			Optional().
			Nillable(),
		field.Int("domain_command_compensated_by").
			Optional().
			Nillable().
			Positive(),
		field.Int("version").
			Default(1).
			Positive(),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

func (ProcessNodeInstance) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("process_instance", ProcessInstance.Type).
			Ref("nodes").
			Field("process_instance_id").
			Required().
			Unique(),
	}
}

func (ProcessNodeInstance) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("process_instance_id", "node_key", "attempt").Unique(),
		index.Fields("process_instance_id", "status"),
		index.Fields("owner_pool_key", "status"),
		index.Fields("required_capability_key", "status"),
		index.Fields("domain_command_effect_ref_type", "domain_command_effect_ref_id"),
		index.Fields("due_at"),
	}
}
