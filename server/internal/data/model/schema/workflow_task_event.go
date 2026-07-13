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

type WorkflowTaskEvent struct {
	ent.Schema
}

func (WorkflowTaskEvent) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{
			Checks: map[string]string{
				"workflow_task_events_receipt_v1_complete": `
(
  (
    idempotency_key IS NULL
    AND intent_hash IS NULL
    AND command_key IS NULL
    AND mutation_result IS NULL
  )
  OR
  (
    idempotency_key IS NOT NULL
    AND length(trim(idempotency_key)) BETWEEN 1 AND 128
    AND intent_hash IS NOT NULL
    AND length(intent_hash) = 64
    AND command_key IS NOT NULL
    AND length(trim(command_key)) BETWEEN 1 AND 128
    AND mutation_result IS NOT NULL
    AND task_version IS NOT NULL
    AND task_version > 0
    AND actor_id IS NOT NULL
    AND actor_id > 0
    AND to_status_key IS NOT NULL
    AND length(trim(to_status_key)) > 0
  )
)`,
			},
		},
	}
}

func (WorkflowTaskEvent) Fields() []ent.Field {
	return []ent.Field{
		field.Int("task_id").
			Positive(),
		// Events created by this project before the versioned-event migration do
		// not have a provable task version. New events always record the version
		// produced by the same transaction.
		field.Int("task_version").
			Optional().
			Nillable().
			Positive(),
		// Successful public task mutations use the event as their durable replay
		// receipt. Events created by this project before the receipt migration,
		// as well as internal-only events, keep the receipt bundle empty.
		field.String("idempotency_key").
			Optional().
			Nillable().
			MaxLen(128),
		field.String("intent_hash").
			Optional().
			Nillable().
			MinLen(64).
			MaxLen(64),
		field.String("command_key").
			Optional().
			Nillable().
			MaxLen(128),
		field.JSON("mutation_result", map[string]any{}).
			Optional(),
		field.String("event_type").
			NotEmpty().
			MaxLen(32),
		field.String("from_status_key").
			Optional().
			Nillable().
			MaxLen(32),
		field.String("to_status_key").
			Optional().
			Nillable().
			MaxLen(32),
		field.String("actor_role_key").
			Optional().
			Nillable().
			MaxLen(32),
		field.Int("actor_id").
			Optional().
			Nillable().
			Positive(),
		field.String("reason").
			Optional().
			Nillable().
			MaxLen(255),
		field.JSON("payload", map[string]any{}).
			Optional(),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
	}
}

func (WorkflowTaskEvent) Edges() []ent.Edge {
	return []ent.Edge{
		edge.From("task", WorkflowTask.Type).
			Ref("events").
			Field("task_id").
			Required().
			Unique(),
	}
}

func (WorkflowTaskEvent) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("task_id", "created_at"),
		index.Fields("task_id", "task_version").Unique(),
		index.Fields("task_id", "idempotency_key").Unique(),
	}
}
