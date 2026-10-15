package data

import (
	stdsql "database/sql"
	"strings"
	"testing"

	"entgo.io/ent/dialect"
	entsql "entgo.io/ent/dialect/sql"
	_ "github.com/mattn/go-sqlite3"
)

func TestSourceDocumentItemOrderUsesDisplayOrderWithStableFallbacks(t *testing.T) {
	selector := entsql.Dialect(dialect.SQLite).
		Select().
		From(entsql.Table("source_document_items"))

	sourceDocumentItemOrder("display_order", "line_no", "id")(selector)
	query, _ := selector.Query()

	for _, fragment := range []string{
		"ORDER BY COALESCE(",
		"display_order",
		"line_no",
		"id",
	} {
		if !strings.Contains(query, fragment) {
			t.Fatalf("expected query %q to contain %q", query, fragment)
		}
	}
}

func TestSourceDocumentItemOrderFallsBackToHistoricalLineNumbers(t *testing.T) {
	db, err := stdsql.Open("sqlite3", "file:source_document_item_order?mode=memory&cache=shared")
	if err != nil {
		t.Fatalf("open sqlite database: %v", err)
	}
	defer func() { _ = db.Close() }()

	for _, statement := range []string{
		`CREATE TABLE source_document_items (id INTEGER PRIMARY KEY, line_no INTEGER NOT NULL, display_order INTEGER NULL)`,
		`INSERT INTO source_document_items (id, line_no, display_order) VALUES (1, 1, NULL), (2, 2, NULL), (3, 3, NULL)`,
	} {
		if _, err := db.Exec(statement); err != nil {
			t.Fatalf("prepare source document items: %v", err)
		}
	}

	readIDs := func() []int {
		t.Helper()
		table := entsql.Table("source_document_items")
		selector := entsql.Dialect(dialect.SQLite).
			Select(table.C("id")).
			From(table)
		sourceDocumentItemOrder("display_order", "line_no", "id")(selector)
		query, args := selector.Query()
		rows, err := db.Query(query, args...)
		if err != nil {
			t.Fatalf("query ordered source document items: %v", err)
		}
		defer func() { _ = rows.Close() }()

		ids := make([]int, 0, 3)
		for rows.Next() {
			var id int
			if err := rows.Scan(&id); err != nil {
				t.Fatalf("scan ordered source document item: %v", err)
			}
			ids = append(ids, id)
		}
		if err := rows.Err(); err != nil {
			t.Fatalf("iterate ordered source document items: %v", err)
		}
		return ids
	}

	assertIDs := func(got, want []int) {
		t.Helper()
		if len(got) != len(want) {
			t.Fatalf("ordered ids = %v, want %v", got, want)
		}
		for index := range want {
			if got[index] != want[index] {
				t.Fatalf("ordered ids = %v, want %v", got, want)
			}
		}
	}

	assertIDs(readIDs(), []int{1, 2, 3})
	if _, err := db.Exec(`UPDATE source_document_items SET display_order = CASE id WHEN 1 THEN 2 WHEN 2 THEN 3 WHEN 3 THEN 1 END`); err != nil {
		t.Fatalf("set explicit display order: %v", err)
	}
	assertIDs(readIDs(), []int{3, 1, 2})
}
