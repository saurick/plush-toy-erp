package service

import (
	"context"
	"io"
	"strings"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
)

type workflowAssignmentAdminReader map[int]*biz.AdminUser

func (r workflowAssignmentAdminReader) GetAdminByID(
	_ context.Context,
	id int,
) (*biz.AdminUser, error) {
	admin := r[id]
	if admin == nil {
		return nil, biz.ErrAdminNotFound
	}
	return admin, nil
}

func TestJsonrpcDispatcher_ReassignTaskUsesExplicitEligibleTarget(t *testing.T) {
	actor := workflowJSONRPCAdmin(
		[]string{biz.BossRoleKey},
		biz.PermissionWorkflowTaskRead,
		biz.PermissionWorkflowTaskAssign,
	)
	actor.ID = 7
	actor.Username = "boss"
	target := workflowJSONRPCAdmin(
		[]string{biz.QualityRoleKey},
		biz.PermissionWorkflowTaskRead,
		biz.PermissionWorkflowTaskUpdate,
		biz.PermissionWorkflowTaskComplete,
	)
	target.ID = 8
	target.Username = "quality_backup"
	repo := &stubWorkflowJSONRPCRepo{
		currentTask: &biz.WorkflowTask{
			ID:            42,
			TaskCode:      "QUALITY-42",
			TaskGroup:     "quality",
			TaskName:      "品质复核",
			SourceType:    "quality_inspection",
			SourceID:      18,
			TaskStatusKey: "blocked",
			OwnerRoleKey:  biz.QualityRoleKey,
			Payload:       map[string]any{"kept": true},
			Version:       3,
		},
	}
	dispatcher := &jsonrpcDispatcher{
		log: log.NewHelper(log.With(
			log.NewStdLogger(io.Discard),
			"module",
			"service.jsonrpc.workflow_assignment.test",
		)),
		adminReader: workflowAssignmentAdminReader{actor.ID: actor, target.ID: target},
		workflowUC:  biz.NewWorkflowUsecase(repo),
	}
	_, result, err := dispatcher.handleWorkflowTask(
		workflowJSONRPCAdminContext(),
		"reassign_task",
		"assignment-success",
		mustJSONRPCStruct(t, map[string]any{
			"task_id":          float64(42),
			"expected_version": float64(3),
			"idempotency_key":  "assignment-success-key",
			"assignee_id":      float64(target.ID),
			"reason":           "原处理人请假",
		}).AsMap(),
		actor.ID,
	)
	if err != nil {
		t.Fatalf("reassign_task transport error = %v", err)
	}
	if result.Code != errcode.OK.Code {
		t.Fatalf("reassign_task result = %#v", result)
	}
	if repo.assignmentInput == nil ||
		repo.assignmentInput.TargetAssigneeID == nil ||
		*repo.assignmentInput.TargetAssigneeID != target.ID ||
		repo.assignmentInput.ReleaseToPool ||
		repo.assignmentInput.AuditEvent == nil {
		t.Fatalf("unexpected assignment input: %#v", repo.assignmentInput)
	}
	if repo.assignmentActorID != actor.ID ||
		repo.assignmentRoleKey != biz.BossRoleKey {
		t.Fatalf(
			"assignment actor = (%d, %q), want (%d, %q)",
			repo.assignmentActorID,
			repo.assignmentRoleKey,
			actor.ID,
			biz.BossRoleKey,
		)
	}
	if repo.currentTask.TaskStatusKey != "blocked" ||
		repo.currentTask.OwnerRoleKey != biz.QualityRoleKey ||
		repo.currentTask.Payload["kept"] != true {
		t.Fatalf("reassignment changed task semantics: %#v", repo.currentTask)
	}
}

