package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type RuntimeMarker struct {
	ent.Schema
}

func (RuntimeMarker) Hooks() []ent.Hook {
	return []ent.Hook{
		rejectMutationOps(
			ent.OpUpdate|ent.OpUpdateOne|ent.OpDelete|ent.OpDeleteOne,
			"runtime_markers are immutable runtime markers",
		),
	}
}

func (RuntimeMarker) Fields() []ent.Field {
	return []ent.Field{
		field.String("marker_key").
			NotEmpty().
			MaxLen(128).
			Comment("运行时一次性标记 key，用于记录已完成的受控初始化动作"),
		field.String("marker_value").
			Default("").
			MaxLen(4096).
			Comment("运行时一次性标记 payload，不保存密码或 token"),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

func (RuntimeMarker) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("marker_key").Unique(),
	}
}
