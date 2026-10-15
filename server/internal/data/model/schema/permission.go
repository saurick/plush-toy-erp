package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type Permission struct {
	ent.Schema
}

func (Permission) Fields() []ent.Field {
	return []ent.Field{
		field.String("permission_key").
			NotEmpty().
			MaxLen(128),
		field.String("name").
			NotEmpty().
			MaxLen(128),
		field.String("description").
			Default("").
			MaxLen(512),
		field.String("module").
			NotEmpty().
			MaxLen(64),
		field.String("action").
			NotEmpty().
			MaxLen(64),
		field.String("resource").
			Default("").
			MaxLen(128),
		field.Bool("builtin").
			Default(false),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

func (Permission) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("permission_key").Unique(),
		index.Fields("module"),
		index.Fields("module", "action"),
	}
}
