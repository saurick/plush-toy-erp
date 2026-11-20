package data

import entsql "entgo.io/ent/dialect/sql"

func businessListOrderOptions(direction string) []entsql.OrderTermOption {
	if direction == "asc" {
		return []entsql.OrderTermOption{entsql.OrderAsc(), entsql.OrderNullsLast()}
	}
	return []entsql.OrderTermOption{entsql.OrderDesc(), entsql.OrderNullsLast()}
}
