package service

import "testing"

func TestNormalizeWorkflowTaskActionPayloadProcessDecisionNumericContract(t *testing.T) {
	t.Parallel()
	payload, invalid := normalizeWorkflowTaskActionPayload("complete_task_action", map[string]any{
		"process_decision": map[string]any{
			"reason":            "  批准部分数量  ",
			"approved_quantity": "12.340000",
		},
	})
	if invalid != nil {
		t.Fatalf("valid decision rejected: %#v", invalid)
	}
	decision := payload["process_decision"].(map[string]any)
	if decision["reason"] != "批准部分数量" || decision["approved_quantity"] != "12.34" {
		t.Fatalf("normalized decision=%#v", decision)
	}

	for _, value := range []any{
		float64(1),
		"0",
		"-1",
		"1e2",
		"100000000000000",
		"1.0000000",
		" 1",
	} {
		_, invalid := normalizeWorkflowTaskActionPayload("complete_task_action", map[string]any{
			"process_decision": map[string]any{
				"reason":            "批准",
				"approved_quantity": value,
			},
		})
		if invalid == nil {
			t.Fatalf("approved_quantity %T(%v) must fail closed", value, value)
		}
	}
	if _, invalid := normalizeWorkflowTaskActionPayload("reject_task_action", map[string]any{
		"process_decision": map[string]any{"reason": "拒绝"},
	}); invalid == nil {
		t.Fatal("non-complete action accepted process decision")
	}
}
