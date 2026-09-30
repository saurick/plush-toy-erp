package biz

import (
	"strings"
	"testing"
)

func TestWorkflowProductionReadyMeansReleasedNotMaterialReady(t *testing.T) {
	for _, state := range workflowBusinessStates {
		if state.Key != workflowProductionReadyStatusKey {
			continue
		}
		if state.Label != "待排产" || !strings.Contains(state.Summary, "生产订单已下达") || !strings.Contains(state.Summary, "另行核对") || strings.Contains(state.Summary, "齐套条件已满足") {
			t.Fatalf("production scheduling must not imply physical material readiness: %#v", state)
		}
		return
	}
	t.Fatal("production scheduling status missing")
}
