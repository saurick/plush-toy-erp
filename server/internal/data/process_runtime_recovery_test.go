package data

import (
	"context"
	"errors"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent/enttest"
	"server/internal/data/model/ent/workflowtaskevent"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
	_ "github.com/mattn/go-sqlite3"
)

func TestProcessRuntimeRecoveryTerminatesAndWithdrawsSafeDownstream(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:process_runtime_recovery?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	data := &Data{postgres: client}
	processRepo := NewProcessRuntimeRepo(data, log.NewStdLogger(io.Discard))
	workflowRepo := NewWorkflowRepo(data, log.NewStdLogger(io.Discard))
	runtimeUC := biz.NewProcessRuntimeUsecase(processRepo, workflowRepo)
	instance, origin, downstream, _, resultHash, compensationHash := createCompletedCompensatedRecoveryFixture(t, ctx, processRepo, true)
	task, err := workflowRepo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
		TaskCode: "RECOVERY-DOWNSTREAM-1", TaskGroup: "generic", TaskName: "待撤回下游任务",
		SourceType: "finance_payment", SourceID: 88, TaskStatusKey: "ready", OwnerRoleKey: biz.FinanceRoleKey,
		ProcessInstanceID: &instance.ID, ProcessNodeInstanceID: &downstream.ID, Payload: map[string]any{},
	}, 7)
	if err != nil {
		t.Fatalf("create linked downstream task: %v", err)
	}
	blockedTask, err := workflowRepo.CreateWorkflowTask(ctx, &biz.WorkflowTaskCreate{
		TaskCode: "RECOVERY-DOWNSTREAM-2", TaskGroup: "generic", TaskName: "已阻塞待撤回任务",
		SourceType: "finance_payment", SourceID: 88, TaskStatusKey: "ready", OwnerRoleKey: biz.FinanceRoleKey,
		ProcessInstanceID: &instance.ID, ProcessNodeInstanceID: &downstream.ID, Payload: map[string]any{},
	}, 7)
	if err != nil {
		t.Fatalf("create linked blocked task: %v", err)
	}
	blockedTask, err = workflowRepo.UpdateWorkflowTaskStatus(ctx, workflowRepoTestStatusMutation(
		blockedTask.ID, blockedTask.Version, "recovery-blocked-task", &biz.WorkflowTaskStatusUpdate{
			TaskStatusKey: "blocked", Reason: "等待上游处理", Payload: map[string]any{},
		},
	), 7, biz.WarehouseRoleKey)
	if err != nil {
		t.Fatalf("block linked task: %v", err)
	}
	input := &biz.ProcessDomainCommandRecovery{
		ProcessInstanceID: instance.ID, ProcessNodeInstanceID: origin.ID, ExpectedVersion: origin.Version,
		Decision:           biz.ProcessDomainCommandRecoveryTerminateAndWithdraw,
		ExpectedResultHash: resultHash, ExpectedCompensationHash: compensationHash,
	}
	recovered, err := runtimeUC.RecoverCompensatedDomainCommand(ctx, input, 9)
	if err != nil {
		t.Fatalf("recover compensated command: %v", err)
	}
	if recovered.Version != origin.Version+1 || recovered.DomainCommandRecoveryDecision == nil ||
		*recovered.DomainCommandRecoveryDecision != biz.ProcessDomainCommandRecoveryTerminateAndWithdraw || recovered.DomainCommandRecoveryHash == nil {
		t.Fatalf("unexpected recovered origin %#v", recovered)
	}
	persistedDownstream, err := processRepo.GetProcessNodeInstance(ctx, downstream.ID)
	if err != nil || persistedDownstream.Status != biz.ProcessNodeStatusWithdrawn || persistedDownstream.Outcome == nil ||
		*persistedDownstream.Outcome != biz.ProcessDomainCommandRecoveryWithdrawnOutcome {
		t.Fatalf("downstream not withdrawn node=%#v err=%v", persistedDownstream, err)
	}
	persistedTask, err := workflowRepo.GetWorkflowTask(ctx, task.ID)
	if err != nil || persistedTask.TaskStatusKey != "withdrawn" || persistedTask.BlockedReason == nil || persistedTask.Version != task.Version+1 {
		t.Fatalf("linked task not withdrawn task=%#v err=%v", persistedTask, err)
	}
	persistedBlockedTask, err := workflowRepo.GetWorkflowTask(ctx, blockedTask.ID)
	if err != nil || persistedBlockedTask.TaskStatusKey != "withdrawn" || persistedBlockedTask.Version != blockedTask.Version+1 {
		t.Fatalf("linked blocked task not withdrawn task=%#v err=%v", persistedBlockedTask, err)
	}
	instanceAfter, err := processRepo.GetProcessInstance(ctx, instance.ID)
	if err != nil || instanceAfter.Status != biz.ProcessStatusCompleted || instanceAfter.ResolutionKind == nil ||
		*instanceAfter.ResolutionKind != biz.ProcessResolutionCompensated {
		t.Fatalf("process must settle as compensated instance=%#v err=%v", instanceAfter, err)
	}
	eventCount, err := client.WorkflowTaskEvent.Query().Where(
		workflowtaskevent.TaskID(task.ID), workflowtaskevent.EventType("recovery_withdrawn"),
	).Count(ctx)
	if err != nil || eventCount != 1 {
		t.Fatalf("withdraw event count=%d err=%v", eventCount, err)
	}
	if count := client.WorkflowTaskEvent.Query().Where(
		workflowtaskevent.TaskID(blockedTask.ID), workflowtaskevent.EventType("recovery_withdrawn"),
	).CountX(ctx); count != 1 {
		t.Fatalf("blocked task withdraw event count=%d", count)
	}
	replayed, err := runtimeUC.RecoverCompensatedDomainCommand(ctx, input, 10)
	if err != nil || replayed.ID != recovered.ID || replayed.Version != recovered.Version {
		t.Fatalf("exact recovery replay node=%#v err=%v", replayed, err)
	}
	if count := client.WorkflowTaskEvent.Query().Where(workflowtaskevent.TaskID(task.ID), workflowtaskevent.EventType("recovery_withdrawn")).CountX(ctx); count != 1 {
		t.Fatalf("exact replay duplicated %d withdraw events", count)
	}
	changed := *input
	changed.ExpectedCompensationHash = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
	if _, err := runtimeUC.RecoverCompensatedDomainCommand(ctx, &changed, 9); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed recovery intent error=%v", err)
	}
	changedDecision := *input
	changedDecision.Decision = "resume_downstream"
	if _, err := runtimeUC.RecoverCompensatedDomainCommand(ctx, &changedDecision, 9); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed recovery decision error=%v", err)
	}
	stale := *input
	stale.ExpectedVersion = recovered.Version
	if _, err := runtimeUC.RecoverCompensatedDomainCommand(ctx, &stale, 9); !errors.Is(err, biz.ErrProcessNodeInstanceConflict) {
		t.Fatalf("stale recovery error=%v", err)
	}
}

