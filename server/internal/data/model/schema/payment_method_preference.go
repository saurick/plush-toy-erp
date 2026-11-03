package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	entschema "entgo.io/ent/schema"
	"entgo.io/ent/schema/field"
)

// PaymentMethodPreference controls recommendations without changing document values.
type PaymentMethodPreference struct{ ent.Schema }

func (PaymentMethodPreference) Annotations() []entschema.Annotation {
	return []entschema.Annotation{entsql.Annotation{Checks: map[string]string{
		"payment_method_preferences_method_valid":     "method = TRIM(method) AND LENGTH(method) BETWEEN 1 AND 128",
		"payment_method_preferences_version_positive": "version > 0",
	}}}
}

func (PaymentMethodPreference) Fields() []ent.Field {
	return []ent.Field{
		field.String("method").NotEmpty().MaxRuneLen(128).Unique().Immutable(),
		field.Bool("is_recommended").Default(true),
		field.Int("version").Default(1).Positive(),
		field.Time("created_at").Default(time.Now).Immutable(),
		field.Time("updated_at").Default(time.Now).UpdateDefault(time.Now),
	}
}
