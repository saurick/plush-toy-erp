package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type WorkPoolMembership struct {
	ent.Schema
}

func (WorkPoolMembership) Fields() []ent.Field {
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
		field.String("role_key").
			Default("").
			MaxLen(64),
		field.Int("user_id").
			Default(0).
			NonNegative(),
		field.String("strategy").
			NotEmpty().
			Default("role_pool").
			MaxLen(64),
		field.Int("priority").
			Default(0),
		field.Bool("enabled").
			Default(true),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

func (WorkPoolMembership) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("customer_key", "config_revision", "pool_key", "role_key", "user_id").Unique(),
		index.Fields("customer_key", "config_revision", "role_key", "enabled"),
		index.Fields("customer_key", "config_revision", "user_id", "enabled"),
	}
}