func TestProcessRuntimeRecoveryRejectsUnsafeActiveDownstreamEvidence(t *testing.T) {
	for _, status := range []string{biz.ProcessNodeStatusActive} {
		t.Run(status, func(t *testing.T) {
			ctx := context.Background()
			client := enttest.Open(t, dialect.SQLite, "file:process_runtime_recovery_unsafe_"+status+"?mode=memory&cache=shared&_fk=1")
			defer mustCloseEntClient(t, client)
			processRepo := NewProcessRuntimeRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
			runtimeUC := biz.NewProcessRuntimeUsecase(processRepo, NewWorkflowRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard)))
			instance, origin, downstream, futureCommand, resultHash, compensationHash := createCompletedCompensatedRecoveryFixture(t, ctx, processRepo, true)
			if status == biz.ProcessNodeStatusCompleted {
				if _, err := processRepo.CompleteProcessNodeInstance(ctx, &biz.ProcessNodeInstanceComplete{
					ID: downstream.ID, ProcessInstanceID: instance.ID, ExpectedVersion: downstream.Version, Outcome: "done",
				}, 7); err != nil {
					t.Fatalf("complete unsafe downstream: %v", err)
				}
			} else {
				futureCommand = activateProcessNodeFromForTest(t, ctx, processRepo, instance, futureCommand, origin.ID)
				fingerprint := "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
				if _, err := processRepo.ClaimProcessNodeDomainCommand(ctx, &biz.ProcessNodeDomainCommandClaim{
					ProcessInstanceID: instance.ID, ProcessNodeInstanceID: futureCommand.ID,
					ExpectedVersion: futureCommand.Version, DomainCommandFingerprint: fingerprint,
				}); err != nil {
					t.Fatalf("claim unsafe downstream: %v", err)
				}
			}
			_, err := runtimeUC.RecoverCompensatedDomainCommand(ctx, &biz.ProcessDomainCommandRecovery{
				ProcessInstanceID: instance.ID, ProcessNodeInstanceID: origin.ID, ExpectedVersion: origin.Version,
				Decision:           biz.ProcessDomainCommandRecoveryTerminateAndWithdraw,
				ExpectedResultHash: resultHash, ExpectedCompensationHash: compensationHash,
			}, 9)
			if !errors.Is(err, biz.ErrProcessDomainCommandRecoveryRequired) {
				t.Fatalf("unsafe downstream recovery error=%v", err)
			}
			persisted, getErr := processRepo.GetProcessNodeInstance(ctx, origin.ID)
			if getErr != nil || persisted.DomainCommandRecoveryHash != nil {
				t.Fatalf("unsafe recovery left evidence node=%#v err=%v", persisted, getErr)
			}
		})
	}
}

