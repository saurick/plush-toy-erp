package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type RoleDataScope struct {
	ent.Schema
}

func (RoleDataScope) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Checks: map[string]string{
			"role_data_scopes_resource_type_allowed": "resource_type IN ('warehouse')",
			"role_data_scopes_mode_allowed":          "mode IN ('ALL', 'ASSIGNED', 'NONE')",
		}},
	}
}

func (RoleDataScope) Fields() []ent.Field {
	return []ent.Field{
		field.Int("role_id").Positive(),
		field.String("resource_type").NotEmpty().MaxLen(32),
		field.String("mode").NotEmpty().MaxLen(16),
		field.JSON("resource_ids", []int{}).Default([]int{}),
		field.Time("created_at").Default(time.Now).Immutable(),
		field.Time("updated_at").Default(time.Now).UpdateDefault(time.Now),
	}
}

func (RoleDataScope) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("role", Role.Type).
			Ref("data_scopes").
			Field("role_id").
			Required().
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}

func (RoleDataScope) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("role_id", "resource_type").Unique(),
		index.Fields("resource_type", "mode"),
	}
}
