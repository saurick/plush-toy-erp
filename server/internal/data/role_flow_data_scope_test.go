package data

import (
	"context"
	"errors"
	"fmt"
	"io"
	"testing"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"server/internal/biz"
)

func TestRoleFlowWarehouseScopeOnQualityAndFacts(t *testing.T) { runRoleFlowWarehouseScope(t, false) }
func TestOperationalFactPostgresRoleFlowWarehouseScope(t *testing.T) {
	runRoleFlowWarehouseScope(t, true)
}

func runRoleFlowWarehouseScope(t *testing.T, postgres bool) {
	t.Helper()
	ctx := context.Background()
	data, client, _, fixtures, prefix := openPerformanceReadTestData(t, "role_flow_scope", postgres)
	logger := log.NewStdLogger(io.Discard)
	inventory := biz.NewInventoryUsecase(NewInventoryRepo(data, logger))
	facts := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger))
	repo := NewOperationalFactRepo(data, logger)
	actor := client.AdminUser.Create().SetUsername(prefix + "-scope").SetPasswordHash("test-only").SaveX(ctx)
	warehouseIDs := []int{fixtures.productWarehouseID, createTestProductWarehouse(t, ctx, client, prefix+"-other").ID}
	qualityInputs := []*biz.QualityInspectionFromOutsourcingReturnCreate{}
	inspections := []*biz.QualityInspection{}
	outsourcing := []*biz.OutsourcingFact{}
	productionInputs := []*biz.OperationalFactMutation{}
	production := []*biz.ProductionFact{}
	dispositionInputs := []*biz.OutsourcingReturnDispositionCreate{}
	dispositions := []*biz.OutsourcingReturnDisposition{}
	for i, warehouseID := range warehouseIDs {
		label := fmt.Sprintf("%s-%d", prefix, i)
		f := fixtures
		f.productWarehouseID = warehouseID
		fact := createPostedOutsourcingReturnForQuality(t, ctx, client, inventory, facts, f, actor.ID, label)
		outsourcing = append(outsourcing, fact)
		linkRejectedOutsourcingReturnBatchForDisposition(t, ctx, data, client, fact, label)
		input := &biz.QualityInspectionFromOutsourcingReturnCreate{InspectionNo: "QI-" + label, OutsourcingFactID: fact.ID}
		qualityInputs = append(qualityInputs, input)
		inspection, err := inventory.CreateQualityInspectionFromOutsourcingReturn(ctx, input)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = inventory.SubmitQualityInspection(ctx, inspection.ID); err != nil {
			t.Fatal(err)
		}
		inspection, err = inventory.RejectQualityInspection(ctx, approximateQualityInspectionDecision(inspection.ID, biz.QualityInspectionResultReject))
		if err != nil {
			t.Fatal(err)
		}
		inspections = append(inspections, inspection)
		dispositionInput := &biz.OutsourcingReturnDispositionCreate{DispositionNo: "OD-" + label, QualityInspectionID: inspection.ID, DispositionType: biz.OutsourcingDispositionReturnToVendor, Quantity: decimal.NewFromInt(1), Reason: "退回加工商", IdempotencyKey: "OD-" + label, CreatedBy: actor.ID}
		disposition, err := facts.CreateOutsourcingReturnDisposition(ctx, dispositionInput)
		if err != nil {
			t.Fatal(err)
		}
		dispositionInputs = append(dispositionInputs, dispositionInput)
		dispositions = append(dispositions, disposition)
		productionInput := &biz.OperationalFactMutation{FactNo: "PF-" + label, FactType: biz.ProductionFactFinishedGoodsReceipt, SubjectType: biz.InventorySubjectProduct, SubjectID: f.productID, WarehouseID: warehouseID, UnitID: f.unitID, Quantity: decimal.NewFromInt(1), IdempotencyKey: "PF-" + label}
		productionFact, err := repo.CreateProductionFactDraft(ctx, productionInput)
		if err != nil {
			t.Fatal(err)
		}
		productionInputs = append(productionInputs, productionInput)
		production = append(production, productionFact)
	}
	for _, testCase := range []struct {
		name  string
		scope biz.WarehouseDataScope
		count int
	}{
		{"assigned", biz.WarehouseDataScope{Mode: biz.DataScopeModeAssigned, WarehouseIDs: warehouseIDs[:1]}, 1},
		{"none", biz.WarehouseDataScope{Mode: biz.DataScopeModeNone}, 0},
		{"empty-assigned", biz.WarehouseDataScope{Mode: biz.DataScopeModeAssigned}, 0},
		{"all", biz.WarehouseDataScope{Mode: biz.DataScopeModeAll}, 2},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			access := biz.WithWarehouseDataScope(ctx, testCase.scope)
			for _, offset := range []int{0, 1, 2} {
				wantRows := 0
				if testCase.count > offset {
					wantRows = 1
				}
				q, total, err := inventory.ListOutsourcingReturnQualityInspections(access, biz.QualityInspectionFilter{SourceIDs: []int{outsourcing[0].ID, outsourcing[1].ID}, Limit: 1, Offset: offset})
				if err != nil || total != testCase.count || len(q) != wantRows {
					t.Fatalf("quality filter before pagination: count=%d rows=%d err=%v", total, len(q), err)
				}
				o, total, err := repo.ListOutsourcingFacts(access, biz.OperationalFactFilter{Keyword: prefix, Limit: 1, Offset: offset})
				if err != nil || total != testCase.count || len(o) != wantRows {
					t.Fatalf("outsourcing scope: count=%d rows=%d err=%v", total, len(o), err)
				}
				p, total, err := repo.ListProductionFacts(access, biz.OperationalFactFilter{Keyword: prefix, Limit: 1, Offset: offset})
				if err != nil || total != testCase.count || len(p) != wantRows {
					t.Fatalf("production scope: count=%d rows=%d err=%v", total, len(p), err)
				}
			}
			for i := range warehouseIDs {
				_, err := inventory.GetQualityInspection(access, inspections[i].ID)
				allowed := testCase.scope.IsAll() || testCase.count == 1 && i == 0
				if allowed {
					if err != nil {
						t.Fatal(err)
					}
					continue
				}
				assertRoleFlowScopeDenied(t, "quality detail", err)
				_, err = inventory.SubmitQualityInspection(access, inspections[i].ID)
				assertRoleFlowScopeDenied(t, "quality submit", err)
				_, err = inventory.CancelQualityInspection(access, inspections[i].ID, nil)
				assertRoleFlowScopeDenied(t, "quality cancel", err)
				_, err = inventory.CreateQualityInspectionFromOutsourcingReturn(access, qualityInputs[i])
				assertRoleFlowScopeDenied(t, "quality replay", err)
				_, err = facts.PostOutsourcingFact(access, operationalFactStatusMutation(outsourcing[i].ID, outsourcing[i].Version, actor.ID, ""))
				assertRoleFlowScopeDenied(t, "outsourcing post replay", err)
				_, err = facts.CancelPostedOutsourcingFact(access, operationalFactStatusMutation(outsourcing[i].ID, outsourcing[i].Version, actor.ID, "范围核对"))
				assertRoleFlowScopeDenied(t, "outsourcing cancel", err)
				_, err = repo.CreateProductionFactDraft(access, productionInputs[i])
				assertRoleFlowScopeDenied(t, "production replay", err)
				_, err = repo.GetProductionFactTransitionPolicy(access, production[i].ID)
				assertRoleFlowScopeDenied(t, "production source policy", err)
				_, err = facts.GetOutsourcingReturnDisposition(access, dispositions[i].ID)
				assertRoleFlowScopeDenied(t, "disposition detail", err)
				_, err = facts.CreateOutsourcingReturnDisposition(access, dispositionInputs[i])
				assertRoleFlowScopeDenied(t, "disposition replay", err)
				_, err = facts.PostOutsourcingReturnDisposition(access, &biz.OutsourcingReturnDispositionMutation{ID: dispositions[i].ID, ExpectedVersion: dispositions[i].Version, ActorID: actor.ID})
				assertRoleFlowScopeDenied(t, "disposition post", err)
			}
			for i, fact := range outsourcing {
				want := 0
				if testCase.scope.IsAll() || testCase.count == 1 && i == 0 {
					want = 1
				}
				for _, offset := range []int{0, 1} {
					rows, total, err := facts.ListOutsourcingReturnDispositions(access, biz.OutsourcingReturnDispositionFilter{OutsourcingReturnFactID: fact.ID, Limit: 1, Offset: offset})
					wantRows := want
					if offset == 1 {
						wantRows = 0
					}
					if err != nil || total != want || len(rows) != wantRows {
						t.Fatalf("disposition SQL scope: count=%d rows=%d err=%v", total, len(rows), err)
					}
				}
			}
		})
	}
}

