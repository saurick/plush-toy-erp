package biz

import "testing"

func TestParsePositiveNumeric20Scale6Contract(t *testing.T) {
	t.Parallel()
	for _, value := range []string{"0.000001", "1", "99999999999999.999999"} {
		value := value
		t.Run("accept_"+value, func(t *testing.T) {
			if parsed, ok := parsePositiveNumeric20Scale6Contract(value); !ok || parsed.String() == "" {
				t.Fatalf("parse %q = %s ok=%t", value, parsed, ok)
			}
		})
	}
	for _, value := range []string{
		"",
		"0",
		"-1",
		" 1",
		"1 ",
		"1e1",
		"100000000000000",
		"1.0000000",
	} {
		value := value
		t.Run("reject_"+value, func(t *testing.T) {
			if parsed, ok := parsePositiveNumeric20Scale6Contract(value); ok || !parsed.IsZero() {
				t.Fatalf("parse %q = %s ok=%t, want zero false", value, parsed, ok)
			}
		})
	}
}
