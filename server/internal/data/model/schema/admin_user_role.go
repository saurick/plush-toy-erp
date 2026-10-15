package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type AdminUserRole struct {
	ent.Schema
}

func (AdminUserRole) Fields() []ent.Field {
	return []ent.Field{
		field.Int("admin_user_id").
			Positive(),
		field.Int("role_id").
			Positive(),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
	}
}

func (AdminUserRole) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("admin_user_id", "role_id").Unique(),
		index.Fields("role_id"),
	}
}