func TestJsonrpcDispatcher_ReassignTaskRejectsMissingTargetAndMissingPermission(t *testing.T) {
	task := &biz.WorkflowTask{
		ID:            42,
		TaskStatusKey: "ready",
		OwnerRoleKey:  biz.QualityRoleKey,
		Payload:       map[string]any{},
		Version:       3,
	}
	boss := workflowJSONRPCAdmin(
		[]string{biz.BossRoleKey},
		biz.PermissionWorkflowTaskRead,
		biz.PermissionWorkflowTaskAssign,
	)
	boss.ID = 7
	dispatcher := &jsonrpcDispatcher{
		log: log.NewHelper(log.With(
			log.NewStdLogger(io.Discard),
			"module",
			"service.jsonrpc.workflow_assignment.test",
		)),
		adminReader: workflowAssignmentAdminReader{boss.ID: boss},
		workflowUC:  biz.NewWorkflowUsecase(&stubWorkflowJSONRPCRepo{currentTask: task}),
	}
	base := map[string]any{
		"task_id":          float64(42),
		"expected_version": float64(3),
		"idempotency_key":  "assignment-missing-target",
		"reason":           "人员调整",
	}
	_, missingTarget, err := dispatcher.handleWorkflowTask(
		workflowJSONRPCAdminContext(),
		"reassign_task",
		"missing-target",
		mustJSONRPCStruct(t, base).AsMap(),
		boss.ID,
	)
	if err != nil || missingTarget.Code != errcode.InvalidParam.Code {
		t.Fatalf("missing target result = %#v err=%v", missingTarget, err)
	}

	pmc := workflowJSONRPCAdmin(
		[]string{biz.PMCRoleKey},
		biz.PermissionWorkflowTaskRead,
		biz.PermissionWorkflowTaskSupervise,
	)
	pmc.ID = 7
	dispatcher.adminReader = workflowAssignmentAdminReader{pmc.ID: pmc}
	base["assignee_id"] = nil
	_, denied, err := dispatcher.handleWorkflowTask(
		workflowJSONRPCAdminContext(),
		"reassign_task",
		"pmc-denied",
		mustJSONRPCStruct(t, base).AsMap(),
		pmc.ID,
	)
	if err != nil || denied.Code != errcode.PermissionDenied.Code {
		t.Fatalf("PMC reassignment result = %#v err=%v", denied, err)
	}
}

func TestWorkflowTaskAssignmentCandidateRequiresActiveDirectOwnerRole(t *testing.T) {
	task := &biz.WorkflowTask{
		ID:            42,
		TaskStatusKey: "ready",
		OwnerRoleKey:  biz.WarehouseRoleKey,
		Version:       3,
	}
	dispatcher := &jsonrpcDispatcher{}
	eligible := workflowJSONRPCAdmin(
		[]string{biz.WarehouseRoleKey},
		biz.PermissionWorkflowTaskRead,
		biz.PermissionWorkflowTaskUpdate,
		biz.PermissionWorkflowTaskComplete,
	)
	if !dispatcher.workflowTaskAssignmentCandidateEligible(
		context.Background(),
		eligible,
		task,
	) {
		t.Fatal("active direct owner-role account must be eligible")
	}
	superAdmin := workflowJSONRPCAdmin(
		[]string{biz.AdminRoleKey},
		biz.PermissionWorkflowTaskRead,
		biz.PermissionWorkflowTaskUpdate,
		biz.PermissionWorkflowTaskComplete,
	)
	superAdmin.IsSuperAdmin = true
	if dispatcher.workflowTaskAssignmentCandidateEligible(
		context.Background(),
		superAdmin,
		task,
	) {
		t.Fatal("super admin without the business owner role must not become a candidate")
	}
	eligible.Disabled = true
	if dispatcher.workflowTaskAssignmentCandidateEligible(
		context.Background(),
		eligible,
		task,
	) {
		t.Fatal("disabled owner-role account must not be eligible")
	}
}

func TestWorkflowTaskAssignmentCandidateRequiresAuthoritativeSourceReadAccess(t *testing.T) {
	task := workflowAssignmentShipmentSourceTask()
	dispatcher := &jsonrpcDispatcher{}
	withoutSourceRead := workflowJSONRPCAdmin(
		[]string{biz.WarehouseRoleKey},
		biz.PermissionWorkflowTaskRead,
		biz.PermissionWorkflowTaskUpdate,
		biz.PermissionWorkflowTaskComplete,
	)
	if dispatcher.workflowTaskAssignmentCandidateEligible(
		context.Background(),
		withoutSourceRead,
		task,
	) {
		t.Fatal("candidate without shipment read access must be ineligible")
	}

	withSourceReadFromAnotherRole := workflowJSONRPCAdmin(
		[]string{biz.WarehouseRoleKey, biz.SalesRoleKey},
		biz.PermissionWorkflowTaskRead,
		biz.PermissionWorkflowTaskUpdate,
		biz.PermissionWorkflowTaskComplete,
		biz.PermissionShipmentRead,
	)
	if !dispatcher.workflowTaskAssignmentCandidateEligible(
		context.Background(),
		withSourceReadFromAnotherRole,
		task,
	) {
		t.Fatal("candidate may satisfy source read access through another active role")
	}
}

