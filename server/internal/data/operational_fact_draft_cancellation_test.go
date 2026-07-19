package data

import (
	"context"
	"errors"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/financefact"
	"server/internal/data/model/ent/inventorytxn"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestProductionOrderLinkedDraftFactsCancelWithoutInventory(t *testing.T) {
	ctx := context.Background()

	t.Run("finished goods receipt", func(t *testing.T) {
		f := openProductionOrderRepoTest(t, "production_completion_draft_cancel")
		created, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{
			Draft: f.draft("MO-COMPLETION-DRAFT-CANCEL", 2), ActorID: f.actorID, IdempotencyKey: "mo-completion-draft-cancel-create",
		})
		if err != nil {
			t.Fatal(err)
		}
		released, err := f.uc.Release(ctx, &biz.ProductionOrderAction{ID: created.Order.ID, ExpectedVersion: 1, ActorID: f.actorID, IdempotencyKey: "mo-completion-draft-cancel-release"})
		if err != nil {
			t.Fatal(err)
		}
		completeProductionSchedulingTaskForTest(t, ctx, f.data, f.client, released.Order.ID, f.actorID)
		warehouse := createTestWarehouse(t, ctx, f.client, "completion-draft-cancel-wh")
		lotNo := "completion-draft-cancel-lot"
		factUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(f.data, log.NewStdLogger(io.Discard)))
		fact, err := factUC.CreateProductionCompletionFromOrder(ctx, &biz.ProductionCompletionFromOrderCreate{
			FactNo: "PF-COMPLETION-DRAFT-CANCEL", ProductionOrderID: released.Order.ID,
			ProductionOrderItemID: released.Items[0].ID, WarehouseID: warehouse.ID, NewLotNo: &lotNo,
			Quantity: decimal.NewFromInt(1), IdempotencyKey: "pf-completion-draft-cancel",
		})
		if err != nil {
			t.Fatal(err)
		}
		cancelled, err := factUC.CancelPostedProductionFact(ctx, fact.ID)
		if err != nil || cancelled.Status != biz.OperationalFactStatusCancelled || cancelled.PostedAt != nil {
			t.Fatalf("draft completion cancel=%#v err=%v", cancelled, err)
		}
		assertOperationalFactHasZeroInventoryTxns(t, ctx, f.client, biz.ProductionFactSourceType, fact.ID)
		closeReason := "草稿事实已撤销"
		closed, err := f.uc.Close(ctx, &biz.ProductionOrderAction{ID: released.Order.ID, ExpectedVersion: 2, ActorID: f.actorID, IdempotencyKey: "mo-completion-draft-cancel-close", Reason: &closeReason})
		if err != nil || closed.Order.Status != biz.ProductionOrderStatusClosed {
			t.Fatalf("close after draft completion cancel=%#v err=%v", closed, err)
		}
	})

	t.Run("material issue", func(t *testing.T) {
		f, warehouseID, lotID, factUC := openProductionMaterialIssueFixture(t, "production_material_draft_cancel")
		released := createAndReleaseProductionMaterialIssueOrder(t, ctx, f, "MO-MATERIAL-DRAFT-CANCEL", "material-draft-cancel")
		fact, err := factUC.CreateProductionMaterialIssueFromOrder(ctx, productionMaterialIssueInput(
			"PF-MATERIAL-DRAFT-CANCEL", "pf-material-draft-cancel", released.Order.ID, released.Items[0].ID,
			released.MaterialRequirements[0].ID, warehouseID, lotID, decimal.NewFromInt(5),
		))
		if err != nil {
			t.Fatal(err)
		}
		cancelled, err := factUC.CancelPostedProductionFact(ctx, fact.ID)
		if err != nil || cancelled.Status != biz.OperationalFactStatusCancelled || cancelled.PostedAt != nil {
			t.Fatalf("draft material issue cancel=%#v err=%v", cancelled, err)
		}
		assertOperationalFactHasZeroInventoryTxns(t, ctx, f.client, biz.ProductionFactSourceType, fact.ID)
		assertProductionMaterialBalance(t, ctx, f, warehouseID, lotID, decimal.NewFromInt(30))
		completeProductionSchedulingTaskForTest(t, ctx, f.data, f.client, released.Order.ID, f.actorID)
		cancelReason := "领料草稿事实已撤销"
		cancelledOrder, err := f.uc.Cancel(ctx, &biz.ProductionOrderAction{
			ID: released.Order.ID, ExpectedVersion: 2, ActorID: f.actorID,
			IdempotencyKey: "mo-material-draft-cancel-parent", Reason: &cancelReason,
		})
		if err != nil || cancelledOrder.Order.Status != biz.ProductionOrderStatusCancelled {
			t.Fatalf("cancel parent after draft material issue cancellation=%#v err=%v", cancelledOrder, err)
		}
	})
}

