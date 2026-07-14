package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/enttest"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
	_ "github.com/mattn/go-sqlite3"
)

func activateProcessNodeForTest(t *testing.T, ctx context.Context, repo *processRuntimeRepo, instance *biz.ProcessInstance, node *biz.ProcessNodeInstance) *biz.ProcessNodeInstance {
	t.Helper()
	activated, err := repo.ActivateProcessNodeInstance(ctx, &biz.ProcessNodeInstanceActivate{
		ID:                node.ID,
		ProcessInstanceID: instance.ID,
		ExpectedVersion:   node.Version,
	}, 7)
	if err != nil {
		t.Fatalf("activate process node fixture: %v", err)
	}
	return activated
}

func TestProcessRuntimeRepoCreateRejectsNonInitialStatuses(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:process_runtime_repo_initial_status?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	repo := NewProcessRuntimeRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	validInput := func() *biz.ProcessInstanceCreate {
		return &biz.ProcessInstanceCreate{
			ProcessKey:      "initial_status",
			ProcessVersion:  "v1",
			ConfigRevision:  "rev-1",
			DefinitionHash:  "sha256:initial-status",
			BusinessRefType: "sales_order",
			BusinessRefID:   1001,
			IdempotencyKey:  "initial-status/v1",
			Status:          biz.ProcessStatusActive,
			Nodes: []biz.ProcessNodeInstanceCreate{{
				NodeKey: "start", NodeType: biz.ProcessNodeTypeHumanTask,
				Status: biz.ProcessNodeStatusWaiting, PolicySnapshot: map[string]any{},
			}},
		}
	}

	for _, status := range []string{biz.ProcessStatusCompleted, biz.ProcessStatusBlocked, "cancelled", "unknown"} {
		in := validInput()
		in.Status = status
		if _, _, err := repo.CreateProcessInstance(ctx, in, 7); !errors.Is(err, biz.ErrBadParam) {
			t.Fatalf("expected repo to reject initial process status %q, got %v", status, err)
		}
	}
	for _, status := range []string{
		biz.ProcessNodeStatusActive,
		biz.ProcessNodeStatusCompleted,
		biz.ProcessNodeStatusBlocked,
		"skipped",
		"failed",
		"unknown",
	} {
		in := validInput()
		in.Nodes[0].Status = status
		if _, _, err := repo.CreateProcessInstance(ctx, in, 7); !errors.Is(err, biz.ErrBadParam) {
			t.Fatalf("expected repo to reject initial process node status %q, got %v", status, err)
		}
	}
}

func TestProcessRuntimeSchemaRejectsUnknownAndInvalidLifecycleStates(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:process_runtime_schema_status?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	newInstance := func(key, status string) *ent.ProcessInstanceCreate {
		return client.ProcessInstance.Create().
			SetProcessKey(key).
			SetProcessVersion("v1").
			SetConfigRevision("rev-1").
			SetDefinitionHash("sha256:" + key).
			SetBusinessRefType("sales_order").
			SetBusinessRefID(1001).
			SetIdempotencyKey(key + "/v1").
			SetStatus(status)
	}
	if _, err := newInstance("unknown", "unknown").Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected unknown process status DB constraint, got %v", err)
	}
	if _, err := newInstance("completed_without_time", biz.ProcessStatusCompleted).Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected completed process lifecycle DB constraint, got %v", err)
	}
	instance, err := newInstance("valid", biz.ProcessStatusActive).Save(ctx)
	if err != nil {
		t.Fatalf("create valid process schema fixture: %v", err)
	}
	newNode := func(key, status string) *ent.ProcessNodeInstanceCreate {
		return client.ProcessNodeInstance.Create().
			SetProcessInstanceID(instance.ID).
			SetNodeKey(key).
			SetNodeType(biz.ProcessNodeTypeHumanTask).
			SetStatus(status)
	}
	if _, err := newNode("unknown", "unknown").Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected unknown process node status DB constraint, got %v", err)
	}
	if _, err := newNode("active_without_time", biz.ProcessNodeStatusActive).Save(ctx); !ent.IsConstraintError(err) {
		t.Fatalf("expected active process node lifecycle DB constraint, got %v", err)
	}
}