func assertRoleFlowScopeDenied(t *testing.T, action string, err error) {
	t.Helper()
	if !errors.Is(err, biz.ErrDataScopeForbidden) {
		t.Fatalf("%s must fail with scope denial, got %v", action, err)
	}
}

func TestRoleFlowWIPQualityDoesNotInventWarehouseOwnership(t *testing.T) {
	f := openProductionWIPQualityTestFixture(t, "role_flow_wip_scope")
	fixture := f.createWaitingBatch(t, "ROLE-SCOPE", []string{biz.ProductionWIPQualityGateFinishedGoods})
	ctx := biz.WithWarehouseDataScope(f.ctx, biz.WarehouseDataScope{Mode: biz.DataScopeModeNone})
	item, err := f.uc.GetQualityInspection(ctx, fixture.inspection.ID)
	if err != nil || item.WarehouseID != 0 {
		t.Fatalf("WIP has no warehouse: %#v %v", item, err)
	}
	items, total, err := f.uc.ListProductionStageQualityInspections(ctx, biz.QualityInspectionFilter{Limit: 1})
	if err != nil || total != 1 || len(items) != 1 {
		t.Fatalf("WIP scope: %d %d %v", total, len(items), err)
	}
	if _, err := f.uc.SubmitQualityInspection(ctx, fixture.inspection.ID); err != nil {
		t.Fatal(err)
	}
}
