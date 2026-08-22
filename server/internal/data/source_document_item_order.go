package data

import "entgo.io/ent/dialect/sql"

// sourceDocumentItemOrder keeps line_no as the stable line identity while
// allowing draft source documents to present their lines in a separate order.
// Existing rows created before display_order was introduced fall back to
// line_no without requiring a data backfill.
func sourceDocumentItemOrder(displayOrderField, lineNoField, idField string) func(*sql.Selector) {
	return func(selector *sql.Selector) {
		selector.OrderExprFunc(func(builder *sql.Builder) {
			builder.WriteString("COALESCE(")
			builder.WriteString(selector.C(displayOrderField))
			builder.WriteString(", ")
			builder.WriteString(selector.C(lineNoField))
			builder.WriteString(")")
		})
		selector.OrderBy(selector.C(lineNoField), selector.C(idField))
	}
}
