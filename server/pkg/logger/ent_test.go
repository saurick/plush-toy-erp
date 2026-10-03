package logger

import (
	"bytes"
	"strings"
	"testing"

	"github.com/go-kratos/kratos/v2/log"
)

func TestEntLoggerNeverRecordsBindValuesOrUnparsedPayload(t *testing.T) {
	for _, input := range []string{
		"driver.Query: query=SELECT id FROM accounts WHERE password=$1 args=[private-password]",
		"driver.Query: unsupported-private-payload",
		"unparsed-private-payload",
	} {
		var output bytes.Buffer
		NewEntLogger(log.NewStdLogger(&output))(input)
		text := output.String()
		if strings.Contains(text, "private-") || strings.Contains(text, "\x1b") {
			t.Fatalf("unsafe SQL log: %s", text)
		}
		if strings.Contains(input, "query=") && !strings.Contains(text, "SELECT id FROM accounts WHERE password=$1") {
			t.Fatalf("lost SQL diagnostics: %s", text)
		}
	}
}
