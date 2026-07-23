package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type Role struct {
	ent.Schema
}

func (Role) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("data_scopes", RoleDataScope.Type),
	}
}

func (Role) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Checks: map[string]string{
			"roles_role_type_allowed":       "role_type IN ('system', 'business_default', 'custom')",
			"roles_version_positive":        "version > 0",
			"roles_navigation_mode_allowed": "navigation_mode IN ('recommended', 'custom')",
		}},
	}
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
		field.Enum("role_type").
			Values("system", "business_default", "custom").
			Default("custom"),
		field.Bool("disabled").
			Default(false),
		field.Int("sort_order").
			Default(0),
		field.Int("version").
			Default(1).
			Positive(),
		field.Enum("navigation_mode").
			Values("recommended", "custom").
			Default("recommended"),
		field.JSON("primary_menu_paths", []string{}).
			Default([]string{}).
			Annotations(entsql.DefaultExprs(map[string]string{
				dialect.Postgres: "'[]'::jsonb",
				dialect.SQLite:   "'[]'",
			})),
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