func TestProcessRuntimeRepoCreateAndRead(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:process_runtime_repo?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewProcessRuntimeRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)
	variantKey := "plush.standard"
	ownerPoolKey := "engineering_data"
	requiredCapabilityKey := "workflow.task.complete"

	instance, nodes, err := repo.CreateProcessInstance(ctx, &biz.ProcessInstanceCreate{
		ProcessKey:             "engineering_release",
		ProcessVersion:         "v1",
		VariantKey:             &variantKey,
		ConfigRevision:         "yoyoosun-rev-1",
		DefinitionHash:         "sha256:definition",
		ModuleContractSnapshot: map[string]any{"engineering": "enabled"},
		BusinessRefType:        "sales_order",
		BusinessRefID:          1001,
		IdempotencyKey:         "sales_order:1001:engineering_release:v1",
		Status:                 biz.ProcessStatusActive,
		Nodes: []biz.ProcessNodeInstanceCreate{
			{
				NodeKey:               "prepare_engineering_data",
				NodeType:              biz.ProcessNodeTypeHumanTask,
				Attempt:               1,
				Status:                biz.ProcessNodeStatusWaiting,
				OwnerPoolKey:          &ownerPoolKey,
				RequiredCapabilityKey: &requiredCapabilityKey,
				PolicySnapshot:        map[string]any{"sla_hours": 24},
			},
			{
				NodeKey:        "engineering_release_end",
				NodeType:       biz.ProcessNodeTypeEnd,
				Attempt:        1,
				Status:         biz.ProcessNodeStatusWaiting,
				PolicySnapshot: map[string]any{},
			},
		},
	}, 7)
	if err != nil {
		t.Fatalf("create process failed: %v", err)
	}
	if instance.ID <= 0 || instance.ConfigRevision != "yoyoosun-rev-1" {
		t.Fatalf("unexpected process instance %#v", instance)
	}
	if len(nodes) != 2 {
		t.Fatalf("expected 2 nodes, got %d", len(nodes))
	}
	if _, err := repo.CompleteProcessNodeInstance(ctx, &biz.ProcessNodeInstanceComplete{
		ID:                nodes[0].ID,
		ProcessInstanceID: instance.ID,
		ExpectedVersion:   nodes[0].Version,
		Outcome:           "should_not_complete",
	}, 7); !errors.Is(err, biz.ErrProcessNodeInstanceNotActive) {
		t.Fatalf("expected waiting node completion rejected, got %v", err)
	}
	nodes[0] = activateProcessNodeForTest(t, ctx, repo, instance, nodes[0])
	if nodes[0].OwnerPoolKey == nil || *nodes[0].OwnerPoolKey != ownerPoolKey {
		t.Fatalf("expected owner pool on first node, got %#v", nodes[0].OwnerPoolKey)
	}

	got, err := repo.GetProcessInstance(ctx, instance.ID)
	if err != nil {
		t.Fatalf("get process failed: %v", err)
	}
	if got.ProcessKey != "engineering_release" || got.BusinessRefType != "sales_order" {
		t.Fatalf("unexpected process read %#v", got)
	}
	gotNodes, err := repo.ListProcessNodeInstances(ctx, instance.ID)
	if err != nil {
		t.Fatalf("list nodes failed: %v", err)
	}
	if len(gotNodes) != 2 || gotNodes[0].NodeKey != "prepare_engineering_data" {
		t.Fatalf("unexpected nodes %#v", gotNodes)
	}
	gotNode, err := repo.GetProcessNodeInstance(ctx, nodes[0].ID)
	if err != nil {
		t.Fatalf("get node failed: %v", err)
	}
	if gotNode.ProcessInstanceID != instance.ID || gotNode.NodeType != biz.ProcessNodeTypeHumanTask {
		t.Fatalf("unexpected node read %#v", gotNode)
	}
	completedNode, err := repo.CompleteProcessNodeInstance(ctx, &biz.ProcessNodeInstanceComplete{
		ID:                nodes[0].ID,
		ProcessInstanceID: instance.ID,
		ExpectedVersion:   gotNode.Version,
		Outcome:           "CONFIRMED",
	}, 7)
	if err != nil {
		t.Fatalf("complete node failed: %v", err)
	}
	if completedNode.Status != biz.ProcessNodeStatusCompleted || completedNode.CompletedAt == nil {
		t.Fatalf("expected completed node with completed_at, got %#v", completedNode)
	}
	if completedNode.Outcome == nil || *completedNode.Outcome != "CONFIRMED" {
		t.Fatalf("expected outcome persisted, got %#v", completedNode.Outcome)
	}
	if completedNode.Version != gotNode.Version+1 {
		t.Fatalf("expected version increment, got %d from %d", completedNode.Version, gotNode.Version)
	}
	if _, err := repo.CompleteProcessNodeInstance(ctx, &biz.ProcessNodeInstanceComplete{
		ID:                nodes[0].ID,
		ProcessInstanceID: instance.ID,
		ExpectedVersion:   gotNode.Version,
		Outcome:           "CONFIRMED",
	}, 7); !errors.Is(err, biz.ErrProcessNodeInstanceConflict) {
		t.Fatalf("expected stale version conflict, got %v", err)
	}
	if _, err := repo.CompleteProcessNodeInstance(ctx, &biz.ProcessNodeInstanceComplete{
		ID:                nodes[0].ID,
		ProcessInstanceID: instance.ID,
		ExpectedVersion:   completedNode.Version,
		Outcome:           "CONFIRMED",
	}, 7); !errors.Is(err, biz.ErrProcessNodeInstanceSettled) {
		t.Fatalf("expected current completed node to be classified as settled, got %v", err)
	}
	nextNode, err := repo.GetProcessNodeInstance(ctx, nodes[1].ID)
	if err != nil {
		t.Fatalf("get next node failed: %v", err)
	}
	activatedNode, err := repo.ActivateProcessNodeInstance(ctx, &biz.ProcessNodeInstanceActivate{
		ID:                nodes[1].ID,
		ProcessInstanceID: instance.ID,
		ExpectedVersion:   nextNode.Version,
	}, 7)
	if err != nil {
		t.Fatalf("activate next node failed: %v", err)
	}
	if activatedNode.Status != biz.ProcessNodeStatusActive || activatedNode.StartedAt == nil {
		t.Fatalf("expected active node with started_at, got %#v", activatedNode)
	}
	if activatedNode.Version != nextNode.Version+1 {
		t.Fatalf("expected activated node version increment, got %d from %d", activatedNode.Version, nextNode.Version)
	}
	completedEndNode, err := repo.CompleteProcessNodeInstance(ctx, &biz.ProcessNodeInstanceComplete{
		ID:                nodes[1].ID,
		ProcessInstanceID: instance.ID,
		ExpectedVersion:   activatedNode.Version,
		Outcome:           biz.ProcessStatusCompleted,
	}, 7)
	if err != nil {
		t.Fatalf("complete end node failed: %v", err)
	}
	if completedEndNode.Status != biz.ProcessNodeStatusCompleted || completedEndNode.CompletedAt == nil {
		t.Fatalf("expected completed end node, got %#v", completedEndNode)
	}
	completedProcess, err := repo.CompleteProcessInstance(ctx, &biz.ProcessInstanceComplete{
		ID: instance.ID,
	}, 7)
	if err != nil {
		t.Fatalf("complete process failed: %v", err)
	}
	if completedProcess.Status != biz.ProcessStatusCompleted || completedProcess.CompletedAt == nil {
		t.Fatalf("expected completed process with completed_at, got %#v", completedProcess)
	}
	if _, err := repo.CompleteProcessInstance(ctx, &biz.ProcessInstanceComplete{
		ID: instance.ID,
	}, 7); !errors.Is(err, biz.ErrProcessInstanceSettled) {
		t.Fatalf("expected settled process error, got %v", err)
	}
	if _, err := repo.ActivateProcessNodeInstance(ctx, &biz.ProcessNodeInstanceActivate{
		ID:                nodes[1].ID,
		ProcessInstanceID: instance.ID,
		ExpectedVersion:   nextNode.Version,
	}, 7); !errors.Is(err, biz.ErrProcessNodeInstanceConflict) {
		t.Fatalf("expected stale activation conflict, got %v", err)
	}
}

