package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type Contact struct {
	ent.Schema
}

func (Contact) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{
			Checks: map[string]string{
				"contacts_owner_type_allowed": "owner_type IN ('CUSTOMER', 'SUPPLIER')",
			},
		},
	}
}

func (Contact) Fields() []ent.Field {
	return []ent.Field{
		field.String("owner_type").
			NotEmpty().
			MaxLen(16),
		field.Int("owner_id").
			Positive(),
		field.String("name").
			NotEmpty().
			MaxLen(128),
		field.String("phone").
			Optional().
			Nillable().
			MaxLen(64),
		field.String("mobile").
			Optional().
			Nillable().
			MaxLen(64),
		field.String("email").
			Optional().
			Nillable().
			MaxLen(128),
		field.String("title").
			Optional().
			Nillable().
			MaxLen(64),
		field.Bool("is_primary").
			Default(false),
		field.Bool("is_active").
			Default(true),
		field.String("note").
			Optional().
			Nillable().
			MaxLen(255),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

func (Contact) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("owner_type", "owner_id"),
		index.Fields("owner_type", "owner_id", "is_primary").
			Unique().
			Annotations(
				entsql.IndexWhere("is_primary = true"),
			),
		index.Fields("phone"),
		index.Fields("mobile"),
		index.Fields("is_active"),
	}
}
