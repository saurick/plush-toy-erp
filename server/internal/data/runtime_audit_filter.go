package data

import (
	"entgo.io/ent/dialect"
	"entgo.io/ent/dialect/sql"
	"server/internal/data/model/ent/predicate"
	"server/internal/data/model/ent/runtimeauditevent"
	"strings"
)

func runtimeAuditPayloadText(b *sql.Builder, column string, path []string) {
	if b.Dialect() == dialect.Postgres {
		b.WriteString("(CAST(").Ident(column).WriteString(" AS JSONB) #>> ").Arg("{" + strings.Join(path, ",") + "}").WriteString(")")
	} else {
		b.WriteString("CAST(json_extract(").Ident(column).WriteString(", ").Arg("$." + strings.Join(path, ".")).WriteString(") AS TEXT)")
	}
}

func runtimeAuditPayloadFieldEquals(value string, paths ...[]string) predicate.RuntimeAuditEvent {
	return func(s *sql.Selector) {
		matches := make([]*sql.Predicate, 0, len(paths))
		for _, path := range paths {
			matches = append(matches, sql.P(func(b *sql.Builder) {
				b.WriteString("LOWER(")
				runtimeAuditPayloadText(b, s.C(runtimeauditevent.FieldPayload), path)
				b.WriteString(") = ").Arg(strings.ToLower(value))
			}))
		}
		s.Where(sql.Or(matches...))
	}
}

// Older control-plane events recorded only the immutable actor ID. Resolve
// account searches through that ID without rewriting the original audit.
func runtimeAuditActorKeyword(keyword string) predicate.RuntimeAuditEvent {
	pattern := "%" + strings.NewReplacer("\\", "\\\\", "%", "\\%", "_", "\\_").Replace(strings.ToLower(keyword)) + "%"
	return func(s *sql.Selector) {
		s.Where(sql.P(func(b *sql.Builder) {
			runtimeAuditPayloadText(b, s.C(runtimeauditevent.FieldPayload), []string{"actor", "id"})
			b.WriteString(" IN (SELECT CAST(id AS TEXT) FROM admin_users WHERE LOWER(username) LIKE ").Arg(pattern).WriteString(" ESCAPE '\\'")
			b.WriteString(" OR LOWER(display_name) LIKE ").Arg(pattern).WriteString(" ESCAPE '\\'").WriteString(")")
		}))
	}
}