func TestProcessRuntimeRecoveryLeavesUnselectedWaitingNodeUntouched(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:process_runtime_recovery_waiting?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	processRepo := NewProcessRuntimeRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	runtimeUC := biz.NewProcessRuntimeUsecase(processRepo, NewWorkflowRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard)))
	instance, origin, downstream, _, resultHash, compensationHash := createCompletedCompensatedRecoveryFixture(t, ctx, processRepo, false)
	if _, err := runtimeUC.RecoverCompensatedDomainCommand(ctx, &biz.ProcessDomainCommandRecovery{
		ProcessInstanceID: instance.ID, ProcessNodeInstanceID: origin.ID, ExpectedVersion: origin.Version,
		Decision:           biz.ProcessDomainCommandRecoveryTerminateAndWithdraw,
		ExpectedResultHash: resultHash, ExpectedCompensationHash: compensationHash,
	}, 9); err != nil {
		t.Fatalf("withdraw waiting downstream: %v", err)
	}
	persisted, err := processRepo.GetProcessNodeInstance(ctx, downstream.ID)
	if err != nil || persisted.Status != biz.ProcessNodeStatusWaiting || persisted.StartedAt != nil || persisted.Outcome != nil {
		t.Fatalf("unselected waiting node changed node=%#v err=%v", persisted, err)
	}
}

func TestProcessRuntimeRecoveryAllowsUnselectedNonSequentialTopology(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:process_runtime_recovery_branch?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	processRepo := NewProcessRuntimeRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	runtimeUC := biz.NewProcessRuntimeUsecase(processRepo, NewWorkflowRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard)))
	instance, origin, downstream, _, resultHash, compensationHash := createCompletedCompensatedRecoveryFixture(t, ctx, processRepo, false)
	client.ProcessNodeInstance.UpdateOneID(downstream.ID).SetPolicySnapshot(map[string]any{"fan_out_node_keys": []string{"a", "b"}}).ExecX(ctx)
	_, err := runtimeUC.RecoverCompensatedDomainCommand(ctx, &biz.ProcessDomainCommandRecovery{
		ProcessInstanceID: instance.ID, ProcessNodeInstanceID: origin.ID, ExpectedVersion: origin.Version,
		Decision:           biz.ProcessDomainCommandRecoveryTerminateAndWithdraw,
		ExpectedResultHash: resultHash, ExpectedCompensationHash: compensationHash,
	}, 9)
	if err != nil {
		t.Fatalf("unselected graph topology must not block recovery: %v", err)
	}
}

