package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

// AdminSession is the server-side source of truth for revocable administrator access tokens.
type AdminSession struct {
	ent.Schema
}

func (AdminSession) Fields() []ent.Field {
	return []ent.Field{
		field.String("session_key").NotEmpty().MaxLen(64).Immutable(),
		field.Int("admin_user_id").Positive().Immutable(),
		field.Int64("auth_version").Positive().Immutable(),
		field.Time("issued_at").Immutable(),
		field.Time("expires_at").Immutable(),
		field.Time("revoked_at").Optional().Nillable(),
		field.String("revoke_reason").Optional().Nillable().MaxLen(64),
		field.Time("created_at").Default(time.Now).Immutable(),
		field.Time("updated_at").Default(time.Now).UpdateDefault(time.Now),
	}
}

func (AdminSession) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("session_key").Unique(),
		index.Fields("admin_user_id", "revoked_at"),
		index.Fields("expires_at"),
	}
}