func TestProcessRuntimeRepoCompletesDomainNodeWithFingerprintAtomically(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:process_runtime_repo_command_fingerprint?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewProcessRuntimeRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	instance, nodes, err := repo.CreateProcessInstance(ctx, &biz.ProcessInstanceCreate{
		ProcessKey:      "engineering_release",
		ProcessVersion:  "v1",
		ConfigRevision:  "yoyoosun-rev-1",
		DefinitionHash:  "sha256:definition",
		BusinessRefType: "sales_order",
		BusinessRefID:   1001,
		IdempotencyKey:  "sales_order:1001:engineering_release:fingerprint",
		Status:          biz.ProcessStatusActive,
		Nodes: []biz.ProcessNodeInstanceCreate{{
			NodeKey: "publish_engineering_package", NodeType: biz.ProcessNodeTypeDomainCommand, Attempt: 1,
			Status: biz.ProcessNodeStatusWaiting, PolicySnapshot: map[string]any{"command_key": "engineering_package.publish"},
		}},
	}, 7)
	if err != nil {
		t.Fatalf("create process failed: %v", err)
	}
	nodes[0] = activateProcessNodeForTest(t, ctx, repo, instance, nodes[0])
	fingerprint := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	claimed, err := repo.ClaimProcessNodeDomainCommand(ctx, &biz.ProcessNodeDomainCommandClaim{
		ProcessInstanceID: instance.ID, ProcessNodeInstanceID: nodes[0].ID, ExpectedVersion: nodes[0].Version,
		DomainCommandFingerprint: fingerprint,
	})
	if err != nil {
		t.Fatalf("claim domain command failed: %v", err)
	}
	if claimed.Status != biz.ProcessNodeStatusActive || claimed.Version != nodes[0].Version ||
		claimed.DomainCommandFingerprint == nil || *claimed.DomainCommandFingerprint != fingerprint ||
		claimed.DomainCommandProtocolVersion == nil || *claimed.DomainCommandProtocolVersion != biz.ProcessDomainCommandProtocolVersionCurrent {
		t.Fatalf("claim must persist fingerprint without settling or incrementing version, got %#v", claimed)
	}
	replayedClaim, err := repo.ClaimProcessNodeDomainCommand(ctx, &biz.ProcessNodeDomainCommandClaim{
		ProcessInstanceID: instance.ID, ProcessNodeInstanceID: nodes[0].ID, ExpectedVersion: nodes[0].Version,
		DomainCommandFingerprint: fingerprint,
	})
	if err != nil || replayedClaim.DomainCommandFingerprint == nil || *replayedClaim.DomainCommandFingerprint != fingerprint {
		t.Fatalf("same fingerprint claim must replay, node=%#v err=%v", replayedClaim, err)
	}
	changedFingerprint := "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
	if _, err := repo.ClaimProcessNodeDomainCommand(ctx, &biz.ProcessNodeDomainCommandClaim{
		ProcessInstanceID: instance.ID, ProcessNodeInstanceID: nodes[0].ID, ExpectedVersion: nodes[0].Version,
		DomainCommandFingerprint: changedFingerprint,
	}); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed active command fingerprint must conflict, got %v", err)
	}
	resultHash := "1111111111111111111111111111111111111111111111111111111111111111"
	result := map[string]any{
		"outcome": "published", "block_reason": "", "linked_business_refs": []any{},
		"effect_state": biz.ProcessDomainCommandEffectStateUnknown, "result_version": float64(1),
	}
	recordInput := &biz.ProcessNodeDomainCommandResultRecord{
		ProcessInstanceID: instance.ID, ProcessNodeInstanceID: nodes[0].ID, ExpectedVersion: nodes[0].Version,
		DomainCommandFingerprint: fingerprint, ProtocolVersion: biz.ProcessDomainCommandProtocolVersionCurrent,
		ResultState: biz.ProcessDomainCommandResultStateSucceeded, Result: result, ResultHash: resultHash,
		EffectState: biz.ProcessDomainCommandEffectStateUnknown,
	}
	recorded, err := repo.RecordProcessNodeDomainCommandResult(ctx, recordInput, 7)
	if err != nil || recorded.DomainCommandResultHash == nil || *recorded.DomainCommandResultHash != resultHash {
		t.Fatalf("record domain result failed, node=%#v err=%v", recorded, err)
	}
	if _, err := repo.RecordProcessNodeDomainCommandResult(ctx, recordInput, 7); err != nil {
		t.Fatalf("exact domain result replay must be idempotent: %v", err)
	}
	changedResult := *recordInput
	changedResult.ResultHash = "2222222222222222222222222222222222222222222222222222222222222222"
	if _, err := repo.RecordProcessNodeDomainCommandResult(ctx, &changedResult, 7); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("same fingerprint with a different result must conflict, got %v", err)
	}
	if stored, found, err := repo.GetProcessNodeDomainCommandResult(ctx, instance.ID, nodes[0].ID, fingerprint); err != nil || !found || stored.DomainCommandResultHash == nil {
		t.Fatalf("stored domain result must be readable, node=%#v found=%v err=%v", stored, found, err)
	}
	completed, err := repo.CompleteProcessNodeInstance(ctx, &biz.ProcessNodeInstanceComplete{
		ID: nodes[0].ID, ProcessInstanceID: instance.ID, ExpectedVersion: nodes[0].Version,
		Outcome: "published", DomainCommandFingerprint: &fingerprint,
	}, 7)
	if err != nil {
		t.Fatalf("complete domain node failed: %v", err)
	}
	if completed.Status != biz.ProcessNodeStatusCompleted || completed.Version != nodes[0].Version+1 ||
		completed.DomainCommandFingerprint == nil || *completed.DomainCommandFingerprint != fingerprint {
		t.Fatalf("status, version and fingerprint must be saved by one guarded update, got %#v", completed)
	}
	persisted, err := repo.GetProcessNodeInstance(ctx, nodes[0].ID)
	if err != nil {
		t.Fatalf("read completed domain node failed: %v", err)
	}
	if persisted.DomainCommandFingerprint == nil || *persisted.DomainCommandFingerprint != fingerprint {
		t.Fatalf("expected persisted domain command fingerprint, got %#v", persisted.DomainCommandFingerprint)
	}
}

