package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type WorkflowTask struct {
	ent.Schema
}

func (WorkflowTask) Fields() []ent.Field {
	return []ent.Field{
		field.String("task_code").
			NotEmpty().
			MaxLen(64),
		field.String("task_group").
			NotEmpty().
			MaxLen(32),
		field.String("task_name").
			NotEmpty().
			MaxLen(128),
		field.String("source_type").
			NotEmpty().
			MaxLen(64).
			Comment("业务来源类型，如 project_order、material_bom、inbound"),
		field.Int("source_id").
			Positive().
			Comment("业务来源记录 ID"),
		field.String("source_no").
			Optional().
			Nillable().
			MaxLen(128),
		field.String("business_status_key").
			Optional().
			Nillable().
			MaxLen(64),
		field.String("task_status_key").
			NotEmpty().
			MaxLen(32),
		field.String("owner_role_key").
			NotEmpty().
			MaxLen(32),
		field.Int("assignee_id").
			Optional().
			Nillable().
			Positive(),
		field.Int16("priority").
			Default(0),
		field.String("blocked_reason").
			Optional().
			Nillable().
			MaxLen(255),
		field.Time("due_at").
			Optional().
			Nillable(),
		field.Time("started_at").
			Optional().
			Nillable(),
		field.Time("completed_at").
			Optional().
			Nillable(),
		field.Time("closed_at").
			Optional().
			Nillable(),
		field.JSON("payload", map[string]any{}).
			Optional(),
		field.Int("created_by").
			Optional().
			Nillable().
			Positive(),
		field.Int("updated_by").
			Optional().
			Nillable().
			Positive(),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

func (WorkflowTask) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("events", WorkflowTaskEvent.Type),
	}
}

func (WorkflowTask) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("task_code").Unique(),
		index.Fields("source_type", "source_id"),
		index.Fields("owner_role_key", "task_status_key"),
		index.Fields("due_at"),
	}
}
