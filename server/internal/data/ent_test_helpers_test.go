package data

import "testing"

func mustCloseEntClient(t *testing.T, client interface{ Close() error }) {
	t.Helper()
	if err := client.Close(); err != nil {
		t.Fatalf("client.Close() error = %v", err)
	}
}
