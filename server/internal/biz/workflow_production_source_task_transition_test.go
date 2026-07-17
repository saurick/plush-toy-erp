package biz

import (
	"context"
	"strings"
	"testing"
)

func TestWorkflowUsecase_ProductionSchedulingDoneConvergesBusinessProjectionWithoutFactWrite(t *testing.T) {
	task := productionSchedulingSourceWorkflowTask()
	task.Payload["blocked_reason"] = "旧阻塞原因"
	repo := &stubWorkflowRepo{currentTask: task}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            task.ID,
		TaskStatusKey: "done",
		Payload:       map[string]any{"schedule_note": "先做大货，再补样品"},
	}, 7, PMCRoleKey)
	if err != nil {
		t.Fatalf("complete production scheduling task: %v", err)
	}
	update := repo.updateTaskInput
	if update == nil || update.BusinessStatusKey != workflowProductionProcessingStatusKey {
		t.Fatalf("expected production_processing projection, got %#v", update)
	}
	if update.Payload["scheduling_task_id"] != task.ID ||
		update.Payload["scheduling_result"] != "confirmed" ||
		update.Payload["production_execution_required"] != true ||
		update.Payload["production_fact_deferred"] != true ||
		update.Payload["decision"] != "done" ||
		update.Payload["transition_status"] != "done" {
		t.Fatalf("unexpected scheduling done payload %#v", update.Payload)
	}
	if _, exists := update.Payload["blocked_reason"]; exists {
		t.Fatalf("done must clear stale blocked reason %#v", update.Payload)
	}
	effects := update.SideEffects
	if effects == nil || effects.BusinessState == nil || effects.DerivedTask != nil {
		t.Fatalf("scheduling done must only upsert business state, got %#v", effects)
	}
	state := effects.BusinessState
	if state.SourceType != WorkflowSourceTaskProductionOrderSourceType || state.SourceID != task.SourceID ||
		state.OrderID == nil || *state.OrderID != task.SourceID ||
		state.BusinessStatusKey != workflowProductionProcessingStatusKey ||
		state.OwnerRoleKey == nil || *state.OwnerRoleKey != ProductionRoleKey {
		t.Fatalf("unexpected scheduling business projection %#v", state)
	}
	if state.Payload["source_task_contract"] != WorkflowSourceTaskContractV1 ||
		state.Payload[workflowSourceTaskIntentPayloadKey] != task.Payload[workflowSourceTaskIntentPayloadKey] ||
		state.Payload["schedule_note"] != "先做大货，再补样品" ||
		state.Payload["production_fact_deferred"] != true {
		t.Fatalf("scheduling projection lost lineage or deferred boundary %#v", state.Payload)
	}
	if effects.WorkflowRuleKey != "production_scheduling_done_to_production_processing" {
		t.Fatalf("unexpected scheduling rule %q", effects.WorkflowRuleKey)
	}
}

func TestWorkflowUsecase_ProductionSchedulingBlockedAndRejectedKeepReasonWithoutDerivedTask(t *testing.T) {
	for _, statusKey := range []string{"blocked", "rejected"} {
		t.Run(statusKey, func(t *testing.T) {
			task := productionSchedulingSourceWorkflowTask()
			task.Payload[oppositeWorkflowReasonKey(statusKey)] = "旧原因"
			repo := &stubWorkflowRepo{currentTask: task}
			uc := NewWorkflowUsecase(repo)
			reason := "关键物料尚未齐套"

			_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
				ID:            task.ID,
				TaskStatusKey: statusKey,
				Reason:        reason,
				Payload:       map[string]any{},
			}, 7, PMCRoleKey)
			if err != nil {
				t.Fatalf("%s production scheduling task: %v", statusKey, err)
			}
			update := repo.updateTaskInput
			if update.BusinessStatusKey != workflowBlockedStatusKey || update.Reason != reason ||
				update.Payload[statusKey+"_reason"] != reason ||
				update.Payload["scheduling_result"] != statusKey {
				t.Fatalf("unexpected scheduling %s update %#v", statusKey, update)
			}
			if _, exists := update.Payload[oppositeWorkflowReasonKey(statusKey)]; exists {
				t.Fatalf("%s must clear stale opposite reason %#v", statusKey, update.Payload)
			}
			effects := update.SideEffects
			if effects == nil || effects.BusinessState == nil || effects.DerivedTask != nil {
				t.Fatalf("scheduling %s must not derive a task, got %#v", statusKey, effects)
			}
			state := effects.BusinessState
			if state.BusinessStatusKey != workflowBlockedStatusKey || state.BlockedReason == nil || *state.BlockedReason != reason ||
				state.OwnerRoleKey == nil || *state.OwnerRoleKey != PMCRoleKey {
				t.Fatalf("unexpected scheduling %s projection %#v", statusKey, state)
			}
			if effects.WorkflowRuleKey != "production_scheduling_"+statusKey+"_to_blocked" {
				t.Fatalf("unexpected scheduling %s rule %q", statusKey, effects.WorkflowRuleKey)
			}
		})
	}
}

