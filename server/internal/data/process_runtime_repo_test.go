package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/enttest"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
	_ "github.com/mattn/go-sqlite3"
)

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
				Status:                biz.ProcessNodeStatusActive,
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

func TestProcessRuntimeRepoRejectsDuplicateIdempotency(t *testing.T) {
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
	if _, _, err := repo.CreateProcessInstance(ctx, in, 7); err != nil {
		t.Fatalf("first create failed: %v", err)
	}
	if _, _, err := repo.CreateProcessInstance(ctx, in, 7); !errors.Is(err, biz.ErrProcessInstanceExists) {
		t.Fatalf("expected ErrProcessInstanceExists, got %v", err)
	}
	if _, err := repo.GetProcessInstance(ctx, 999); !errors.Is(err, biz.ErrProcessInstanceNotFound) {
		t.Fatalf("expected not found, got %v", err)
	}
	if _, err := repo.GetProcessNodeInstance(ctx, 999); !errors.Is(err, biz.ErrProcessNodeInstanceNotFound) {
		t.Fatalf("expected node not found, got %v", err)
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
	instance, nodes, err := repo.CreateProcessInstance(ctx, &biz.ProcessInstanceCreate{
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
				Status:                biz.ProcessNodeStatusActive,
				OwnerPoolKey:          &ownerPoolKey,
				RequiredCapabilityKey: &requiredCapabilityKey,
				PolicySnapshot:        map[string]any{"return_max_attempts": 2},
			},
		},
	}, 7)
	if err != nil {
		t.Fatalf("create process failed: %v", err)
	}
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
				NodeType:       biz.ProcessNodeTypeHumanTask,
				Attempt:        1,
				Status:         biz.ProcessNodeStatusActive,
				PolicySnapshot: map[string]any{},
				DueAt:          &dueAt,
			},
		},
	}, 7)
	if err != nil {
		t.Fatalf("create process failed: %v", err)
	}
	activeNode, err := repo.GetProcessNodeInstance(ctx, nodes[0].ID)
	if err != nil {
		t.Fatalf("get active node failed: %v", err)
	}
	blockedNode, err := repo.BlockProcessNodeInstance(ctx, &biz.ProcessNodeInstanceBlock{
		ProcessInstanceID:     instance.ID,
		ProcessNodeInstanceID: activeNode.ID,
		ExpectedVersion:       activeNode.Version,
		Reason:                "样衣资料缺失",
		Outcome:               "blocked",
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
	if blockedNode.Version != activeNode.Version+1 {
		t.Fatalf("expected blocked node version increment, got %d from %d", blockedNode.Version, activeNode.Version)
	}
	if _, err := repo.BlockProcessNodeInstance(ctx, &biz.ProcessNodeInstanceBlock{
		ProcessInstanceID:     instance.ID,
		ProcessNodeInstanceID: activeNode.ID,
		ExpectedVersion:       activeNode.Version,
		Reason:                "重复阻塞",
		Outcome:               "blocked",
	}, 7); !errors.Is(err, biz.ErrProcessNodeInstanceConflict) {
		t.Fatalf("expected stale block conflict, got %v", err)
	}
	blockedProcess, err := repo.BlockProcessInstance(ctx, &biz.ProcessInstanceBlock{
		ID: instance.ID,
	}, 7)
	if err != nil {
		t.Fatalf("block process failed: %v", err)
	}
	if blockedProcess.Status != biz.ProcessStatusBlocked || blockedProcess.CompletedAt != nil {
		t.Fatalf("expected blocked process without completed_at, got %#v", blockedProcess)
	}
	if _, err := repo.BlockProcessInstance(ctx, &biz.ProcessInstanceBlock{
		ID: instance.ID,
	}, 7); !errors.Is(err, biz.ErrProcessInstanceSettled) {
		t.Fatalf("expected settled process error on duplicate block, got %v", err)
	}
}
