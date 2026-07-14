package data

import (
	"context"
	"errors"
	"io"
	"sync"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/bomitem"
	"server/internal/data/model/ent/inventorybalance"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/productionfact"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestProductionOrderReleaseFreezesMaterialRequirementsAndKeepsNoBOMExplicit(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "production_order_material_requirement_snapshot")
	created, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{
		Draft: f.draft("MO-MATERIAL-SNAPSHOT", 10), ActorID: f.actorID, IdempotencyKey: "mo-material-snapshot-create",
	})
	if err != nil {
		t.Fatalf("create production order: %v", err)
	}
	released, err := f.uc.Release(ctx, &biz.ProductionOrderAction{
		ID: created.Order.ID, ExpectedVersion: 1, ActorID: f.actorID, IdempotencyKey: "mo-material-snapshot-release",
	})
	if err != nil {
		t.Fatalf("release production order: %v", err)
	}
	if len(released.MaterialRequirements) != 1 {
		t.Fatalf("material requirement count=%d, want 1", len(released.MaterialRequirements))
	}
	if released.MaterialRequirementsState != biz.ProductionOrderMaterialRequirementsReady {
		t.Fatalf("material requirements state=%s, want READY", released.MaterialRequirementsState)
	}
	requirement := released.MaterialRequirements[0]
	if requirement.MaterialID != f.materialID || !requirement.UnitQuantitySnapshot.Equal(decimal.NewFromInt(2)) ||
		!requirement.LossRateSnapshot.Equal(decimal.RequireFromString("0.1")) ||
		!requirement.PlannedQuantity.Equal(decimal.NewFromInt(22)) || !requirement.IssuedQuantity.IsZero() ||
		!requirement.RemainingQuantity.Equal(decimal.NewFromInt(22)) {
		t.Fatalf("released material requirement=%#v", requirement)
	}

	row := f.client.BOMItem.Query().Where(bomitem.BomHeaderID(f.bomID)).OnlyX(ctx)
	f.client.BOMItem.UpdateOneID(row.ID).
		SetQuantity(decimal.NewFromInt(9)).
		SetLossRate(decimal.RequireFromString("0.2")).
		SaveX(ctx)
	reloaded, err := f.uc.Get(ctx, released.Order.ID)
	if err != nil || len(reloaded.MaterialRequirements) != 1 || !reloaded.MaterialRequirements[0].PlannedQuantity.Equal(decimal.NewFromInt(22)) {
		t.Fatalf("BOM edit changed frozen requirement=%#v err=%v", reloaded, err)
	}
	if err := f.client.ProductionOrderMaterialRequirement.DeleteOneID(requirement.ID).Exec(ctx); err == nil {
		t.Fatal("immutable material requirement delete unexpectedly succeeded")
	}
	replayed, err := f.uc.Release(ctx, &biz.ProductionOrderAction{
		ID: created.Order.ID, ExpectedVersion: 999, ActorID: f.actorID, IdempotencyKey: "mo-material-snapshot-release",
	})
	if err != nil || len(replayed.MaterialRequirements) != 1 || replayed.MaterialRequirements[0].ID != requirement.ID {
		t.Fatalf("release replay duplicated material requirement=%#v err=%v", replayed, err)
	}

	withoutBOM := f.draft("MO-MATERIAL-NO-BOM", 1)
	withoutBOM.Items[0].BOMHeaderID = nil
	createdWithoutBOM, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{
		Draft: withoutBOM, ActorID: f.actorID, IdempotencyKey: "mo-material-no-bom-create",
	})
	if err != nil {
		t.Fatalf("create no-BOM production order: %v", err)
	}
	releasedWithoutBOM, err := f.uc.Release(ctx, &biz.ProductionOrderAction{
		ID: createdWithoutBOM.Order.ID, ExpectedVersion: 1, ActorID: f.actorID, IdempotencyKey: "mo-material-no-bom-release",
	})
	if err != nil || len(releasedWithoutBOM.MaterialRequirements) != 0 || releasedWithoutBOM.MaterialRequirementsState != biz.ProductionOrderMaterialRequirementsNotRequired {
		t.Fatalf("no-BOM release=%#v err=%v", releasedWithoutBOM, err)
	}
	factUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(f.data, log.NewStdLogger(io.Discard)))
	if _, err := factUC.CreateProductionMaterialIssueFromOrder(ctx, &biz.ProductionMaterialIssueFromOrderCreate{
		FactNo: "PF-NO-BOM", ProductionOrderID: releasedWithoutBOM.Order.ID,
		ProductionOrderItemID: releasedWithoutBOM.Items[0].ID, ProductionOrderMaterialRequirementID: 999999,
		WarehouseID: createTestWarehouse(t, ctx, f.client, "PO-NO-BOM-WH").ID,
		Quantity:    decimal.NewFromInt(1), IdempotencyKey: "pf-no-bom",
	}); !errors.Is(err, biz.ErrProductionOrderMaterialRequirementNotFound) {
		t.Fatalf("no-BOM material issue error=%v", err)
	}

	historical, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{
		Draft: f.draft("MO-MATERIAL-HISTORICAL", 1), ActorID: f.actorID, IdempotencyKey: "mo-material-historical-create",
	})
	if err != nil {
		t.Fatalf("create historical production order fixture: %v", err)
	}
	now := time.Now().UTC()
	f.client.ProductionOrder.UpdateOneID(historical.Order.ID).
		SetStatus(biz.ProductionOrderStatusReleased).
		SetVersion(2).
		SetReleasedBy(f.actorID).
		SetReleasedAt(now).
		SaveX(ctx)
	historicalAggregate, err := f.uc.Get(ctx, historical.Order.ID)
	if err != nil || historicalAggregate.MaterialRequirementsState != biz.ProductionOrderMaterialRequirementsNeedsReview || len(historicalAggregate.MaterialRequirements) != 0 {
		t.Fatalf("historical production order material state=%#v err=%v", historicalAggregate, err)
	}
	wrongMaterial := createTestMaterial(t, ctx, f.client, f.unitID, "POR-M-WRONG")
	wrongRequirement := f.client.ProductionOrderMaterialRequirement.Create().
		SetProductionOrderID(historical.Order.ID).
		SetProductionOrderItemID(historical.Items[0].ID).
		SetBomHeaderID(f.bomID).
		SetBomItemID(row.ID).
		SetMaterialID(wrongMaterial.ID).
		SetUnitID(f.unitID).
		SetUnitQuantitySnapshot(row.Quantity).
		SetLossRateSnapshot(row.LossRate).
		SetPlannedQuantity(decimal.RequireFromString("10.8")).
		SetMaterialCodeSnapshot(wrongMaterial.Code).
		SetMaterialNameSnapshot(wrongMaterial.Name).
		SetUnitCodeSnapshot("POR-U").
		SetUnitNameSnapshot("POR-U单位").
		SaveX(ctx)
	historicalAggregate, err = f.uc.Get(ctx, historical.Order.ID)
	if err != nil || historicalAggregate.MaterialRequirementsState != biz.ProductionOrderMaterialRequirementsNeedsReview || len(historicalAggregate.MaterialRequirements) != 1 {
		t.Fatalf("mismatched historical requirement state=%#v err=%v", historicalAggregate, err)
	}
	if _, err := factUC.CreateProductionMaterialIssueFromOrder(ctx, &biz.ProductionMaterialIssueFromOrderCreate{
		FactNo: "PF-HISTORICAL-NO-SNAPSHOT", ProductionOrderID: historical.Order.ID,
		ProductionOrderItemID: historical.Items[0].ID, ProductionOrderMaterialRequirementID: wrongRequirement.ID,
		WarehouseID: createTestWarehouse(t, ctx, f.client, "PO-HISTORICAL-WH").ID,
		Quantity:    decimal.NewFromInt(1), IdempotencyKey: "pf-historical-no-snapshot",
	}); !errors.Is(err, biz.ErrProductionOrderMaterialRequirementsNeedReview) {
		t.Fatalf("historical incomplete material requirement error=%v", err)
	}
}

