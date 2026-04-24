package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type WorkflowTaskEvent struct {
	ent.Schema
}

func (WorkflowTaskEvent) Fields() []ent.Field {
	return []ent.Field{
		field.Int("task_id").
			Positive(),
		field.String("event_type").
			NotEmpty().
			MaxLen(32),
		field.String("from_status_key").
			Optional().
			Nillable().
			MaxLen(32),
		field.String("to_status_key").
			Optional().
			Nillable().
			MaxLen(32),
		field.String("actor_role_key").
			Optional().
			Nillable().
			MaxLen(32),
		field.Int("actor_id").
			Optional().
			Nillable().
			Positive(),
		field.String("reason").
			Optional().
			Nillable().
			MaxLen(255),
		field.JSON("payload", map[string]any{}).
			Optional(),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
	}
}

func (WorkflowTaskEvent) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("task", WorkflowTask.Type).
			Ref("events").
			Field("task_id").
			Required().
			Unique(),
	}
}

func (WorkflowTaskEvent) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("task_id", "created_at"),
	}
}
