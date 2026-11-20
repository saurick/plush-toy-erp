package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type DeploymentModuleState struct {
	ent.Schema
}

func (DeploymentModuleState) Fields() []ent.Field {
	return []ent.Field{
		field.String("customer_key").
			NotEmpty().
			MaxLen(64),
		field.String("config_revision").
			NotEmpty().
			MaxLen(64),
		field.String("module_key").
			NotEmpty().
			MaxLen(128),
		field.String("contract_version").
			Default("").
			MaxLen(64),
		field.String("state").
			NotEmpty().
			Default("enabled").
			MaxLen(32).
			Comment("enabled / read_only / disabled"),
		field.String("reason").
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

func (DeploymentModuleState) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("customer_key", "config_revision", "module_key").Unique(),
		index.Fields("customer_key", "module_key"),
		index.Fields("state"),
	}
}
