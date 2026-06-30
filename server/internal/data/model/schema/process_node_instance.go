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
		index.Fields("due_at"),
	}
}