func TestWorkflowUsecase_ProductionExceptionDoneConvergesBusinessProjectionWithoutFactWrite(t *testing.T) {
	task := productionExceptionSourceWorkflowTask()
	task.Payload["blocked_reason"] = "旧阻塞原因"
	repo := &stubWorkflowRepo{currentTask: task}
	uc := NewWorkflowUsecase(repo)

	_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
		ID:            task.ID,
		TaskStatusKey: "done",
		Payload:       map[string]any{"handling_conclusion": "已安排返工复检"},
	}, 9, ProductionRoleKey)
	if err != nil {
		t.Fatalf("complete production exception task: %v", err)
	}
	update := repo.updateTaskInput
	if update == nil || update.BusinessStatusKey != workflowProductionProcessingStatusKey {
		t.Fatalf("expected production_processing projection, got %#v", update)
	}
	if update.Payload["production_exception_task_id"] != task.ID ||
		update.Payload["production_exception_result"] != "handled" ||
		update.Payload["production_fact_correction_deferred"] != true ||
		update.Payload["inventory_adjustment_deferred"] != true ||
		update.Payload["quality_followup_deferred"] != true ||
		update.Payload["decision"] != "done" {
		t.Fatalf("unexpected production exception done payload %#v", update.Payload)
	}
	if _, exists := update.Payload["blocked_reason"]; exists {
		t.Fatalf("done must clear stale blocked reason %#v", update.Payload)
	}
	effects := update.SideEffects
	if effects == nil || effects.BusinessState == nil || effects.DerivedTask != nil {
		t.Fatalf("exception done must only upsert business state, got %#v", effects)
	}
	state := effects.BusinessState
	if state.SourceType != WorkflowSourceTaskProductionFactSourceType || state.SourceID != task.SourceID ||
		state.OrderID == nil || *state.OrderID != 41 ||
		state.BusinessStatusKey != workflowProductionProcessingStatusKey ||
		state.OwnerRoleKey == nil || *state.OwnerRoleKey != ProductionRoleKey {
		t.Fatalf("unexpected exception business projection %#v", state)
	}
	if state.Payload["handling_note"] != "车缝开线，返工复检" ||
		state.Payload["handling_conclusion"] != "已安排返工复检" ||
		state.Payload[workflowSourceTaskIntentPayloadKey] != task.Payload[workflowSourceTaskIntentPayloadKey] ||
		state.Payload["production_fact_correction_deferred"] != true ||
		state.Payload["inventory_adjustment_deferred"] != true {
		t.Fatalf("exception projection lost source lineage or deferred boundary %#v", state.Payload)
	}
	if effects.WorkflowRuleKey != "production_exception_done_to_production_processing" {
		t.Fatalf("unexpected exception rule %q", effects.WorkflowRuleKey)
	}
}

