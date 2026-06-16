package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type RuntimeAuditEvent struct {
	ent.Schema
}

func (RuntimeAuditEvent) Hooks() []ent.Hook {
	return []ent.Hook{
		rejectMutationOps(
			ent.OpUpdate|ent.OpUpdateOne|ent.OpDelete|ent.OpDeleteOne,
			"runtime_audit_events are append-only audit records",
		),
	}
}

func (RuntimeAuditEvent) Fields() []ent.Field {
	return []ent.Field{
		field.String("event_type").
			NotEmpty().
			MaxLen(128).
			Comment("系统运行时审计事件类型"),
		field.String("event_key").
			Default("").
			MaxLen(128).
			Comment("系统运行时审计事件稳定 key，可用于关联 marker"),
		field.String("source").
			Default("server_bootstrap").
			MaxLen(128).
			Comment("系统运行时审计来源"),
		field.String("payload").
			Default("{}").
			MaxLen(32768).
			Comment("系统运行时审计 payload JSON，不保存密码或 token"),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
	}
}

func (RuntimeAuditEvent) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("event_type", "created_at"),
		index.Fields("event_key", "created_at"),
	}
}