func TestProcessRuntimeRepoMarksDomainResultCompensatedWithExactCAS(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:process_runtime_repo_command_compensation?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)
	repo := NewProcessRuntimeRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	instance, nodes, err := repo.CreateProcessInstance(ctx, &biz.ProcessInstanceCreate{
		ProcessKey: "shipment_flow", ProcessVersion: "v1", ConfigRevision: "rev-1", DefinitionHash: "sha256:definition",
		BusinessRefType: "shipment", BusinessRefID: 88, IdempotencyKey: "shipment:88:flow", Status: biz.ProcessStatusActive,
		Nodes: []biz.ProcessNodeInstanceCreate{{
			NodeKey: "ship", NodeType: biz.ProcessNodeTypeDomainCommand, Attempt: 1,
			Status: biz.ProcessNodeStatusWaiting, PolicySnapshot: map[string]any{"command_key": "shipment.ship"},
		}},
	}, 7)
	if err != nil {
		t.Fatalf("create process: %v", err)
	}
	nodes[0] = activateProcessNodeForTest(t, ctx, repo, instance, nodes[0])
	fingerprint := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	if _, err := repo.ClaimProcessNodeDomainCommand(ctx, &biz.ProcessNodeDomainCommandClaim{
		ProcessInstanceID: instance.ID, ProcessNodeInstanceID: nodes[0].ID, ExpectedVersion: nodes[0].Version,
		DomainCommandFingerprint: fingerprint,
	}); err != nil {
		t.Fatalf("claim command: %v", err)
	}
	refType, refID := "shipment", 88
	resultHash := "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
	if _, err := repo.RecordProcessNodeDomainCommandResult(ctx, &biz.ProcessNodeDomainCommandResultRecord{
		ProcessInstanceID: instance.ID, ProcessNodeInstanceID: nodes[0].ID, ExpectedVersion: nodes[0].Version,
		DomainCommandFingerprint: fingerprint, ProtocolVersion: biz.ProcessDomainCommandProtocolVersionCurrent,
		ResultState: biz.ProcessDomainCommandResultStateSucceeded,
		Result: map[string]any{
			"outcome": "shipment.shipped", "block_reason": "", "linked_business_refs": []any{},
			"effect_state": biz.ProcessDomainCommandEffectStateApplied, "result_version": float64(1),
		},
		ResultHash: resultHash, EffectState: biz.ProcessDomainCommandEffectStateApplied,
		EffectRefType: &refType, EffectRefID: &refID,
	}, 7); err != nil {
		t.Fatalf("record command result: %v", err)
	}
	compensation := map[string]any{"reason": "shipment cancelled", "ref_id": float64(88)}
	mark := &biz.ProcessNodeDomainCommandCompensationMark{
		ProcessInstanceID: instance.ID, ProcessNodeInstanceID: nodes[0].ID, ExpectedVersion: nodes[0].Version,
		DomainCommandFingerprint: fingerprint, ExpectedResultHash: resultHash,
		Compensation: compensation, CompensationHash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
	}
	compensated, err := repo.MarkProcessNodeDomainCommandCompensated(ctx, mark, 9)
	if err != nil || compensated.DomainCommandEffectState == nil || *compensated.DomainCommandEffectState != biz.ProcessDomainCommandEffectStateCompensated {
		t.Fatalf("mark compensated failed, node=%#v err=%v", compensated, err)
	}
	if _, err := repo.MarkProcessNodeDomainCommandCompensated(ctx, mark, 9); err != nil {
		t.Fatalf("exact compensation replay must be idempotent: %v", err)
	}
	expectedApplied := biz.ProcessDomainCommandEffectStateApplied
	if _, err := repo.CompleteProcessNodeInstance(ctx, &biz.ProcessNodeInstanceComplete{
		ID: nodes[0].ID, ProcessInstanceID: instance.ID, ExpectedVersion: nodes[0].Version,
		Outcome: "shipment.shipped", DomainCommandFingerprint: &fingerprint,
		ExpectedDomainCommandResultHash: &resultHash, ExpectedDomainCommandEffectState: &expectedApplied,
	}, 7); !errors.Is(err, biz.ErrProcessNodeInstanceConflict) {
		t.Fatalf("compensation committed before settlement must prevent stale completion, got %v", err)
	}
	persisted, err := repo.GetProcessNodeInstance(ctx, nodes[0].ID)
	if err != nil || persisted.Status != biz.ProcessNodeStatusActive || persisted.DomainCommandEffectState == nil ||
		*persisted.DomainCommandEffectState != biz.ProcessDomainCommandEffectStateCompensated {
		t.Fatalf("compensated active node must remain unsettled, node=%#v err=%v", persisted, err)
	}
	changed := *mark
	changed.CompensationHash = "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
	if _, err := repo.MarkProcessNodeDomainCommandCompensated(ctx, &changed, 9); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed compensation evidence must conflict, got %v", err)
	}
}

