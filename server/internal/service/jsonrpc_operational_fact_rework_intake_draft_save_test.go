package service

import (
	"context"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/errcode"
)

type reworkIntakeDraftSaveJSONRPCRepo struct {
	stubBusinessDashboardOperationalFactRepo
	saveCalls       int
	saved           *biz.ReworkIntakeDraftSave
	candidateCalls  int
	candidateFilter biz.ReworkIntakeSourceCandidateFilter
}

func (r *reworkIntakeDraftSaveJSONRPCRepo) CreateReworkIntake(context.Context, *biz.ReworkIntakeCreate, int, string) (*biz.ReworkIntake, error) {
	return nil, nil
}

func (r *reworkIntakeDraftSaveJSONRPCRepo) SaveReworkIntakeDraft(_ context.Context, in *biz.ReworkIntakeDraftSave) (*biz.ReworkIntake, error) {
	r.saveCalls++
	r.saved = in
	now := time.Date(2026, 8, 9, 0, 0, 0, 0, time.UTC)
	return &biz.ReworkIntake{
		ID: in.ID, IntakeNo: in.IntakeNo, SourceShipmentID: in.SourceShipmentID,
		Status: biz.ReworkIntakeStatusDraft, ProgressStage: biz.ReworkIntakeStageWaitingReceive,
		Reason: in.Reason, Version: in.ExpectedVersion + 1, CreatedBy: 1,
		CreatedAt: now, UpdatedAt: now, Items: []*biz.ReworkIntakeItem{},
	}, nil
}

func (r *reworkIntakeDraftSaveJSONRPCRepo) ReceiveReworkIntake(context.Context, *biz.ReworkIntakeTransition, int) (*biz.ReworkIntake, error) {
	return nil, nil
}

func (r *reworkIntakeDraftSaveJSONRPCRepo) CancelReworkIntake(context.Context, *biz.ReworkIntakeTransition, int) (*biz.ReworkIntake, error) {
	return nil, nil
}

func (r *reworkIntakeDraftSaveJSONRPCRepo) ReverseReworkIntake(context.Context, *biz.ReworkIntakeTransition, int) (*biz.ReworkIntake, error) {
	return nil, nil
}

func (r *reworkIntakeDraftSaveJSONRPCRepo) GetReworkIntake(context.Context, int) (*biz.ReworkIntake, error) {
	return nil, nil
}

func (r *reworkIntakeDraftSaveJSONRPCRepo) ListReworkIntakes(context.Context, biz.ReworkIntakeFilter) ([]*biz.ReworkIntake, int, error) {
	return nil, 0, nil
}

func (r *reworkIntakeDraftSaveJSONRPCRepo) ListReworkIntakeSourceCandidates(_ context.Context, filter biz.ReworkIntakeSourceCandidateFilter) ([]*biz.ReworkIntakeSourceCandidate, int, error) {
	r.candidateCalls++
	r.candidateFilter = filter
	return []*biz.ReworkIntakeSourceCandidate{}, 0, nil
}

func (r *reworkIntakeDraftSaveJSONRPCRepo) CreateProductionReworkFromIntake(context.Context, *biz.ProductionReworkFromIntakeCreate) (*biz.ProductionFact, error) {
	return nil, nil
}

func (r *reworkIntakeDraftSaveJSONRPCRepo) CreateReworkReshipment(context.Context, *biz.ReworkReshipmentCreate) (*biz.Shipment, error) {
	return nil, nil
}

func reworkIntakeDraftSaveJSONRPCParams() map[string]any {
	return map[string]any{
		"id":                 41,
		"expected_version":   3,
		"intake_no":          "HCF-EDIT-041",
		"source_shipment_id": 11,
		"reason":             "客户更新返工要求",
		"items": []any{map[string]any{
			"source_shipment_item_id":         12,
			"target_production_order_item_id": 13,
			"quantity":                        "2.500000",
			"note":                            "更新后的行说明",
		}},
	}
}

func newReworkIntakeDraftSaveJSONRPCDispatcher(
	t *testing.T,
	admin *biz.AdminUser,
	repo biz.OperationalFactRepo,
) *jsonrpcDispatcher {
	t.Helper()
	dispatcher := newOperationalFactJSONRPCTestDataWithRepo(t, admin, repo)
	const revision = "2026.08.09.rework-intake-draft-save"
	params := customerConfigPublishParamsForRevision(t, revision)
	params = customerConfigPublishParamsWithRevisionAndModuleState(t, params, revision, "production", "enabled")
	params = customerConfigPublishParamsWithRevisionAndModuleState(t, params, revision, "rework_intakes", "enabled")
	publishAndActivateCustomerConfigUsecaseForTest(t, dispatcher, params, 1)
	return dispatcher
}

