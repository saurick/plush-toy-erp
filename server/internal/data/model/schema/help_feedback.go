package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
	"server/internal/biz"
	"time"
)

type HelpFeedback struct{ ent.Schema }

func (HelpFeedback) Fields() []ent.Field {
	return []ent.Field{
		field.String("document_id").NotEmpty().MaxLen(160).Immutable(),
		field.String("document_title").NotEmpty().MaxLen(256).Immutable(),
		field.String("source_hash").NotEmpty().MaxLen(64).Immutable(),
		field.Int("published_version").Default(0).NonNegative().Immutable(),
		field.Text("quote").Default("").Immutable(),
		field.Text("message").NotEmpty().Immutable(),
		field.String("request_key").NotEmpty().MaxLen(36).Unique().Immutable(),
		field.Int("actor_id").Positive().Immutable(),
		field.String("actor_name").NotEmpty().MaxLen(128).Immutable(),
		field.String("response").Default("").MaxLen(biz.HelpResponseMaxCharacters),
		field.String("responded_by").Default("").MaxLen(128),
		field.Time("responded_at").Optional().Nillable(),
		field.Time("created_at").Default(time.Now).Immutable(),
	}
}
func (HelpFeedback) Indexes() []ent.Index {
	return []ent.Index{index.Fields("document_id", "created_at"), index.Fields("actor_id", "created_at")}
}