func TestOutsourcingOrderLinkedDraftFactsCancelWithoutInventoryAndReleaseParent(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "outsourcing_draft_fact_cancel")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	source := createOutsourcingFactSourceFixture(t, ctx, client, fixtures, "DRAFT-CANCEL", decimal.NewFromInt(4))
	logger := log.NewStdLogger(io.Discard)
	factUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger))
	orderRepo := NewOutsourcingOrderRepo(data, logger)

	issue, err := factUC.CreateOutsourcingMaterialIssueFromOrder(ctx, &biz.OutsourcingFactFromOrderCreate{
		FactNo: "OUT-ISSUE-DRAFT-CANCEL", OutsourcingOrderID: source.order.ID, OutsourcingOrderItemID: source.materialLine.ID,
		WarehouseID: fixtures.warehouseID, Quantity: decimal.NewFromInt(2), IdempotencyKey: "out-issue-draft-cancel",
	})
	if err != nil {
		t.Fatal(err)
	}
	lotNo := "out-return-draft-cancel-lot"
	returned, err := factUC.CreateOutsourcingReturnReceiptFromOrder(ctx, &biz.OutsourcingFactFromOrderCreate{
		FactNo: "OUT-RETURN-DRAFT-CANCEL", OutsourcingOrderID: source.order.ID, OutsourcingOrderItemID: source.productLine.ID,
		WarehouseID: fixtures.warehouseID, NewLotNo: &lotNo, Quantity: decimal.NewFromInt(2), IdempotencyKey: "out-return-draft-cancel",
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, fact := range []*biz.OutsourcingFact{issue, returned} {
		cancelled, cancelErr := factUC.CancelPostedOutsourcingFact(ctx, fact.ID)
		if cancelErr != nil || cancelled.Status != biz.OperationalFactStatusCancelled || cancelled.PostedAt != nil {
			t.Fatalf("cancel draft outsourcing fact=%#v err=%v", cancelled, cancelErr)
		}
		assertOperationalFactHasZeroInventoryTxns(t, ctx, client, biz.OutsourcingFactSourceType, fact.ID)
	}
	closed, err := orderRepo.UpdateOutsourcingOrderLifecycle(ctx, source.order.ID, biz.OutsourcingOrderStatusClosed)
	if err != nil || closed.LifecycleStatus != biz.OutsourcingOrderStatusClosed {
		t.Fatalf("close outsourcing parent after draft cancellations=%#v err=%v", closed, err)
	}

	cancelSource := createOutsourcingFactSourceFixture(t, ctx, client, fixtures, "DRAFT-CANCEL-PARENT", decimal.NewFromInt(2))
	cancelIssue, err := factUC.CreateOutsourcingMaterialIssueFromOrder(ctx, &biz.OutsourcingFactFromOrderCreate{
		FactNo: "OUT-ISSUE-DRAFT-CANCEL-PARENT", OutsourcingOrderID: cancelSource.order.ID,
		OutsourcingOrderItemID: cancelSource.materialLine.ID, WarehouseID: fixtures.warehouseID,
		Quantity: decimal.NewFromInt(1), IdempotencyKey: "out-issue-draft-cancel-parent",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := factUC.CancelPostedOutsourcingFact(ctx, cancelIssue.ID); err != nil {
		t.Fatalf("cancel draft outsourcing issue before parent cancellation: %v", err)
	}
	cancelledParent, err := orderRepo.UpdateOutsourcingOrderLifecycle(ctx, cancelSource.order.ID, biz.OutsourcingOrderStatusCanceled)
	if err != nil || cancelledParent.LifecycleStatus != biz.OutsourcingOrderStatusCanceled {
		t.Fatalf("cancel outsourcing parent after draft cancellation=%#v err=%v", cancelledParent, err)
	}
}

func TestDraftOutsourcingReturnCancellationBlocksActiveQualityAndFinance(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "outsourcing_draft_cancel_dependencies")
	fixtures := createInventoryTestFixtures(t, ctx, client)
	source := createOutsourcingFactSourceFixture(t, ctx, client, fixtures, "DRAFT-DEPENDENCY", decimal.NewFromInt(3))
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	uc := biz.NewOperationalFactUsecase(repo)
	lotNo := "out-draft-dependency-lot"
	fact, err := uc.CreateOutsourcingReturnReceiptFromOrder(ctx, &biz.OutsourcingFactFromOrderCreate{
		FactNo: "OUT-DRAFT-DEPENDENCY", OutsourcingOrderID: source.order.ID, OutsourcingOrderItemID: source.productLine.ID,
		WarehouseID: fixtures.warehouseID, NewLotNo: &lotNo, Quantity: decimal.NewFromInt(1), IdempotencyKey: "out-draft-dependency",
	})
	if err != nil {
		t.Fatal(err)
	}
	inspection := client.QualityInspection.Create().SetInspectionNo("QI-OUT-DRAFT-DEPENDENCY").SetStatus(biz.QualityInspectionStatusDraft).
		SetInspectionType(biz.QualityInspectionTypeOutsourcingReturn).SetSubjectType(biz.QualityInspectionSubjectProduct).
		SetSubjectID(fixtures.productID).SetInventoryLotID(*fact.LotID).SetWarehouseID(fixtures.warehouseID).
		SetSourceType(biz.QualityInspectionSourceOutsourcingFact).SetSourceID(fact.ID).SaveX(ctx)
	actor := client.AdminUser.Create().SetUsername("out-draft-dependency-actor").SetPasswordHash("test-password-hash").SaveX(ctx)
	supplierID := source.order.SupplierID
	finance := client.FinanceFact.Create().SetFactNo("FIN-OUT-DRAFT-DEPENDENCY").SetFactType(biz.FinanceFactPayable).
		SetStatus(biz.OperationalFactStatusDraft).SetCounterpartyType(biz.FinanceCounterpartySupplier).SetCounterpartyID(supplierID).
		SetAmount(decimal.NewFromInt(1)).SetFeeAmount(decimal.Zero).SetCurrency(biz.FinanceCurrencyCNY).
		SetSourceType(biz.OutsourcingFactSourceType).SetSourceID(fact.ID).SetIdempotencyKey("fin-out-draft-dependency").SaveX(ctx)
	if _, err := uc.CancelPostedOutsourcingFact(ctx, fact.ID); !errors.Is(err, biz.ErrOutsourcingReturnQualityDependency) {
		t.Fatalf("active quality dependency error=%v", err)
	}
	inventoryUC := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
	if _, err := inventoryUC.CancelQualityInspection(ctx, inspection.ID, nil); err != nil {
		t.Fatalf("cancel dependent quality inspection: %v", err)
	}
	if _, err := uc.CancelPostedOutsourcingFact(ctx, fact.ID); !errors.Is(err, biz.ErrOutsourcingReturnFinanceDependency) {
		t.Fatalf("active finance dependency error=%v", err)
	}
	if _, err := repo.CancelPostedFinanceFact(ctx, finance.ID, actor.ID, "撤销未确认委外应付"); err != nil {
		t.Fatalf("cancel draft payable dependency: %v", err)
	}
	if _, err := uc.CancelPostedOutsourcingFact(ctx, fact.ID); err != nil {
		t.Fatalf("cancel return after dependencies terminated: %v", err)
	}
}

func TestDraftOperationalFactCancellationRejectsMalformedSourceCoordinates(t *testing.T) {
	ctx := context.Background()

	t.Run("production", func(t *testing.T) {
		f := openProductionOrderRepoTest(t, "production_draft_cancel_wrong_source")
		created, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{
			Draft: f.draft("MO-DRAFT-CANCEL-WRONG-SOURCE", 2), ActorID: f.actorID,
			IdempotencyKey: "mo-draft-cancel-wrong-source-create",
		})
		if err != nil {
			t.Fatal(err)
		}
		released, err := f.uc.Release(ctx, &biz.ProductionOrderAction{
			ID: created.Order.ID, ExpectedVersion: 1, ActorID: f.actorID,
			IdempotencyKey: "mo-draft-cancel-wrong-source-release",
		})
		if err != nil {
			t.Fatal(err)
		}
		warehouse := createTestWarehouse(t, ctx, f.client, "draft-cancel-wrong-source-wh")
		lotNo := "draft-cancel-wrong-source-lot"
		uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(f.data, log.NewStdLogger(io.Discard)))
		fact, err := uc.CreateProductionCompletionFromOrder(ctx, &biz.ProductionCompletionFromOrderCreate{
			FactNo: "PF-DRAFT-CANCEL-WRONG-SOURCE", ProductionOrderID: released.Order.ID,
			ProductionOrderItemID: released.Items[0].ID, WarehouseID: warehouse.ID, NewLotNo: &lotNo,
			Quantity: decimal.NewFromInt(1), IdempotencyKey: "pf-draft-cancel-wrong-source",
		})
		if err != nil {
			t.Fatal(err)
		}
		if _, err := f.data.sqldb.ExecContext(ctx, "UPDATE production_facts SET source_line_id = ? WHERE id = ?", released.Items[0].ID+999999, fact.ID); err != nil {
			t.Fatalf("corrupt production source coordinate: %v", err)
		}
		if _, err := uc.CancelPostedProductionFact(ctx, fact.ID); !errors.Is(err, biz.ErrProductionOrderFactSourceInvalid) {
			t.Fatalf("malformed production source cancellation error=%v", err)
		}
		assertOperationalFactHasZeroInventoryTxns(t, ctx, f.client, biz.ProductionFactSourceType, fact.ID)
	})

	t.Run("outsourcing", func(t *testing.T) {
		data, client := openInventoryRepoTestData(t, "outsourcing_draft_cancel_wrong_source")
		fixtures := createInventoryTestFixtures(t, ctx, client)
		source := createOutsourcingFactSourceFixture(t, ctx, client, fixtures, "DRAFT-CANCEL-WRONG-SOURCE", decimal.NewFromInt(2))
		uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))
		fact, err := uc.CreateOutsourcingMaterialIssueFromOrder(ctx, &biz.OutsourcingFactFromOrderCreate{
			FactNo: "OUT-DRAFT-CANCEL-WRONG-SOURCE", OutsourcingOrderID: source.order.ID,
			OutsourcingOrderItemID: source.materialLine.ID, WarehouseID: fixtures.warehouseID,
			Quantity: decimal.NewFromInt(1), IdempotencyKey: "out-draft-cancel-wrong-source",
		})
		if err != nil {
			t.Fatal(err)
		}
		if _, err := data.sqldb.ExecContext(ctx, "UPDATE outsourcing_facts SET source_line_id = ? WHERE id = ?", source.productLine.ID, fact.ID); err != nil {
			t.Fatalf("corrupt outsourcing source coordinate: %v", err)
		}
		if _, err := uc.CancelPostedOutsourcingFact(ctx, fact.ID); !errors.Is(err, biz.ErrOutsourcingOrderFactSourceInvalid) {
			t.Fatalf("malformed outsourcing source cancellation error=%v", err)
		}
		assertOperationalFactHasZeroInventoryTxns(t, ctx, client, biz.OutsourcingFactSourceType, fact.ID)
	})
}

