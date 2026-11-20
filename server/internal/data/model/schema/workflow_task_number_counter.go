package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
)

// WorkflowTaskNumberCounter owns only number allocation, independently of task IDs.
type WorkflowTaskNumberCounter struct {
	ent.Schema
}

func (WorkflowTaskNumberCounter) Fields() []ent.Field {
	return []ent.Field{
		field.String("id").MinLen(8).MaxLen(8).Immutable(),
		field.Int64("last_value").Positive(),
	}
}

func (WorkflowTaskNumberCounter) Annotations() []schema.Annotation {
	return []schema.Annotation{entsql.Annotation{Checks: map[string]string{
		"workflow_task_number_counters_day":      "length(id) = 8",
		"workflow_task_number_counters_positive": "last_value > 0",
	}}}
}