func TestProcessRuntimeRepoReturnsExistingProcessForSameIdempotency(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:process_runtime_repo_duplicate?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewProcessRuntimeRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)
	in := &biz.ProcessInstanceCreate{
		ProcessKey:      "engineering_release",
		ProcessVersion:  "v1",
		ConfigRevision:  "yoyoosun-rev-1",
		DefinitionHash:  "sha256:definition",
		BusinessRefType: "sales_order",
		BusinessRefID:   1001,
		IdempotencyKey:  "sales_order:1001:engineering_release:v1",
		Status:          biz.ProcessStatusActive,
	}
	first, _, err := repo.CreateProcessInstance(ctx, in, 7)
	if err != nil {
		t.Fatalf("first create failed: %v", err)
	}
	second, _, err := repo.CreateProcessInstance(ctx, in, 7)
	if err != nil {
		t.Fatalf("same idempotency create should return existing process, got %v", err)
	}
	if second.ID != first.ID || second.IdempotencyKey != in.IdempotencyKey {
		t.Fatalf("expected existing process returned, first=%#v second=%#v", first, second)
	}
	otherKey := *in
	otherKey.IdempotencyKey = "sales_order:1001:engineering_release:v2"
	if _, _, err := repo.CreateProcessInstance(ctx, &otherKey, 7); !errors.Is(err, biz.ErrProcessInstanceExists) {
		t.Fatalf("expected ErrProcessInstanceExists for different idempotency key, got %v", err)
	}
	if _, err := repo.GetProcessInstance(ctx, 999); !errors.Is(err, biz.ErrProcessInstanceNotFound) {
		t.Fatalf("expected not found, got %v", err)
	}
	if _, err := repo.GetProcessNodeInstance(ctx, 999); !errors.Is(err, biz.ErrProcessNodeInstanceNotFound) {
		t.Fatalf("expected node not found, got %v", err)
	}
}

func TestProcessRuntimeRepoRejectsChangedCreateIntentForSameIdempotency(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:process_runtime_repo_idempotency_conflict?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewProcessRuntimeRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)
	variantKey := "plush.standard"
	businessRefNo := "SO-1001"
	correlationKey := "order:1001"
	ownerPoolKey := "order_approval"
	dueAt := time.Date(2026, 7, 10, 9, 0, 0, 0, time.UTC)
	in := &biz.ProcessInstanceCreate{
		ProcessKey:             "sales_order_acceptance",
		ProcessVersion:         "v1",
		VariantKey:             &variantKey,
		ConfigRevision:         "yoyoosun-rev-1",
		DefinitionHash:         "sha256:definition-v1",
		ModuleContractSnapshot: map[string]any{"customer_key": "yoyoosun", "sales": "enabled"},
		BusinessRefType:        "sales_order",
		BusinessRefID:          1001,
		BusinessRefNo:          &businessRefNo,
		CorrelationKey:         &correlationKey,
		IdempotencyKey:         "sales_order:1001:sales_order_acceptance:v1",
		Status:                 biz.ProcessStatusActive,
		Nodes: []biz.ProcessNodeInstanceCreate{
			{
				NodeKey:        "approve_order",
				NodeType:       biz.ProcessNodeTypeHumanTask,
				Attempt:        1,
				Status:         biz.ProcessNodeStatusWaiting,
				OwnerPoolKey:   &ownerPoolKey,
				PolicySnapshot: map[string]any{"sla_hours": 24},
				DueAt:          &dueAt,
			},
		},
	}
	first, nodes, err := repo.CreateProcessInstance(ctx, in, 7)
	if err != nil {
		t.Fatalf("first create failed: %v", err)
	}
	nodes[0] = activateProcessNodeForTest(t, ctx, repo, first, nodes[0])

	cloneInput := func() *biz.ProcessInstanceCreate {
		cloned := *in
		cloned.ModuleContractSnapshot = map[string]any{"customer_key": "yoyoosun", "sales": "enabled"}
		cloned.Nodes = append([]biz.ProcessNodeInstanceCreate(nil), in.Nodes...)
		cloned.Nodes[0].PolicySnapshot = map[string]any{"sla_hours": 24}
		return &cloned
	}
	tests := []struct {
		name   string
		mutate func(*biz.ProcessInstanceCreate)
	}{
		{name: "process version", mutate: func(in *biz.ProcessInstanceCreate) { in.ProcessVersion = "v2" }},
		{name: "variant", mutate: func(in *biz.ProcessInstanceCreate) { value := "plush.express"; in.VariantKey = &value }},
		{name: "config revision", mutate: func(in *biz.ProcessInstanceCreate) { in.ConfigRevision = "yoyoosun-rev-2" }},
		{name: "definition hash", mutate: func(in *biz.ProcessInstanceCreate) { in.DefinitionHash = "sha256:definition-v2" }},
		{name: "module contract", mutate: func(in *biz.ProcessInstanceCreate) { in.ModuleContractSnapshot["sales"] = "read_only" }},
		{name: "business ref no", mutate: func(in *biz.ProcessInstanceCreate) { value := "SO-1001-CHANGED"; in.BusinessRefNo = &value }},
		{name: "correlation key", mutate: func(in *biz.ProcessInstanceCreate) { value := "order:changed"; in.CorrelationKey = &value }},
		{name: "node key", mutate: func(in *biz.ProcessInstanceCreate) { in.Nodes[0].NodeKey = "review_order" }},
		{name: "node owner", mutate: func(in *biz.ProcessInstanceCreate) { value := "sales_review"; in.Nodes[0].OwnerPoolKey = &value }},
		{name: "node policy", mutate: func(in *biz.ProcessInstanceCreate) { in.Nodes[0].PolicySnapshot["sla_hours"] = 48 }},
		{name: "node due at", mutate: func(in *biz.ProcessInstanceCreate) { value := dueAt.Add(time.Hour); in.Nodes[0].DueAt = &value }},
		{name: "node count", mutate: func(in *biz.ProcessInstanceCreate) {
			in.Nodes = append(in.Nodes, biz.ProcessNodeInstanceCreate{NodeKey: "end", NodeType: biz.ProcessNodeTypeEnd, Attempt: 1, Status: biz.ProcessNodeStatusWaiting, PolicySnapshot: map[string]any{}})
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			conflict := cloneInput()
			tt.mutate(conflict)
			if _, _, err := repo.CreateProcessInstance(ctx, conflict, 7); !errors.Is(err, biz.ErrIdempotencyConflict) {
				t.Fatalf("expected ErrIdempotencyConflict, got %v", err)
			}
		})
	}

	if _, err := repo.RecordProcessInstanceLinkedBusinessRef(ctx, &biz.ProcessInstanceLinkedBusinessRefRecord{
		ProcessInstanceID: first.ID,
		RefType:           "shipment",
		RefID:             2001,
		SourceNodeKey:     "approve_order",
		SourceCommandKey:  "shipment.create",
	}, 7); err != nil {
		t.Fatalf("record linked business ref failed: %v", err)
	}
	if _, err := repo.CompleteProcessNodeInstance(ctx, &biz.ProcessNodeInstanceComplete{
		ID:                nodes[0].ID,
		ProcessInstanceID: first.ID,
		ExpectedVersion:   nodes[0].Version,
		Outcome:           "approved",
	}, 7); err != nil {
		t.Fatalf("complete process node failed: %v", err)
	}
	if _, err := repo.CompleteProcessInstance(ctx, &biz.ProcessInstanceComplete{ID: first.ID}, 7); err != nil {
		t.Fatalf("complete process failed: %v", err)
	}

	replayed, replayedNodes, err := repo.CreateProcessInstance(ctx, cloneInput(), 7)
	if err != nil {
		t.Fatalf("runtime state changes must not break the original replay: %v", err)
	}
	if replayed.ID != first.ID || replayed.Status != biz.ProcessStatusCompleted {
		t.Fatalf("expected completed original process, got %#v", replayed)
	}
	if len(replayedNodes) != 1 || replayedNodes[0].Status != biz.ProcessNodeStatusCompleted {
		t.Fatalf("expected current node state on replay, got %#v", replayedNodes)
	}
}

