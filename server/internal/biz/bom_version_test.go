package biz

import (
	"strings"
	"testing"
)

func TestNextBOMVersion(t *testing.T) {
	for _, tc := range []struct {
		name     string
		versions []string
		want     string
	}{
		{"first", nil, "V1"},
		{"numeric order", []string{"V2", "V10", "V9"}, "V11"},
		{"historical labels", []string{"打样版 A", " v007 ", "V3", "V2.1", "V0"}, "V8"},
		{"large number", []string{"V99999999999999999999"}, "V100000000000000000000"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := NextBOMVersion(tc.versions)
			if err != nil || got != tc.want {
				t.Fatalf("got %q, %v; want %q", got, err, tc.want)
			}
		})
	}
	if _, err := NextBOMVersion([]string{"V" + strings.Repeat("9", 63)}); err != ErrBadParam {
		t.Fatalf("exhausted version field must fail before writing: %v", err)
	}
}