func TestJsonrpcDispatcher_ReassignTaskCarriesSourceReadContractToRepo(t *testing.T) {
	actor := workflowJSONRPCAdmin(
		[]string{biz.BossRoleKey},
		biz.PermissionWorkflowTaskRead,
		biz.PermissionWorkflowTaskAssign,
	)
	actor.ID = 7
	actor.Username = "boss"
	target := workflowJSONRPCAdmin(
		[]string{biz.WarehouseRoleKey},
		biz.PermissionWorkflowTaskRead,
		biz.PermissionWorkflowTaskUpdate,
		biz.PermissionWorkflowTaskComplete,
		biz.PermissionShipmentRead,
	)
	target.ID = 8
	target.Username = "warehouse_backup"
	task := workflowAssignmentShipmentSourceTask()
	repo := &stubWorkflowJSONRPCRepo{currentTask: task}
	dispatcher := &jsonrpcDispatcher{
		log: log.NewHelper(log.With(
			log.NewStdLogger(io.Discard),
			"module",
			"service.jsonrpc.workflow_assignment_source.test",
		)),
		adminReader: workflowAssignmentAdminReader{actor.ID: actor, target.ID: target},
		workflowUC:  biz.NewWorkflowUsecase(repo),
	}
	_, result, err := dispatcher.handleWorkflowTask(
		workflowJSONRPCAdminContext(),
		"reassign_task",
		"assignment-source-success",
		mustJSONRPCStruct(t, map[string]any{
			"task_id":          float64(task.ID),
			"expected_version": float64(task.Version),
			"idempotency_key":  "assignment-source-success-key",
			"assignee_id":      float64(target.ID),
			"reason":           "转给具备出货查看权限的仓库人员",
		}).AsMap(),
		actor.ID,
	)
	if err != nil || result.Code != errcode.OK.Code {
		t.Fatalf("reassign source task result = %#v err=%v", result, err)
	}
	if repo.assignmentInput == nil {
		t.Fatal("expected assignment input")
	}
	if len(repo.assignmentInput.RequiredAccountPermissionAll) != 1 ||
		repo.assignmentInput.RequiredAccountPermissionAll[0] != biz.PermissionShipmentRead {
		t.Fatalf(
			"source read requirements = %#v, want shipment.read",
			repo.assignmentInput.RequiredAccountPermissionAll,
		)
	}
	if len(repo.assignmentInput.RequiredAccountPermissionAny) != 0 {
		t.Fatalf(
			"unexpected source any requirements %#v",
			repo.assignmentInput.RequiredAccountPermissionAny,
		)
	}
}

func workflowAssignmentShipmentSourceTask() *biz.WorkflowTask {
	return &biz.WorkflowTask{
		ID:            42,
		TaskCode:      biz.WorkflowSourceTaskCode(biz.WorkflowSourceTaskShipmentReleaseGroup, 18),
		TaskGroup:     biz.WorkflowSourceTaskShipmentReleaseGroup,
		TaskName:      "出货放行",
		SourceType:    biz.WorkflowSourceTaskShipmentSourceType,
		SourceID:      18,
		TaskStatusKey: "ready",
		OwnerRoleKey:  biz.WarehouseRoleKey,
		Payload: map[string]any{
			"source_task_contract":    biz.WorkflowSourceTaskContractV1,
			"source_task_producer":    biz.WorkflowSourceTaskShipmentSubmitReleaseProducer,
			"source_task_intent_hash": strings.Repeat("a", 64),
			"shipment_id":             float64(18),
			"shipment_release":        true,
		},
		Version: 3,
	}
}
