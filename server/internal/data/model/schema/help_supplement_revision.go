package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
	"server/internal/biz"
	"time"
)

type HelpSupplementRevision struct{ ent.Schema }

func (HelpSupplementRevision) Hooks() []ent.Hook {
	return []ent.Hook{rejectMutationOps(ent.OpUpdate|ent.OpUpdateOne|ent.OpDelete|ent.OpDeleteOne, "help supplement revisions are append-only")}
}
func (HelpSupplementRevision) Fields() []ent.Field {
	return []ent.Field{
		field.String("document_id").NotEmpty().MaxLen(160).Immutable(),
		field.Int("version").Positive().Immutable(),
		field.Enum("action").Values("save", "publish", "restore").Immutable(),
		field.Text("markdown").Immutable(),
		field.String("source_hash").NotEmpty().MaxLen(64).Immutable(),
		field.String("summary").NotEmpty().MaxLen(biz.HelpSummaryMaxCharacters).Immutable(),
		field.Int("actor_id").Positive().Immutable(),
		field.String("actor_name").NotEmpty().MaxLen(128).Immutable(),
		field.Int("restored_from").Default(0).NonNegative().Immutable(),
		field.Time("created_at").Default(time.Now).Immutable(),
	}
}
func (HelpSupplementRevision) Indexes() []ent.Index {
	return []ent.Index{index.Fields("document_id", "version").Unique()}
}