func createCompletedCompensatedRecoveryFixture(
	t *testing.T,
	ctx context.Context,
	repo *processRuntimeRepo,
	activateDownstream bool,
) (*biz.ProcessInstance, *biz.ProcessNodeInstance, *biz.ProcessNodeInstance, *biz.ProcessNodeInstance, string, string) {
	t.Helper()
	instance, nodes, err := repo.CreateProcessInstance(ctx, &biz.ProcessInstanceCreate{
		ProcessKey: biz.ProcessKeyFinancePaymentApproval, ProcessVersion: "v1", ConfigRevision: "rev-1", DefinitionHash: "sha256:recovery",
		BusinessRefType: "finance_payment", BusinessRefID: 88, IdempotencyKey: "recovery-flow", Status: biz.ProcessStatusActive,
		Nodes: []biz.ProcessNodeInstanceCreate{
			{NodeKey: "approve_finance_payment", NodeType: biz.ProcessNodeTypeDomainCommand, Attempt: 1, Status: biz.ProcessNodeStatusWaiting, PolicySnapshot: map[string]any{"command_key": biz.ProcessDomainCommandFinancePaymentApprove}},
			{NodeKey: "finance_payment_execution", NodeType: biz.ProcessNodeTypeHumanTask, Attempt: 1, Status: biz.ProcessNodeStatusWaiting, PolicySnapshot: map[string]any{}},
			{NodeKey: "post_finance_payment", NodeType: biz.ProcessNodeTypeDomainCommand, Attempt: 1, Status: biz.ProcessNodeStatusWaiting, PolicySnapshot: map[string]any{"command_key": biz.ProcessDomainCommandFinancePaymentPost}},
		},
	}, 7)
	if err != nil {
		t.Fatalf("create recovery fixture: %v", err)
	}
	origin := activateProcessNodeForTest(t, ctx, repo, instance, nodes[0])
	fingerprint := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	if _, err := repo.ClaimProcessNodeDomainCommand(ctx, &biz.ProcessNodeDomainCommandClaim{
		ProcessInstanceID: instance.ID, ProcessNodeInstanceID: origin.ID, ExpectedVersion: origin.Version,
		DomainCommandFingerprint: fingerprint,
	}); err != nil {
		t.Fatalf("claim origin: %v", err)
	}
	resultHash := "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
	refType, refID := "finance_payment", 88
	if _, err := repo.RecordProcessNodeDomainCommandResult(ctx, &biz.ProcessNodeDomainCommandResultRecord{
		ProcessInstanceID: instance.ID, ProcessNodeInstanceID: origin.ID, ExpectedVersion: origin.Version,
		DomainCommandFingerprint: fingerprint, ProtocolVersion: biz.ProcessDomainCommandProtocolVersionCurrent,
		ResultState: biz.ProcessDomainCommandResultStateSucceeded,
		Result:      map[string]any{"outcome": biz.FinancePaymentProcessCommandOutcomeApproved, "block_reason": "", "linked_business_refs": []any{}, "effect_state": biz.ProcessDomainCommandEffectStateApplied, "result_version": float64(1)},
		ResultHash:  resultHash, EffectState: biz.ProcessDomainCommandEffectStateApplied, EffectRefType: &refType, EffectRefID: &refID,
	}, 7); err != nil {
		t.Fatalf("record origin result: %v", err)
	}
	expectedApplied := biz.ProcessDomainCommandEffectStateApplied
	origin, err = repo.CompleteProcessNodeInstance(ctx, &biz.ProcessNodeInstanceComplete{
		ID: origin.ID, ProcessInstanceID: instance.ID, ExpectedVersion: origin.Version, Outcome: biz.FinancePaymentProcessCommandOutcomeApproved,
		DomainCommandFingerprint: &fingerprint, ExpectedDomainCommandResultHash: &resultHash,
		ExpectedDomainCommandEffectState: &expectedApplied,
	}, 7)
	if err != nil {
		t.Fatalf("complete origin: %v", err)
	}
	downstream := nodes[1]
	futureCommand := nodes[2]
	if activateDownstream {
		downstream = activateProcessNodeFromForTest(t, ctx, repo, instance, downstream, origin.ID)
	}
	compensationHash := "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
	if _, err := repo.MarkProcessNodeDomainCommandCompensated(ctx, &biz.ProcessNodeDomainCommandCompensationMark{
		ProcessInstanceID: instance.ID, ProcessNodeInstanceID: origin.ID, ExpectedVersion: origin.Version,
		DomainCommandFingerprint: fingerprint, ExpectedResultHash: resultHash,
		Compensation: map[string]any{"reason": "finance payment approval reversed"}, CompensationHash: compensationHash,
	}, 9); err != nil {
		t.Fatalf("compensate origin: %v", err)
	}
	return instance, origin, downstream, futureCommand, resultHash, compensationHash
}