func TestProductionMaterialIssueFromOrderLifecycleDerivesSourceAndReversesInventory(t *testing.T) {
	ctx := context.Background()
	f, warehouseID, lotID, factUC := openProductionMaterialIssueFixture(t, "production_material_issue_lifecycle")
	released := createAndReleaseProductionMaterialIssueOrder(t, ctx, f, "MO-MATERIAL-ISSUE", "material-issue")
	requirement := released.MaterialRequirements[0]
	firstInput := productionMaterialIssueInput(
		"PF-MATERIAL-ISSUE-1", "pf-material-issue-1", released.Order.ID, released.Items[0].ID, requirement.ID,
		warehouseID, lotID, decimal.NewFromInt(12),
	)
	first, err := factUC.CreateProductionMaterialIssueFromOrder(ctx, firstInput)
	if err != nil {
		t.Fatalf("create first material issue: %v", err)
	}
	assertProductionMaterialIssueDerivedSource(t, first, f.materialID, f.unitID, released.Order.ID, requirement.ID)
	replayed, err := factUC.CreateProductionMaterialIssueFromOrder(ctx, firstInput)
	if err != nil || replayed.ID != first.ID {
		t.Fatalf("material issue replay=%#v err=%v", replayed, err)
	}
	changed := *firstInput
	changed.Quantity = decimal.NewFromInt(11)
	if _, err := factUC.CreateProductionMaterialIssueFromOrder(ctx, &changed); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed material issue replay error=%v", err)
	}

	second, err := factUC.CreateProductionMaterialIssueFromOrder(ctx, productionMaterialIssueInput(
		"PF-MATERIAL-ISSUE-2", "pf-material-issue-2", released.Order.ID, released.Items[0].ID, requirement.ID,
		warehouseID, lotID, decimal.NewFromInt(11),
	))
	if err != nil {
		t.Fatalf("create second material issue draft: %v", err)
	}
	if _, err := factUC.PostProductionFact(ctx, first.ID); err != nil {
		t.Fatalf("post first material issue: %v", err)
	}
	assertProductionMaterialBalance(t, ctx, f, warehouseID, lotID, decimal.NewFromInt(18))
	requirements, err := factUC.ListProductionOrderMaterialRequirements(ctx, released.Order.ID)
	if err != nil || len(requirements) != 1 || !requirements[0].IssuedQuantity.Equal(decimal.NewFromInt(12)) || !requirements[0].RemainingQuantity.Equal(decimal.NewFromInt(10)) {
		t.Fatalf("material requirements after post=%#v err=%v", requirements, err)
	}
	if _, err := factUC.PostProductionFact(ctx, second.ID); !errors.Is(err, biz.ErrProductionOrderMaterialIssueQuantityExceeded) {
		t.Fatalf("over-limit material issue post error=%v", err)
	}
	if count := f.client.InventoryTxn.Query().Where(
		inventorytxn.SourceType(biz.ProductionFactSourceType), inventorytxn.SourceID(second.ID),
	).CountX(ctx); count != 0 {
		t.Fatalf("failed over-limit post wrote %d inventory transactions", count)
	}
	if row := f.client.ProductionFact.GetX(ctx, second.ID); row.Status != biz.OperationalFactStatusDraft {
		t.Fatalf("failed over-limit post changed status=%s", row.Status)
	}

	if _, err := factUC.CancelPostedProductionFact(ctx, first.ID); err != nil {
		t.Fatalf("cancel first material issue: %v", err)
	}
	assertProductionMaterialBalance(t, ctx, f, warehouseID, lotID, decimal.NewFromInt(30))
	if _, err := factUC.PostProductionFact(ctx, second.ID); err != nil {
		t.Fatalf("post second after reversal: %v", err)
	}
	assertProductionMaterialBalance(t, ctx, f, warehouseID, lotID, decimal.NewFromInt(19))
	aggregate, err := f.uc.Get(ctx, released.Order.ID)
	if err != nil || len(aggregate.MaterialRequirements) != 1 || !aggregate.MaterialRequirements[0].IssuedQuantity.Equal(decimal.NewFromInt(11)) {
		t.Fatalf("aggregate issued projection=%#v err=%v", aggregate, err)
	}
	if _, err := factUC.CancelPostedProductionFact(ctx, second.ID); err != nil {
		t.Fatalf("cancel second material issue: %v", err)
	}
	assertProductionMaterialBalance(t, ctx, f, warehouseID, lotID, decimal.NewFromInt(30))
	finalRequirements, err := factUC.ListProductionOrderMaterialRequirements(ctx, released.Order.ID)
	if err != nil || len(finalRequirements) != 1 || !finalRequirements[0].IssuedQuantity.IsZero() || !finalRequirements[0].RemainingQuantity.Equal(decimal.NewFromInt(22)) {
		t.Fatalf("material requirements after all reversals=%#v err=%v", finalRequirements, err)
	}
}

