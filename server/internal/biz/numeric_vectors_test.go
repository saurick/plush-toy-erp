package biz

import (
	"encoding/json"
	"os"
	"testing"
)

func TestPositiveNumericSharedVectors(t *testing.T) {
	data, err := os.ReadFile("../core/value/testdata/numeric20scale6.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Input            string
		PositiveAccepted bool
	}
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	if len(cases) == 0 {
		t.Fatal("empty numeric vectors")
	}
	for _, item := range cases {
		t.Run(item.Input, func(t *testing.T) {
			_, ok := parsePositiveNumeric20Scale6Contract(item.Input)
			if ok != item.PositiveAccepted {
				t.Fatalf("accepted = %v, want %v", ok, item.PositiveAccepted)
			}
		})
	}
}
