package service

import (
	"encoding/json"
	"os"
	"testing"
)

func TestJSONRPCNumericSharedVectors(t *testing.T) {
	data, err := os.ReadFile("../core/value/testdata/numeric20scale6.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Input       string
		RPCAccepted bool
	}
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	if len(cases) == 0 {
		t.Fatal("empty numeric vectors")
	}
	for _, item := range cases {
		t.Run(item.Input, func(t *testing.T) {
			_, ok := parseJSONRPCNumeric20Scale6String(item.Input)
			if ok != item.RPCAccepted {
				t.Fatalf("accepted = %v, want %v", ok, item.RPCAccepted)
			}
		})
	}
}