func TestProductionMaterialIssueSQLiteConcurrentPostDoesNotExceedRequirement(t *testing.T) {
	ctx := context.Background()
	f, warehouseID, lotID, factUC := openProductionMaterialIssueFixture(t, "production_material_issue_sqlite_concurrency")
	released := createAndReleaseProductionMaterialIssueOrder(t, ctx, f, "MO-MATERIAL-CONCURRENT", "material-concurrent")
	requirement := released.MaterialRequirements[0]
	facts := make([]*biz.ProductionFact, 2)
	for index := range facts {
		fact, err := factUC.CreateProductionMaterialIssueFromOrder(ctx, productionMaterialIssueInput(
			"PF-MATERIAL-CONCURRENT-"+string(rune('A'+index)),
			"pf-material-concurrent-"+string(rune('a'+index)),
			released.Order.ID, released.Items[0].ID, requirement.ID, warehouseID, lotID, decimal.NewFromInt(12),
		))
		if err != nil {
			t.Fatalf("create concurrent material issue %d: %v", index, err)
		}
		facts[index] = fact
	}

	start := make(chan struct{})
	errs := make(chan error, len(facts))
	var wg sync.WaitGroup
	for _, fact := range facts {
		fact := fact
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			_, err := factUC.PostProductionFact(ctx, fact.ID)
			errs <- err
		}()
	}
	close(start)
	wg.Wait()
	close(errs)
	assertOneProductionMaterialIssuePostWinner(t, errs)
	if count := f.client.ProductionFact.Query().Where(
		productionfact.SourceID(released.Order.ID),
		productionfact.FactType(biz.ProductionFactMaterialIssue),
		productionfact.Status(biz.OperationalFactStatusPosted),
	).CountX(ctx); count != 1 {
		t.Fatalf("posted material issue count=%d, want 1", count)
	}
	assertProductionMaterialBalance(t, ctx, f, warehouseID, lotID, decimal.NewFromInt(18))
}

