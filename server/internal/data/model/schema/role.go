package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type Role struct {
	ent.Schema
}

func (Role) Fields() []ent.Field {
	return []ent.Field{
		field.String("role_key").
			NotEmpty().
			MaxLen(64),
		field.String("name").
			NotEmpty().
			MaxLen(128),
		field.String("description").
			Default("").
			MaxLen(512),
		field.Bool("builtin").
			Default(false),
		field.Bool("disabled").
			Default(false),
		field.Int("sort_order").
			Default(0),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

func (Role) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("role_key").Unique(),
		index.Fields("disabled"),
		index.Fields("sort_order"),
	}
}
