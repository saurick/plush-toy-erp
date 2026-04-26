package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect"
	"entgo.io/ent/schema/field"
	"github.com/shopspring/decimal"
)

// decimalQuantityField maps inventory quantities to PostgreSQL numeric to avoid float precision drift.
func decimalQuantityField(name string) ent.Field {
	return field.Other(name, decimal.Decimal{}).
		SchemaType(map[string]string{
			dialect.Postgres: "numeric(20,6)",
			dialect.SQLite:   "numeric",
		})
}

func immutableDecimalQuantityField(name string) ent.Field {
	return field.Other(name, decimal.Decimal{}).
		SchemaType(map[string]string{
			dialect.Postgres: "numeric(20,6)",
			dialect.SQLite:   "numeric",
		}).
		Immutable()
}

func decimalRateField(name string) ent.Field {
	return field.Other(name, decimal.Decimal{}).
		SchemaType(map[string]string{
			dialect.Postgres: "numeric(20,6)",
			dialect.SQLite:   "numeric",
		})
}

func optionalDecimalField(name string) ent.Field {
	return field.Other(name, decimal.Decimal{}).
		Optional().
		Nillable().
		SchemaType(map[string]string{
			dialect.Postgres: "numeric(20,6)",
			dialect.SQLite:   "numeric",
		})
}
