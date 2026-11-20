package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
	"time"
)

type HelpSupplement struct{ ent.Schema }

func (HelpSupplement) Fields() []ent.Field {
	return []ent.Field{
		field.String("document_id").NotEmpty().MaxLen(160),
		field.Int("version").Default(0).NonNegative(),
		field.Int("published_version").Default(0).NonNegative(),
		field.Text("draft_markdown").Default(""),
		field.Time("created_at").Default(time.Now).Immutable(),
		field.Time("updated_at").Default(time.Now).UpdateDefault(time.Now),
	}
}
func (HelpSupplement) Indexes() []ent.Index { return []ent.Index{index.Fields("document_id").Unique()} }
