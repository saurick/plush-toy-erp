package value

import (
	"testing"
	"time"
)

func TestWorkflowTaskNumberFormatAndNormalization(t *testing.T) {
	for _, input := range []string{"RW20261018-0029", " rw20261018-0029 "} {
		if got, ok := NormalizeWorkflowTaskNumber(input); !ok || got != "RW20261018-0029" {
			t.Fatalf("normalize %q: %q %v", input, got, ok)
		}
	}
	for _, input := range []string{"1911", "source-engineering-1911", "RW20261018-002", "RW20261018-0000", "RW20261018-00029", "RW20260230-0029", "RW20261018-9223372036854775808"} {
		if _, ok := NormalizeWorkflowTaskNumber(input); ok {
			t.Fatalf("invalid number accepted: %q", input)
		}
	}
	if number := FormatWorkflowTaskNumber("20261018", 10000); number != "RW20261018-10000" {
		t.Fatal(number)
	}
	before := time.Date(2026, 10, 18, 15, 59, 59, 0, time.UTC)
	if WorkflowTaskNumberDay(before) != "20261018" || WorkflowTaskNumberDay(before.Add(time.Second)) != "20261019" {
		t.Fatal("number day must use the same Shanghai day as task calendars")
	}
}
