package biz

import (
	"errors"
	"testing"
)

func TestWorkflowTaskProcessCommandPayloadUsesApprovalProfileContract(t *testing.T) {
	t.Parallel()
	profile := "production_exception_approval"
	node := &ProcessNodeInstance{FormProfileKey: &profile}
	task := &WorkflowTask{Payload: map[string]any{
		"process_decision": map[string]any{
			"reason":            "批准部分数量",
			"approved_quantity": "12.340000",
		},
	}}
	payload, err := workflowTaskProcessCommandPayload(task, node, "done", "")
	if err != nil || payload["approved_quantity"] != "12.34" {
		t.Fatalf("payload=%#v err=%v", payload, err)
	}

	for _, value := range []any{
		"0",
		"-1",
		"1e2",
		"100000000000000",
		"1.0000000",
		float64(1),
	} {
		task.Payload = map[string]any{"process_decision": map[string]any{
			"reason": "批准", "approved_quantity": value,
		}}
		if _, err := workflowTaskProcessCommandPayload(task, node, "done", ""); !errors.Is(err, ErrBadParam) {
			t.Fatalf("approved_quantity %T(%v) err=%v", value, value, err)
		}
	}

	financeProfile := "finance_payment_approval"
	node.FormProfileKey = &financeProfile
	task.Payload = map[string]any{"process_decision": map[string]any{
		"reason": "批准", "approved_quantity": "1",
	}}
	if _, err := workflowTaskProcessCommandPayload(task, node, "done", ""); !errors.Is(err, ErrBadParam) {
		t.Fatalf("non-production quantity err=%v", err)
	}
}