func TestFormalSourceFinanceDraftCancellationAuditsAndReplaysExactly(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryRepoTestData(t, "finance_source_draft_cancel")
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	actor := client.AdminUser.Create().SetUsername("finance-source-draft-cancel").SetPasswordHash("test-password-hash").SaveX(ctx)
	otherActor := client.AdminUser.Create().SetUsername("finance-source-draft-cancel-other").SetPasswordHash("test-password-hash").SaveX(ctx)
	beforeTxns := client.InventoryTxn.Query().CountX(ctx)
	firstCancelledID := 0

	types := []struct{ factType, sourceType, counterpartyType string }{
		{biz.FinanceFactReceivable, biz.ShipmentSourceType, biz.FinanceCounterpartyCustomer},
		{biz.FinanceFactInvoice, biz.ShipmentSourceType, biz.FinanceCounterpartyCustomer},
		{biz.FinanceFactPayable, biz.PurchaseReceiptSourceType, biz.FinanceCounterpartySupplier},
		{biz.FinanceFactPayable, biz.OutsourcingFactSourceType, biz.FinanceCounterpartySupplier},
		{biz.FinanceFactReconciliation, biz.FinanceFactSourceType, biz.FinanceCounterpartyCustomer},
	}
	for index, test := range types {
		row := client.FinanceFact.Create().SetFactNo("FIN-DRAFT-CANCEL-" + test.factType + "-" + test.sourceType).
			SetFactType(test.factType).SetStatus(biz.OperationalFactStatusDraft).SetCounterpartyType(test.counterpartyType).
			SetAmount(decimal.NewFromInt(1)).SetFeeAmount(decimal.Zero).SetCurrency(biz.FinanceCurrencyCNY).
			SetSourceType(test.sourceType).SetSourceID(1000 + index).SetIdempotencyKey("fin-draft-cancel-" + test.factType + "-" + test.sourceType).SaveX(ctx)
		cancelled, err := repo.CancelPostedFinanceFact(ctx, row.ID, actor.ID, "来源草稿作废")
		if err != nil || cancelled.Status != biz.OperationalFactStatusCancelled || cancelled.PostedAt != nil || cancelled.SettledAt != nil ||
			cancelled.CancelledAt == nil || cancelled.CancelledBy == nil || *cancelled.CancelledBy != actor.ID || cancelled.CancelReason == nil {
			t.Fatalf("finance draft cancellation=%#v err=%v", cancelled, err)
		}
		replay, err := repo.CancelPostedFinanceFact(ctx, row.ID, actor.ID, "来源草稿作废")
		if err != nil || replay.CancelledAt == nil || !replay.CancelledAt.Equal(*cancelled.CancelledAt) {
			t.Fatalf("finance draft cancellation replay=%#v err=%v", replay, err)
		}
		if _, err := repo.CancelPostedFinanceFact(ctx, row.ID, actor.ID, "改写原因"); !errors.Is(err, biz.ErrIdempotencyConflict) {
			t.Fatalf("changed finance draft cancel intent error=%v", err)
		}
		if firstCancelledID == 0 {
			firstCancelledID = row.ID
		}
	}
	if _, err := repo.CancelPostedFinanceFact(ctx, firstCancelledID, otherActor.ID, "来源草稿作废"); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed finance draft cancel actor error=%v", err)
	}
	manual := client.FinanceFact.Create().SetFactNo("FIN-MANUAL-DRAFT-NO-CANCEL").SetFactType(biz.FinanceFactPayable).
		SetStatus(biz.OperationalFactStatusDraft).SetCounterpartyType(biz.FinanceCounterpartySupplier).
		SetAmount(decimal.NewFromInt(1)).SetFeeAmount(decimal.Zero).SetCurrency(biz.FinanceCurrencyCNY).
		SetIdempotencyKey("fin-manual-draft-no-cancel").SaveX(ctx)
	if _, err := repo.CancelPostedFinanceFact(ctx, manual.ID, actor.ID, "手工草稿不得走来源作废"); !errors.Is(err, biz.ErrFinanceFactSourceInvalid) {
		t.Fatalf("manual finance draft cancellation error=%v", err)
	}
	assertFinanceFactHasNoCancelAudit(t, ctx, client, manual.ID, biz.OperationalFactStatusDraft)
	if got := client.InventoryTxn.Query().CountX(ctx); got != beforeTxns {
		t.Fatalf("finance draft cancellations wrote inventory transactions: before=%d after=%d", beforeTxns, got)
	}

	source := client.FinanceFact.Create().SetFactNo("FIN-DRAFT-WITH-RECON").SetFactType(biz.FinanceFactPayable).
		SetStatus(biz.OperationalFactStatusDraft).SetCounterpartyType(biz.FinanceCounterpartySupplier).
		SetAmount(decimal.NewFromInt(1)).SetFeeAmount(decimal.Zero).SetCurrency(biz.FinanceCurrencyCNY).
		SetSourceType(biz.PurchaseReceiptSourceType).SetSourceID(9999).SetIdempotencyKey("fin-draft-with-recon").SaveX(ctx)
	child := client.FinanceFact.Create().SetFactNo("FIN-DRAFT-RECON-CHILD").SetFactType(biz.FinanceFactReconciliation).
		SetStatus(biz.OperationalFactStatusDraft).SetCounterpartyType(biz.FinanceCounterpartySupplier).
		SetAmount(decimal.NewFromInt(1)).SetFeeAmount(decimal.Zero).SetCurrency(biz.FinanceCurrencyCNY).
		SetSourceType(biz.FinanceFactSourceType).SetSourceID(source.ID).SetIdempotencyKey("fin-draft-recon-child").SaveX(ctx)
	if _, err := repo.CancelPostedFinanceFact(ctx, source.ID, actor.ID, "有核对记录"); !errors.Is(err, biz.ErrFinanceReconciliationDependency) {
		t.Fatalf("active reconciliation dependency error=%v", err)
	}
	if _, err := repo.CancelPostedFinanceFact(ctx, child.ID, actor.ID, "撤销核对草稿"); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.CancelPostedFinanceFact(ctx, source.ID, actor.ID, "有核对记录"); err != nil {
		t.Fatal(err)
	}
	if active := client.FinanceFact.Query().Where(financefact.SourceType(biz.FinanceFactSourceType), financefact.SourceID(source.ID), financefact.StatusNEQ(biz.OperationalFactStatusCancelled)).CountX(ctx); active != 0 {
		t.Fatalf("active reconciliation count=%d", active)
	}
}

func assertOperationalFactHasZeroInventoryTxns(t *testing.T, ctx context.Context, client *ent.Client, sourceType string, sourceID int) {
	t.Helper()
	if count := client.InventoryTxn.Query().Where(inventorytxn.SourceType(sourceType), inventorytxn.SourceID(sourceID)).CountX(ctx); count != 0 {
		t.Fatalf("draft cancellation source %s/%d wrote %d inventory transactions", sourceType, sourceID, count)
	}
}
