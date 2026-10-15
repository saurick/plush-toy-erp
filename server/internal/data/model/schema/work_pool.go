package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type WorkPool struct {
	ent.Schema
}

func (WorkPool) Fields() []ent.Field {
	return []ent.Field{
		field.String("customer_key").
			NotEmpty().
			MaxLen(64),
		field.String("config_revision").
			NotEmpty().
			MaxLen(64),
		field.String("pool_key").
			NotEmpty().
			MaxLen(128),
		field.String("module_key").
			NotEmpty().
			MaxLen(128),
		field.String("display_name").
			NotEmpty().
			MaxLen(128),
		field.String("description").
			Default("").
			MaxLen(512),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

func (WorkPool) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("customer_key", "config_revision", "pool_key").Unique(),
		index.Fields("customer_key", "config_revision", "module_key"),
	}
}
