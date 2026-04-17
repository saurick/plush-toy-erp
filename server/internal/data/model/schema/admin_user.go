// server/internal/data/model/schema/admin_user.go
package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type AdminUser struct {
	ent.Schema
}

func (AdminUser) Fields() []ent.Field {
	return []ent.Field{
		field.String("username").
			NotEmpty().
			MaxLen(64),
		field.String("password_hash").
			NotEmpty().
			Sensitive(),
		field.Bool("disabled").
			Default(false),
		field.Time("last_login_at").
			Optional().
			Nillable(),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

func (AdminUser) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("username").Unique(),
	}
}