func TestWorkflowUsecase_ProductionExceptionBlockedAndRejectedKeepReasonWithoutDerivedTask(t *testing.T) {
	for _, statusKey := range []string{"blocked", "rejected"} {
		t.Run(statusKey, func(t *testing.T) {
			task := productionExceptionSourceWorkflowTask()
			task.Payload[oppositeWorkflowReasonKey(statusKey)] = "旧原因"
			repo := &stubWorkflowRepo{currentTask: task}
			uc := NewWorkflowUsecase(repo)
			reason := "返工责任和复检时间尚未确认"

			_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
				ID:            task.ID,
				TaskStatusKey: statusKey,
				Reason:        reason,
				Payload:       map[string]any{},
			}, 9, ProductionRoleKey)
			if err != nil {
				t.Fatalf("%s production exception task: %v", statusKey, err)
			}
			update := repo.updateTaskInput
			if update.BusinessStatusKey != workflowBlockedStatusKey || update.Reason != reason ||
				update.Payload[statusKey+"_reason"] != reason ||
				update.Payload["production_exception_result"] != statusKey {
				t.Fatalf("unexpected exception %s update %#v", statusKey, update)
			}
			if _, exists := update.Payload[oppositeWorkflowReasonKey(statusKey)]; exists {
				t.Fatalf("%s must clear stale opposite reason %#v", statusKey, update.Payload)
			}
			effects := update.SideEffects
			if effects == nil || effects.BusinessState == nil || effects.DerivedTask != nil {
				t.Fatalf("exception %s must not derive a task, got %#v", statusKey, effects)
			}
			state := effects.BusinessState
			if state.OrderID == nil || *state.OrderID != 41 || state.BusinessStatusKey != workflowBlockedStatusKey ||
				state.BlockedReason == nil || *state.BlockedReason != reason ||
				state.OwnerRoleKey == nil || *state.OwnerRoleKey != ProductionRoleKey {
				t.Fatalf("unexpected exception %s projection %#v", statusKey, state)
			}
			if effects.WorkflowRuleKey != "production_exception_"+statusKey+"_to_blocked" {
				t.Fatalf("unexpected exception %s rule %q", statusKey, effects.WorkflowRuleKey)
			}
		})
	}
}

func TestWorkflowUsecase_ForgedProductionSourceTasksDoNotTriggerProjectionRules(t *testing.T) {
	tests := []struct {
		name   string
		base   func() *WorkflowTask
		mutate func(*WorkflowTask)
	}{
		{name: "scheduling contract", base: productionSchedulingSourceWorkflowTask, mutate: func(task *WorkflowTask) { task.Payload["source_task_contract"] = "workflow.source-task/forged" }},
		{name: "scheduling producer", base: productionSchedulingSourceWorkflowTask, mutate: func(task *WorkflowTask) { task.Payload["source_task_producer"] = "manual.create" }},
		{name: "scheduling source type", base: productionSchedulingSourceWorkflowTask, mutate: func(task *WorkflowTask) { task.SourceType = "production-progress" }},
		{name: "scheduling task code", base: productionSchedulingSourceWorkflowTask, mutate: func(task *WorkflowTask) { task.TaskCode = "source-production-scheduling-999" }},
		{name: "scheduling owner", base: productionSchedulingSourceWorkflowTask, mutate: func(task *WorkflowTask) { task.OwnerRoleKey = ProductionRoleKey }},
		{name: "scheduling source id snapshot", base: productionSchedulingSourceWorkflowTask, mutate: func(task *WorkflowTask) { task.Payload["production_order_id"] = 999 }},
		{name: "scheduling intent missing", base: productionSchedulingSourceWorkflowTask, mutate: func(task *WorkflowTask) { delete(task.Payload, workflowSourceTaskIntentPayloadKey) }},
		{name: "scheduling intent uppercase", base: productionSchedulingSourceWorkflowTask, mutate: func(task *WorkflowTask) { task.Payload[workflowSourceTaskIntentPayloadKey] = strings.Repeat("A", 64) }},
		{name: "exception contract", base: productionExceptionSourceWorkflowTask, mutate: func(task *WorkflowTask) { task.Payload["source_task_contract"] = "workflow.source-task/forged" }},
		{name: "exception producer", base: productionExceptionSourceWorkflowTask, mutate: func(task *WorkflowTask) { task.Payload["source_task_producer"] = "manual.create" }},
		{name: "exception source type", base: productionExceptionSourceWorkflowTask, mutate: func(task *WorkflowTask) { task.SourceType = "production-orders" }},
		{name: "exception task code", base: productionExceptionSourceWorkflowTask, mutate: func(task *WorkflowTask) { task.TaskCode = "source-production-exception-999" }},
		{name: "exception owner", base: productionExceptionSourceWorkflowTask, mutate: func(task *WorkflowTask) { task.OwnerRoleKey = PMCRoleKey }},
		{name: "exception source id snapshot", base: productionExceptionSourceWorkflowTask, mutate: func(task *WorkflowTask) { task.Payload["production_fact_id"] = 999 }},
		{name: "exception order id missing", base: productionExceptionSourceWorkflowTask, mutate: func(task *WorkflowTask) { delete(task.Payload, "production_order_id") }},
		{name: "exception intent non hex", base: productionExceptionSourceWorkflowTask, mutate: func(task *WorkflowTask) { task.Payload[workflowSourceTaskIntentPayloadKey] = strings.Repeat("z", 64) }},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			task := test.base()
			test.mutate(task)
			repo := &stubWorkflowRepo{currentTask: task}
			uc := NewWorkflowUsecase(repo)
			_, err := updateWorkflowTaskStatusForTest(t, uc, context.Background(), &WorkflowTaskStatusUpdate{
				ID:            task.ID,
				TaskStatusKey: "done",
				Payload:       map[string]any{},
			}, 7, task.OwnerRoleKey)
			if err != nil {
				t.Fatalf("generic transition for forged task failed: %v", err)
			}
			if repo.updateTaskInput == nil {
				t.Fatal("expected task status update")
			}
			if repo.updateTaskInput.SideEffects != nil || repo.updateTaskInput.BusinessStatusKey != "" {
				t.Fatalf("forged source task must not trigger business projection, got %#v", repo.updateTaskInput)
			}
		})
	}
}