func TestJSONRPCSaveReworkIntakeDraftUsesUpdatePermissionStrictParamsAndVersion(t *testing.T) {
	repo := &reworkIntakeDraftSaveJSONRPCRepo{}
	dispatcher := newReworkIntakeDraftSaveJSONRPCDispatcher(t, shipmentSourceCandidateAdmin(
		biz.PermissionReworkIntakeUpdate,
		biz.PermissionShipmentRead,
		biz.PermissionProductionWIPRead,
	), repo)
	_, result, err := dispatcher.handleOperationalFact(
		workflowJSONRPCAdminContext(),
		"save_rework_intake_draft",
		"save",
		mustJSONRPCStruct(t, reworkIntakeDraftSaveJSONRPCParams()),
	)
	if err != nil || result == nil || result.Code != errcode.OK.Code {
		t.Fatalf("save rework intake draft result=%#v err=%v", result, err)
	}
	if repo.saveCalls != 1 || repo.saved == nil || repo.saved.ID != 41 || repo.saved.ExpectedVersion != 3 || len(repo.saved.Items) != 1 {
		t.Fatalf("save input=%#v calls=%d", repo.saved, repo.saveCalls)
	}
	projection, ok := result.Data.AsMap()["rework_intake"].(map[string]any)
	if !ok || projection["version"] != float64(4) {
		t.Fatalf("rework intake projection=%#v", result.Data.AsMap()["rework_intake"])
	}

	invalid := reworkIntakeDraftSaveJSONRPCParams()
	invalid["idempotency_key"] = "create-intent-must-not-change"
	_, invalidResult, err := dispatcher.handleOperationalFact(
		workflowJSONRPCAdminContext(),
		"save_rework_intake_draft",
		"invalid",
		mustJSONRPCStruct(t, invalid),
	)
	if err != nil || invalidResult == nil || invalidResult.Code != errcode.InvalidParam.Code || repo.saveCalls != 1 {
		t.Fatalf("strict save result=%#v calls=%d err=%v", invalidResult, repo.saveCalls, err)
	}
}

func TestJSONRPCSaveReworkIntakeDraftRequiresUpdateAndSourceReadPermissions(t *testing.T) {
	required := []string{
		biz.PermissionReworkIntakeUpdate,
		biz.PermissionShipmentRead,
		biz.PermissionProductionWIPRead,
	}
	for missingIndex, missing := range required {
		t.Run("missing "+missing, func(t *testing.T) {
			permissions := append([]string(nil), required[:missingIndex]...)
			permissions = append(permissions, required[missingIndex+1:]...)
			repo := &reworkIntakeDraftSaveJSONRPCRepo{}
			dispatcher := newReworkIntakeDraftSaveJSONRPCDispatcher(t, shipmentSourceCandidateAdmin(permissions...), repo)
			_, result, err := dispatcher.handleOperationalFact(
				workflowJSONRPCAdminContext(),
				"save_rework_intake_draft",
				"denied",
				mustJSONRPCStruct(t, reworkIntakeDraftSaveJSONRPCParams()),
			)
			if err != nil || result == nil || result.Code != errcode.PermissionDenied.Code || repo.saveCalls != 0 {
				t.Fatalf("missing %s result=%#v calls=%d err=%v", missing, result, repo.saveCalls, err)
			}
		})
	}
}

func TestJSONRPCReworkIntakeCandidateEditContextRequiresUpdatePermission(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	params := mustJSONRPCStruct(t, map[string]any{"rework_intake_id": 41, "limit": 50})
	createOnlyRepo := &reworkIntakeDraftSaveJSONRPCRepo{}
	createOnly := newReworkIntakeDraftSaveJSONRPCDispatcher(t, shipmentSourceCandidateAdmin(
		biz.PermissionReworkIntakeCreate,
		biz.PermissionShipmentRead,
		biz.PermissionProductionWIPRead,
	), createOnlyRepo)
	_, denied, err := createOnly.handleOperationalFact(ctx, "list_rework_intake_source_candidates", "create-only", params)
	if err != nil || denied == nil || denied.Code != errcode.PermissionDenied.Code || createOnlyRepo.candidateCalls != 0 {
		t.Fatalf("create-only edit context result=%#v calls=%d err=%v", denied, createOnlyRepo.candidateCalls, err)
	}

	updateRepo := &reworkIntakeDraftSaveJSONRPCRepo{}
	update := newReworkIntakeDraftSaveJSONRPCDispatcher(t, shipmentSourceCandidateAdmin(
		biz.PermissionReworkIntakeUpdate,
		biz.PermissionShipmentRead,
		biz.PermissionProductionWIPRead,
	), updateRepo)
	_, allowed, err := update.handleOperationalFact(ctx, "list_rework_intake_source_candidates", "update", params)
	if err != nil || allowed == nil || allowed.Code != errcode.OK.Code || updateRepo.candidateCalls != 1 || updateRepo.candidateFilter.EditingReworkIntakeDraftID != 41 {
		t.Fatalf("update edit context result=%#v filter=%#v calls=%d err=%v", allowed, updateRepo.candidateFilter, updateRepo.candidateCalls, err)
	}
}
