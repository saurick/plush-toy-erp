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

func TestSeedBusinessValuesRejectDataNatureMarkers(t *testing.T) {
	for _, value := range []any{
		"模拟短毛绒", "核心演示原料仓", "样例订单",
		map[string]any{"supplier_snapshot": map[string]any{"simulated_only": true}},
		map[string]any{"payload": map[string]any{"trial_task": true}},
		[]any{map[string]any{"note": "模拟验收记录"}},
	} {
		if err := ValidateSeedBusinessValues(value); err == nil {
			t.Fatalf("expected data-nature value rejected: %#v", value)
		}
	}
	if err := ValidateSeedBusinessValues(map[string]any{"name": "短毛绒", "note": "拉力测试合格", "quantity": 0}); err != nil {
		t.Fatalf("ordinary business values rejected: %v", err)
	}
}
