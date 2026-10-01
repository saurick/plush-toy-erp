package logger

import (
	"fmt"
	"strings"

	"github.com/go-kratos/kratos/v2/log"
)

// SQL bind values can contain credentials and customer data, including in DEBUG.
// Keep the statement for diagnostics and omit values at the raw-log boundary.
func NewEntLogger(l log.Logger) func(...any) {
	return func(a ...any) {
		s := fmt.Sprint(a...)

		msg, s, ok := strings.Cut(s, ": ")
		if !ok {
			_ = l.Log(log.LevelDebug, "msg", "ent diagnostic", "details_redacted", true)
			return
		}

		s, _, ok = strings.Cut(s, " args=")
		if !ok {
			_ = l.Log(log.LevelDebug, "msg", msg, "details_redacted", true)
			return
		}

		_, query, ok := strings.Cut(s, "query=")
		if !ok {
			_ = l.Log(log.LevelDebug, "msg", msg, "details_redacted", true)
			return
		}

		if query == "" {
			_ = l.Log(log.LevelDebug, "msg", msg, "details_redacted", true)
			return
		}

		_ = l.Log(
			log.LevelDebug,
			"msg", msg,
			"query", query,
			"args_redacted", true,
		)
	}
}
