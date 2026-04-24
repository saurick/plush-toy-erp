package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type BusinessRecordEvent struct {
	ent.Schema
}

func (BusinessRecordEvent) Fields() []ent.Field {
	return []ent.Field{
		field.Int("record_id").
			Optional().
			Nillable().
			Positive(),
		field.String("module_key").
			NotEmpty().
			MaxLen(64),
		field.String("action_key").
			NotEmpty().
			MaxLen(64),
		field.String("from_status_key").
			Optional().
			Nillable().
			MaxLen(64),
		field.String("to_status_key").
			Optional().
			Nillable().
			MaxLen(64),
		field.Int("actor_id").
			Optional().
			Nillable().
			Positive(),
		field.String("actor_role_key").
			Optional().
			Nillable().
			MaxLen(32),
		field.String("note").
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

func (BusinessRecordEvent) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("record_id"),
		index.Fields("module_key", "action_key"),
		index.Fields("created_at"),
	}
}