func TestProcessRuntimeRepoCreateProcessNodeInstanceAttempt(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:process_runtime_repo_attempt?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewProcessRuntimeRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)
	ownerPoolKey := "engineering_data"
	requiredCapabilityKey := "workflow.task.complete"
	createInput := &biz.ProcessInstanceCreate{
		ProcessKey:      "engineering_release",
		ProcessVersion:  "v1",
		ConfigRevision:  "yoyoosun-rev-1",
		DefinitionHash:  "sha256:definition",
		BusinessRefType: "sales_order",
		BusinessRefID:   1001,
		IdempotencyKey:  "sales_order:1001:engineering_release:v1",
		Status:          biz.ProcessStatusActive,
		Nodes: []biz.ProcessNodeInstanceCreate{
			{
				NodeKey:               "prepare_engineering_data",
				NodeType:              biz.ProcessNodeTypeHumanTask,
				Attempt:               1,
				Status:                biz.ProcessNodeStatusWaiting,
				OwnerPoolKey:          &ownerPoolKey,
				RequiredCapabilityKey: &requiredCapabilityKey,
				PolicySnapshot:        map[string]any{"return_max_attempts": 2},
			},
		},
	}
	instance, nodes, err := repo.CreateProcessInstance(ctx, createInput, 7)
	if err != nil {
		t.Fatalf("create process failed: %v", err)
	}
	nodes[0] = activateProcessNodeForTest(t, ctx, repo, instance, nodes[0])
	completedNode, err := repo.CompleteProcessNodeInstance(ctx, &biz.ProcessNodeInstanceComplete{
		ID:                nodes[0].ID,
		ProcessInstanceID: instance.ID,
		ExpectedVersion:   nodes[0].Version,
		Outcome:           "return",
	}, 7)
	if err != nil {
		t.Fatalf("complete original attempt failed: %v", err)
	}
	nextAttempt, err := repo.CreateProcessNodeInstanceAttempt(ctx, &biz.ProcessNodeInstanceAttemptCreate{
		ProcessInstanceID:     instance.ID,
		NodeKey:               completedNode.NodeKey,
		NodeType:              completedNode.NodeType,
		Attempt:               2,
		OwnerPoolKey:          completedNode.OwnerPoolKey,
		RequiredCapabilityKey: completedNode.RequiredCapabilityKey,
		PolicySnapshot:        completedNode.PolicySnapshot,
	}, 7)
	if err != nil {
		t.Fatalf("create next attempt failed: %v", err)
	}
	if nextAttempt.Attempt != 2 || nextAttempt.Status != biz.ProcessNodeStatusWaiting {
		t.Fatalf("unexpected next attempt %#v", nextAttempt)
	}
	if nextAttempt.OwnerPoolKey == nil || *nextAttempt.OwnerPoolKey != ownerPoolKey {
		t.Fatalf("expected owner pool copied, got %#v", nextAttempt.OwnerPoolKey)
	}
	activated, err := repo.ActivateProcessNodeInstance(ctx, &biz.ProcessNodeInstanceActivate{
		ID:                nextAttempt.ID,
		ProcessInstanceID: instance.ID,
		ExpectedVersion:   nextAttempt.Version,
	}, 7)
	if err != nil {
		t.Fatalf("activate next attempt failed: %v", err)
	}
	if activated.Status != biz.ProcessNodeStatusActive || activated.Version != nextAttempt.Version+1 {
		t.Fatalf("unexpected activated attempt %#v", activated)
	}
	replayed, replayedNodes, err := repo.CreateProcessInstance(ctx, createInput, 7)
	if err != nil {
		t.Fatalf("runtime-added return attempt must not change the original create intent: %v", err)
	}
	if replayed.ID != instance.ID || len(replayedNodes) != 2 || replayedNodes[1].Attempt != 2 {
		t.Fatalf("same create intent must return the current process with its runtime attempts, process=%#v nodes=%#v", replayed, replayedNodes)
	}
	if _, err := repo.CreateProcessNodeInstanceAttempt(ctx, &biz.ProcessNodeInstanceAttemptCreate{
		ProcessInstanceID: instance.ID,
		NodeKey:           completedNode.NodeKey,
		NodeType:          completedNode.NodeType,
		Attempt:           2,
		PolicySnapshot:    map[string]any{},
	}, 7); !errors.Is(err, biz.ErrProcessInstanceExists) {
		t.Fatalf("expected duplicate attempt conflict, got %v", err)
	}
}

