package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	entschema "entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
)

// PaymentMethodPreference owns shared choices; document fields remain snapshots.
type PaymentMethodPreference struct{ ent.Schema }

func (PaymentMethodPreference) Annotations() []entschema.Annotation {
	return []entschema.Annotation{entsql.Annotation{Checks: map[string]string{
		"payment_method_preferences_method_valid":     "method = TRIM(method) AND LENGTH(method) BETWEEN 1 AND 128",
		"payment_method_preferences_version_positive": "version > 0",
	}}}
}

func (PaymentMethodPreference) Fields() []ent.Field {
	return []ent.Field{
		field.String("method").NotEmpty().MaxRuneLen(128).Unique(),
		field.Bool("is_recommended").Default(true),
		// The lifetime guard stays true after rename or removal from source records.
		field.Bool("has_been_used").Default(false),
		field.Int("version").Default(1).Positive(),
		field.Time("created_at").Default(time.Now).Immutable(),
		field.Time("updated_at").Default(time.Now).UpdateDefault(time.Now),
	}
}
