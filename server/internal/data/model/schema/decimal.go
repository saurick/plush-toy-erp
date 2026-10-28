package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema/field"
	"github.com/shopspring/decimal"
)

// bomDecimalField preserves BOM coefficients before unit-specific demand rounding.
// A fixed PostgreSQL scale would silently round values while saving.
func bomDecimalField(name string) ent.Field {
	return field.Other(name, decimal.Decimal{}).
		SchemaType(map[string]string{dialect.Postgres: "numeric", dialect.SQLite: "numeric"})
}

func immutableBOMDecimalField(name string) ent.Field {
	return field.Other(name, decimal.Decimal{}).
		SchemaType(map[string]string{dialect.Postgres: "numeric", dialect.SQLite: "numeric"}).
		Immutable()
}

// decimalQuantityField maps inventory quantities to PostgreSQL numeric to avoid float precision drift.
func decimalQuantityField(name string) ent.Field {
	return field.Other(name, decimal.Decimal{}).
		SchemaType(map[string]string{
			dialect.Postgres: "numeric(20,6)",
			dialect.SQLite:   "numeric",
		})
}

func decimalQuantityFieldWithDefault(name string, defaultValue decimal.Decimal) ent.Field {
	return field.Other(name, decimal.Decimal{}).
		Default(defaultValue).
		Annotations(entsql.Default("0")).
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

// decimalRateField maps rates whose owning contract fixes six decimal places.
func decimalRateField(name string) ent.Field {
	return field.Other(name, decimal.Decimal{}).
		SchemaType(map[string]string{
			dialect.Postgres: "numeric(20,6)",
			dialect.SQLite:   "numeric",
		})
}

func immutableDecimalRateField(name string) ent.Field {
	return field.Other(name, decimal.Decimal{}).
		SchemaType(map[string]string{
			dialect.Postgres: "numeric(20,6)",
			dialect.SQLite:   "numeric",
		}).
		Immutable()
}

// optionalDecimalField keeps nullable money and quantity snapshots out of float precision.
func optionalDecimalField(name string) ent.Field {
	return field.Other(name, decimal.Decimal{}).
		Optional().
		Nillable().
		SchemaType(map[string]string{
			dialect.Postgres: "numeric(20,6)",
			dialect.SQLite:   "numeric",
		})
}
