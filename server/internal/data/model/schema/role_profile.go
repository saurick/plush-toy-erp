package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type RoleProfile struct {
	ent.Schema
}

func (RoleProfile) Fields() []ent.Field {
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
		field.String("display_name").
			NotEmpty().
			MaxLen(128),
		field.Bool("disabled").
			Default(false),
		field.JSON("bundle_keys", []string{}).
			Optional(),
		field.JSON("revokes", []string{}).
			Optional(),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

func (RoleProfile) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("customer_key", "config_revision", "role_key").Unique(),
		index.Fields("customer_key", "role_key"),
		index.Fields("disabled"),
	}
}
