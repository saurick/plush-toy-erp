package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type CustomerConfigRevision struct {
	ent.Schema
}

func (CustomerConfigRevision) Fields() []ent.Field {
	return []ent.Field{
		field.String("customer_key").
			NotEmpty().
			MaxLen(64).
			Comment("客户稳定 key，不是多租户隔离字段"),
		field.String("revision").
			NotEmpty().
			MaxLen(64).
			Comment("客户配置 revision"),
		field.String("product_version").
			Default("").
			MaxLen(128).
			Comment("发布该客户配置时对应的产品版本"),
		field.String("config_hash").
			NotEmpty().
			MaxLen(128).
			Comment("compiled_snapshot 的稳定 hash"),
		field.String("status").
			NotEmpty().
			Default("published").
			MaxLen(32).
			Comment("published / active / superseded / rolled_back"),
		field.JSON("compiled_snapshot", map[string]any{}).
			Optional().
			Comment("编译后的有效配置快照，不保存 secret 或客户原始资料"),
		field.Int("published_by").
			Optional().
			Nillable().
			Positive(),
		field.Time("published_at").
			Optional().
			Nillable(),
		field.Int("activated_by").
			Optional().
			Nillable().
			Positive(),
		field.Time("activated_at").
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

func (CustomerConfigRevision) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("customer_key", "revision").Unique(),
		index.Fields("customer_key").
			Unique().
			Annotations(
				entsql.IndexWhere("status = 'active'"),
			),
		index.Fields("customer_key", "status"),
		index.Fields("config_hash"),
	}
}