func openProductionMaterialIssueFixture(
	t *testing.T,
	name string,
) (productionOrderTestFixture, int, int, *biz.OperationalFactUsecase) {
	t.Helper()
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, name)
	logger := log.NewStdLogger(io.Discard)
	warehouse := createTestWarehouse(t, ctx, f.client, name+"-WH")
	inventoryUC := biz.NewInventoryUsecase(NewInventoryRepo(f.data, logger))
	lot := createTestInventoryLot(t, ctx, inventoryUC, biz.InventorySubjectMaterial, f.materialID, name+"-LOT")
	if _, err := inventoryUC.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType: biz.InventorySubjectMaterial, SubjectID: f.materialID,
		WarehouseID: warehouse.ID, LotID: &lot.ID, UnitID: f.unitID,
		TxnType: biz.InventoryTxnIn, Direction: 1, Quantity: decimal.NewFromInt(30),
		SourceType: "TEST_PRODUCTION_MATERIAL_ISSUE", IdempotencyKey: name + "-opening",
		OccurredAt: time.Date(2026, 7, 14, 8, 0, 0, 0, time.UTC),
	}); err != nil {
		t.Fatalf("seed material inventory: %v", err)
	}
	return f, warehouse.ID, lot.ID, biz.NewOperationalFactUsecase(NewOperationalFactRepo(f.data, logger))
}

