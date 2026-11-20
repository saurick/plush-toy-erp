package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type AccessEntitlement struct {
	ent.Schema
}

func (AccessEntitlement) Fields() []ent.Field {
	return []ent.Field{
		field.String("customer_key").
			NotEmpty().
			MaxLen(64),
		field.String("config_revision").
			NotEmpty().
			MaxLen(64),
		field.String("role_key").
			NotEmpty().
			MaxLen(64),
		field.String("capability_key").
			NotEmpty().
			MaxLen(128),
		field.String("scope_type").
			NotEmpty().
			Default("global").
			MaxLen(64),
		field.String("scope_value").
			NotEmpty().
			Default("*").
			MaxLen(128),
		field.JSON("constraints", map[string]any{}).
			Optional(),
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

func (AccessEntitlement) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("customer_key", "config_revision", "role_key", "capability_key", "scope_type", "scope_value").Unique(),
		index.Fields("customer_key", "config_revision", "role_key", "enabled"),
		index.Fields("customer_key", "config_revision", "capability_key", "enabled"),
	}
}