func productionSchedulingSourceWorkflowTask() *WorkflowTask {
	sourceNo := "PO-202607-041"
	businessStatus := workflowProductionReadyStatusKey
	return &WorkflowTask{
		ID:                1601,
		TaskCode:          WorkflowSourceTaskCode(WorkflowSourceTaskProductionSchedulingGroup, 41),
		TaskGroup:         WorkflowSourceTaskProductionSchedulingGroup,
		TaskName:          "安排生产订单 PO-202607-041",
		SourceType:        WorkflowSourceTaskProductionOrderSourceType,
		SourceID:          41,
		SourceNo:          &sourceNo,
		BusinessStatusKey: &businessStatus,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      PMCRoleKey,
		CriticalPath:      true,
		Payload: map[string]any{
			"source_task_contract":             WorkflowSourceTaskContractV1,
			"source_task_producer":             WorkflowSourceTaskProductionOrderReleaseProducer,
			workflowSourceTaskIntentPayloadKey: strings.Repeat("a", 64),
			"production_order_id":              41,
			"production_order_no":              sourceNo,
			"record_title":                     "生产订单 " + sourceNo,
			"material_requirements_state":      ProductionOrderMaterialRequirementsReady,
			"business_status_reason":           "生产订单已下达，等待 PMC 完成排产确认。",
		},
		Version: 1,
	}
}

func productionExceptionSourceWorkflowTask() *WorkflowTask {
	sourceNo := "RW-202607-052"
	businessStatus := workflowBlockedStatusKey
	return &WorkflowTask{
		ID:                1602,
		TaskCode:          WorkflowSourceTaskCode(WorkflowSourceTaskProductionExceptionGroup, 52),
		TaskGroup:         WorkflowSourceTaskProductionExceptionGroup,
		TaskName:          "处理返工异常 RW-202607-052",
		SourceType:        WorkflowSourceTaskProductionFactSourceType,
		SourceID:          52,
		SourceNo:          &sourceNo,
		BusinessStatusKey: &businessStatus,
		TaskStatusKey:     "ready",
		OwnerRoleKey:      ProductionRoleKey,
		CriticalPath:      true,
		Payload: map[string]any{
			"source_task_contract":             WorkflowSourceTaskContractV1,
			"source_task_producer":             WorkflowSourceTaskProductionReworkPostProducer,
			workflowSourceTaskIntentPayloadKey: strings.Repeat("b", 64),
			"production_fact_id":               52,
			"production_fact_no":               sourceNo,
			"production_order_id":              41,
			"production_order_no":              "PO-202607-041",
			"handling_note":                    "车缝开线，返工复检",
			"business_status_reason":           "车缝开线，返工复检",
		},
		Version: 1,
	}
}

func oppositeWorkflowReasonKey(statusKey string) string {
	if statusKey == "blocked" {
		return "rejected_reason"
	}
	return "blocked_reason"
}