func createAndReleaseProductionMaterialIssueOrder(
	t *testing.T,
	ctx context.Context,
	f productionOrderTestFixture,
	orderNo string,
	keyPrefix string,
) *biz.ProductionOrderAggregate {
	t.Helper()
	created, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{
		Draft: f.draft(orderNo, 10), ActorID: f.actorID, IdempotencyKey: keyPrefix + "-create",
	})
	if err != nil {
		t.Fatalf("create production material order: %v", err)
	}
	released, err := f.uc.Release(ctx, &biz.ProductionOrderAction{
		ID: created.Order.ID, ExpectedVersion: 1, ActorID: f.actorID, IdempotencyKey: keyPrefix + "-release",
	})
	if err != nil {
		t.Fatalf("release production material order: %v", err)
	}
	if len(released.Items) != 1 || len(released.MaterialRequirements) != 1 {
		t.Fatalf("released production material aggregate=%#v", released)
	}
	return released
}

func productionMaterialIssueInput(
	factNo string,
	key string,
	orderID int,
	orderItemID int,
	requirementID int,
	warehouseID int,
	lotID int,
	quantity decimal.Decimal,
) *biz.ProductionMaterialIssueFromOrderCreate {
	return &biz.ProductionMaterialIssueFromOrderCreate{
		FactNo: factNo, ProductionOrderID: orderID, ProductionOrderItemID: orderItemID,
		ProductionOrderMaterialRequirementID: requirementID, WarehouseID: warehouseID, LotID: &lotID,
		Quantity: quantity, IdempotencyKey: key,
		OccurredAt: time.Date(2026, 7, 14, 9, 0, 0, 0, time.UTC), OccurredAtSpecified: true,
	}
}

func assertProductionMaterialIssueDerivedSource(
	t *testing.T,
	fact *biz.ProductionFact,
	materialID int,
	unitID int,
	orderID int,
	requirementID int,
) {
	t.Helper()
	if fact == nil || fact.FactType != biz.ProductionFactMaterialIssue || fact.SubjectType != biz.InventorySubjectMaterial ||
		fact.SubjectID != materialID || fact.ProductSkuID != nil || fact.UnitID != unitID ||
		fact.SourceType == nil || *fact.SourceType != biz.ProductionOrderSourceType ||
		fact.SourceID == nil || *fact.SourceID != orderID || fact.SourceLineID == nil || *fact.SourceLineID != requirementID {
		t.Fatalf("production material issue derived source=%#v", fact)
	}
}

func assertProductionMaterialBalance(
	t *testing.T,
	ctx context.Context,
	f productionOrderTestFixture,
	warehouseID int,
	lotID int,
	want decimal.Decimal,
) {
	t.Helper()
	row, err := f.client.InventoryBalance.Query().Where(
		inventorybalance.SubjectType(biz.InventorySubjectMaterial),
		inventorybalance.SubjectID(f.materialID),
		inventorybalance.ProductSkuIDIsNil(),
		inventorybalance.WarehouseID(warehouseID),
		inventorybalance.LotID(lotID),
		inventorybalance.UnitID(f.unitID),
	).Only(ctx)
	if err != nil || !row.Quantity.Equal(want) {
		t.Fatalf("material balance=%#v err=%v, want %s", row, err, want)
	}
}

func assertOneProductionMaterialIssuePostWinner(t *testing.T, errs <-chan error) {
	t.Helper()
	successes := 0
	quantityFailures := 0
	for err := range errs {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, biz.ErrProductionOrderMaterialIssueQuantityExceeded):
			quantityFailures++
		default:
			t.Fatalf("unexpected concurrent production material issue error=%v", err)
		}
	}
	if successes != 1 || quantityFailures != 1 {
		t.Fatalf("concurrent material issue posts successes=%d quantity_failures=%d, want 1/1", successes, quantityFailures)
	}
}