func TestProcessRuntimeRepoBlockProcessNodeInstanceAndProcess(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:process_runtime_repo_block?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewProcessRuntimeRepo(
		&Data{postgres: client},
		log.NewStdLogger(io.Discard),
	)
	dueAt := time.Date(2026, 6, 30, 9, 0, 0, 0, time.UTC)
	instance, nodes, err := repo.CreateProcessInstance(ctx, &biz.ProcessInstanceCreate{
		ProcessKey:      "engineering_release",
		ProcessVersion:  "v1",
		ConfigRevision:  "yoyoosun-rev-1",
		DefinitionHash:  "sha256:definition",
		BusinessRefType: "sales_order",
		BusinessRefID:   1001,
		IdempotencyKey:  "sales_order:1001:engineering_release:block",
		Status:          biz.ProcessStatusActive,
		Nodes: []biz.ProcessNodeInstanceCreate{
			{
				NodeKey:        "prepare_engineering_data",
				NodeType:       biz.ProcessNodeTypeDomainCommand,
				Attempt:        1,
				Status:         biz.ProcessNodeStatusWaiting,
				PolicySnapshot: map[string]any{"command_key": "engineering_data.check"},
				DueAt:          &dueAt,
			},
		},
	}, 7)
	if err != nil {
		t.Fatalf("create process failed: %v", err)
	}
	nodes[0] = activateProcessNodeForTest(t, ctx, repo, instance, nodes[0])
	activeNode, err := repo.GetProcessNodeInstance(ctx, nodes[0].ID)
	if err != nil {
		t.Fatalf("get active node failed: %v", err)
	}
	fingerprint := "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
	activeNode, err = repo.ClaimProcessNodeDomainCommand(ctx, &biz.ProcessNodeDomainCommandClaim{
		ProcessInstanceID: instance.ID, ProcessNodeInstanceID: activeNode.ID, ExpectedVersion: activeNode.Version,
		DomainCommandFingerprint: fingerprint,
	})
	if err != nil {
		t.Fatalf("claim blocked domain command failed: %v", err)
	}
	blockedNode, err := repo.BlockProcessNodeAndInstance(ctx, &biz.ProcessNodeInstanceBlock{
		ProcessInstanceID:        instance.ID,
		ProcessNodeInstanceID:    activeNode.ID,
		ExpectedVersion:          activeNode.Version,
		Reason:                   "样衣资料缺失",
		Outcome:                  "blocked",
		DomainCommandFingerprint: &fingerprint,
	}, 7)
	if err != nil {
		t.Fatalf("block process node failed: %v", err)
	}
	if blockedNode.Status != biz.ProcessNodeStatusBlocked || blockedNode.CompletedAt != nil {
		t.Fatalf("expected blocked node without completed_at, got %#v", blockedNode)
	}
	if blockedNode.Outcome == nil || *blockedNode.Outcome != "blocked" {
		t.Fatalf("expected blocked outcome, got %#v", blockedNode.Outcome)
	}
	if blockedNode.DomainCommandFingerprint == nil || *blockedNode.DomainCommandFingerprint != fingerprint {
		t.Fatalf("expected blocked domain command fingerprint, got %#v", blockedNode.DomainCommandFingerprint)
	}
	if blockedNode.Version != activeNode.Version+1 {
		t.Fatalf("expected blocked node version increment, got %d from %d", blockedNode.Version, activeNode.Version)
	}
	if _, err := repo.BlockProcessNodeAndInstance(ctx, &biz.ProcessNodeInstanceBlock{
		ProcessInstanceID:     instance.ID,
		ProcessNodeInstanceID: activeNode.ID,
		ExpectedVersion:       activeNode.Version,
		Reason:                "重复阻塞",
		Outcome:               "blocked",
	}, 7); !errors.Is(err, biz.ErrProcessNodeInstanceConflict) {
		t.Fatalf("expected stale block conflict, got %v", err)
	}
	blockedProcess, err := repo.GetProcessInstance(ctx, instance.ID)
	if err != nil {
		t.Fatalf("get atomically blocked process failed: %v", err)
	}
	if blockedProcess.Status != biz.ProcessStatusBlocked || blockedProcess.CompletedAt != nil {
		t.Fatalf("expected blocked process without completed_at, got %#v", blockedProcess)
	}
}

