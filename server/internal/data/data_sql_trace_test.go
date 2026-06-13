package data

import "testing"

func TestPostgresSQLSpanOptionsDoNotRecordQueryText(t *testing.T) {
	opts := postgresSQLSpanOptions()

	if !opts.DisableQuery {
		t.Fatal("expected SQL trace query text to be disabled")
	}
	if opts.OmitConnQuery {
		t.Fatal("expected SQL query spans to remain enabled for timing and error attribution")
	}
	if !opts.OmitRows || !opts.OmitConnPrepare || !opts.OmitConnResetSession || !opts.OmitConnectorConnect {
		t.Fatalf("unexpected noisy SQL span options: %#v", opts)
	}
}
