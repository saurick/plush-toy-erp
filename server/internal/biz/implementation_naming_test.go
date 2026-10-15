package biz

import (
	"testing"
)

func TestContainsNumberedImplementationStageLabel(t *testing.T) {
	for _, value := range []string{
		"Phase" + " 8 模拟单位",
		"SIM-YOYOOSUN-" + "PHASE" + "8-PCS",
		"reviewed P4" + "-3 chain",
		"P5" + " release candidate",
	} {
		if !containsNumberedImplementationStageLabel(value) {
			t.Fatalf("expected implementation stage label rejected: %q", value)
		}
	}
}

func TestContainsNumberedImplementationStageLabelAllowsBusinessAndTechnicalValues(t *testing.T) {
	for _, value := range []string{
		"P0/P1 风险等级",
		"P-001",
		"P001",
		"p95 latency",
		"migration status dry-run apply",
		"amount input phase",
	} {
		if containsNumberedImplementationStageLabel(value) {
			t.Fatalf("expected valid business or technical value allowed: %q", value)
		}
	}
}

func TestValueContainsNumberedImplementationStageLabel(t *testing.T) {
	value := map[string]any{
		"nested": []any{map[string]any{
			"title": "Phase" + " 9 模拟异常",
		}},
	}
	if !valueContainsNumberedImplementationStageLabel(value) {
		t.Fatal("expected nested stage label rejected")
	}
}
