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

type WorkflowTask struct {
	ent.Schema
}

func (WorkflowTask) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Checks: map[string]string{
			"workflow_tasks_status_allowed":          "task_status_key IN ('ready', 'blocked', 'done', 'rejected')",
			"workflow_tasks_version_positive":        "version > 0",
			"workflow_tasks_process_anchors_paired":  "((process_instance_id IS NULL AND process_node_instance_id IS NULL) OR (process_instance_id IS NOT NULL AND process_node_instance_id IS NOT NULL))",
			"workflow_tasks_urge_count_non_negative": "urge_count >= 0",
		}},
	}
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
		// source_* points to the workflow source object; it must not be treated as a fact ledger.
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
		field.String("owner_pool_key").
			Optional().
			Nillable().
			MaxLen(64),
		field.String("required_capability_key").
			Optional().
			Nillable().
			MaxLen(128),
		field.String("config_revision").
			Optional().
			Nillable().
			MaxLen(128),
		field.Int("process_instance_id").
			Optional().
			Nillable().
			Positive(),
		field.Int("process_node_instance_id").
			Optional().
			Nillable().
			Positive(),
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
		field.Time("completed_at").
			Optional().
			Nillable(),
		field.Bool("critical_path").
			Default(false),
		field.Int("urge_count").
			Default(0).
			NonNegative(),
		field.Time("last_urged_at").
			Optional().
			Nillable(),
		field.Int("last_urged_by").
			Optional().
			Nillable().
			Positive(),
		field.String("last_urged_by_role_key").
			Optional().
			Nillable().
			MaxLen(32),
		field.Time("escalated_at").
			Optional().
			Nillable(),
		field.String("escalate_target_role_key").
			Optional().
			Nillable().
			MaxLen(32),
		// Payload is a workflow display/action snapshot, not inventory, shipment or finance truth.
		field.JSON("payload", map[string]any{}).
			Optional(),
		field.Int("version").
			Default(1).
			Positive(),
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
		edge.From("process_instance", ProcessInstance.Type).
			Ref("workflow_tasks").
			Field("process_instance_id").
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
		edge.From("process_node_instance", ProcessNodeInstance.Type).
			Ref("workflow_tasks").
			Field("process_node_instance_id").
			Unique().
			Annotations(entsql.OnDelete(entsql.NoAction)),
	}
}

func (WorkflowTask) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("task_code").Unique(),
		index.Fields("source_type", "source_id"),
		index.Fields("owner_role_key", "task_status_key"),
		index.Fields("owner_pool_key", "task_status_key"),
		index.Fields("required_capability_key", "task_status_key"),
		index.Fields("config_revision", "owner_pool_key", "task_status_key"),
		index.Fields("process_instance_id", "task_status_key"),
		index.Fields("process_node_instance_id"),
		index.Fields("task_status_key", "critical_path", "due_at", "id"),
		index.Fields("urge_count", "escalated_at", "id"),
		index.Fields("due_at"),
	}
}