func TestProcessRuntimeRepoBlockProcessNodeAndInstanceRollsBackNodeWhenProcessCannotBlock(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:process_runtime_repo_atomic_block_rollback?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewProcessRuntimeRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	instance, nodes, err := repo.CreateProcessInstance(ctx, &biz.ProcessInstanceCreate{
		ProcessKey:      "engineering_release",
		ProcessVersion:  "v1",
		ConfigRevision:  "yoyoosun-rev-1",
		DefinitionHash:  "sha256:definition",
		BusinessRefType: "sales_order",
		BusinessRefID:   1002,
		IdempotencyKey:  "sales_order:1002:engineering_release:block-rollback",
		Status:          biz.ProcessStatusActive,
		Nodes: []biz.ProcessNodeInstanceCreate{
			{
				NodeKey:        "prepare_engineering_data",
				NodeType:       biz.ProcessNodeTypeHumanTask,
				Attempt:        1,
				Status:         biz.ProcessNodeStatusWaiting,
				PolicySnapshot: map[string]any{},
			},
		},
	}, 7)
	if err != nil {
		t.Fatalf("create process failed: %v", err)
	}
	activeNode := activateProcessNodeForTest(t, ctx, repo, instance, nodes[0])
	if _, err := repo.CompleteProcessInstance(ctx, &biz.ProcessInstanceComplete{ID: instance.ID}, 7); err != nil {
		t.Fatalf("settle process fixture: %v", err)
	}

	if _, err := repo.BlockProcessNodeAndInstance(ctx, &biz.ProcessNodeInstanceBlock{
		ProcessInstanceID:     instance.ID,
		ProcessNodeInstanceID: activeNode.ID,
		ExpectedVersion:       activeNode.Version,
		Reason:                "must roll back",
		Outcome:               "blocked",
	}, 7); !errors.Is(err, biz.ErrProcessInstanceSettled) {
		t.Fatalf("expected settled process failure, got %v", err)
	}
	currentNode, err := repo.GetProcessNodeInstance(ctx, activeNode.ID)
	if err != nil {
		t.Fatalf("get node after rollback: %v", err)
	}
	if currentNode.Status != biz.ProcessNodeStatusActive || currentNode.Version != activeNode.Version || currentNode.Outcome != nil {
		t.Fatalf("node mutation must roll back with process failure, before=%#v after=%#v", activeNode, currentNode)
	}
}

func TestProcessRuntimeRepoCompleteProcessNodeRequiresActiveStatus(t *testing.T) {
	ctx := context.Background()
	client := enttest.Open(t, dialect.SQLite, "file:process_runtime_repo_complete_status_guard?mode=memory&cache=shared&_fk=1")
	defer mustCloseEntClient(t, client)

	repo := NewProcessRuntimeRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	instance, nodes, err := repo.CreateProcessInstance(ctx, &biz.ProcessInstanceCreate{
		ProcessKey:      "status_guard",
		ProcessVersion:  "v1",
		ConfigRevision:  "yoyoosun-rev-1",
		DefinitionHash:  "sha256:definition",
		BusinessRefType: "sales_order",
		BusinessRefID:   1003,
		IdempotencyKey:  "sales_order:1003:status-guard",
		Status:          biz.ProcessStatusActive,
		Nodes: []biz.ProcessNodeInstanceCreate{
			{NodeKey: "waiting", NodeType: biz.ProcessNodeTypeHumanTask, Attempt: 1, Status: biz.ProcessNodeStatusWaiting, PolicySnapshot: map[string]any{}},
			{NodeKey: "blocked", NodeType: biz.ProcessNodeTypeHumanTask, Attempt: 1, Status: biz.ProcessNodeStatusWaiting, PolicySnapshot: map[string]any{}},
			{NodeKey: "completed", NodeType: biz.ProcessNodeTypeHumanTask, Attempt: 1, Status: biz.ProcessNodeStatusWaiting, PolicySnapshot: map[string]any{}},
		},
	}, 7)
	if err != nil {
		t.Fatalf("create process failed: %v", err)
	}
	now := time.Now()
	if _, err := client.ProcessNodeInstance.UpdateOneID(nodes[1].ID).
		SetStatus(biz.ProcessNodeStatusBlocked).
		SetStartedAt(now).
		Save(ctx); err != nil {
		t.Fatalf("prepare blocked node fixture: %v", err)
	}
	if _, err := client.ProcessNodeInstance.UpdateOneID(nodes[2].ID).
		SetStatus(biz.ProcessNodeStatusCompleted).
		SetStartedAt(now).
		SetCompletedAt(now).
		Save(ctx); err != nil {
		t.Fatalf("prepare completed node fixture: %v", err)
	}
	for i := range nodes {
		nodes[i], err = repo.GetProcessNodeInstance(ctx, nodes[i].ID)
		if err != nil {
			t.Fatalf("reload guarded node fixture: %v", err)
		}
	}
	tests := []struct {
		name string
		node *biz.ProcessNodeInstance
		want error
	}{
		{name: "waiting", node: nodes[0], want: biz.ErrProcessNodeInstanceNotActive},
		{name: "blocked", node: nodes[1], want: biz.ErrProcessNodeInstanceNotActive},
		{name: "completed", node: nodes[2], want: biz.ErrProcessNodeInstanceSettled},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := repo.CompleteProcessNodeInstance(ctx, &biz.ProcessNodeInstanceComplete{
				ID:                tt.node.ID,
				ProcessInstanceID: instance.ID,
				ExpectedVersion:   tt.node.Version,
				Outcome:           "invalid completion",
			}, 7); !errors.Is(err, tt.want) {
				t.Fatalf("expected %v, got %v", tt.want, err)
			}
			current, err := repo.GetProcessNodeInstance(ctx, tt.node.ID)
			if err != nil {
				t.Fatalf("get guarded node: %v", err)
			}
			completedAtChanged := (current.CompletedAt == nil) != (tt.node.CompletedAt == nil)
			if current.CompletedAt != nil && tt.node.CompletedAt != nil && !current.CompletedAt.Equal(*tt.node.CompletedAt) {
				completedAtChanged = true
			}
			if current.Status != tt.node.Status || current.Version != tt.node.Version || completedAtChanged {
				t.Fatalf("invalid completion must not mutate node, before=%#v after=%#v", tt.node, current)
			}
		})
	}
}
