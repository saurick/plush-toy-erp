package data

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sync"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/inventorybalance"
	"server/internal/data/model/ent/inventorylot"
	"server/internal/data/model/ent/inventorytxn"
	"server/internal/data/model/ent/purchasereceipt"
	"server/internal/data/model/ent/purchasereceiptitem"
	"server/internal/data/model/ent/qualityinspection"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestFinanceProcessCommandPostgresRecoversExactResultAndMarksCompensation(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	actor := client.AdminUser.Create().SetUsername("finance-cancel-actor-" + postgresTestSuffix()).SetPasswordHash("test-password-hash").SaveX(ctx)
	processRepo := NewProcessRuntimeRepo(data, log.NewStdLogger(io.Discard))
	factRepo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	suffix := postgresTestSuffix()
	payload := map[string]any{"source": "shipment", "amount": "128.88"}
	command := claimedPostgresProcessCommand(t, ctx, processRepo, "finance.receivable_lead", "finance-result/"+suffix, payload)
	occurredAt := time.Now().UTC().Truncate(time.Microsecond)
	collectionType := biz.FinanceCollectionAccountsReceivable
	factIn := &biz.FinanceFactCreate{
		FactNo:              "AR-ATOMIC-" + suffix,
		FactType:            biz.FinanceFactReceivable,
		CounterpartyType:    biz.FinanceCounterpartyOther,
		Amount:              decimal.RequireFromString("128.88"),
		Currency:            "CNY",
		CollectionType:      &collectionType,
		IdempotencyKey:      "finance-result/" + suffix,
		OccurredAt:          occurredAt,
		OccurredAtSpecified: true,
	}

	// Simulate the historical crash window: the exact domain fact committed but
	// the process node result was not written.
	created, err := factRepo.CreateFinanceFactDraft(ctx, factIn)
	if err != nil {
		t.Fatalf("create historical finance side effect: %v", err)
	}
	recovered, err := factRepo.CreateFinanceFactDraftForProcessCommand(ctx, factIn, command, 7)
	if err != nil {
		t.Fatalf("recover exact finance command result: %v", err)
	}
	if recovered.ID != created.ID {
		t.Fatalf("exact recovery must reuse finance fact %d, got %d", created.ID, recovered.ID)
	}
	assertPostgresProcessEffect(t, ctx, processRepo, command.Node.ID, biz.ProcessDomainCommandEffectStateApplied, "finance_fact", created.ID)
	if replay, err := factRepo.CreateFinanceFactDraftForProcessCommand(ctx, factIn, command, 7); err != nil || replay.ID != created.ID {
		t.Fatalf("same finance command replay must return original result, replay=%#v err=%v", replay, err)
	}
	changed := *factIn
	changed.Amount = decimal.RequireFromString("129.88")
	if _, err := factRepo.CreateFinanceFactDraftForProcessCommand(ctx, &changed, command, 7); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("changed finance payload must conflict, got %v", err)
	}
	if _, err := factRepo.PostFinanceFact(ctx, created.ID); err != nil {
		t.Fatalf("post finance fact before cancellation: %v", err)
	}
	if _, err := factRepo.CancelPostedFinanceFact(ctx, created.ID, actor.ID, "测试取消应收线索"); err != nil {
		t.Fatalf("cancel finance fact: %v", err)
	}
	assertPostgresProcessEffect(t, ctx, processRepo, command.Node.ID, biz.ProcessDomainCommandEffectStateCompensated, "finance_fact", created.ID)
	_ = client
}

func TestFinanceProcessCommandPostgresRejectsCancelledFactBeforeExactRecovery(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	actor := client.AdminUser.Create().SetUsername("finance-cancelled-recovery-actor-" + postgresTestSuffix()).SetPasswordHash("test-password-hash").SaveX(ctx)
	processRepo := NewProcessRuntimeRepo(data, log.NewStdLogger(io.Discard))
	factRepo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	suffix := postgresTestSuffix()
	idempotencyKey := "finance-cancelled-recovery/" + suffix
	collectionType := biz.FinanceCollectionAccountsReceivable
	factIn := &biz.FinanceFactCreate{
		FactNo:              "AR-CANCELLED-RECOVERY-" + suffix,
		FactType:            biz.FinanceFactReceivable,
		CounterpartyType:    biz.FinanceCounterpartyOther,
		Amount:              decimal.RequireFromString("256.88"),
		Currency:            "CNY",
		CollectionType:      &collectionType,
		IdempotencyKey:      idempotencyKey,
		OccurredAt:          time.Now().UTC().Truncate(time.Microsecond),
		OccurredAtSpecified: true,
	}

	created, err := factRepo.CreateFinanceFactDraft(ctx, factIn)
	if err != nil {
		t.Fatalf("create finance fact before cancelled recovery: %v", err)
	}
	if _, err := factRepo.PostFinanceFact(ctx, created.ID); err != nil {
		t.Fatalf("post finance fact before cancelled recovery: %v", err)
	}
	cancelled, err := factRepo.CancelPostedFinanceFact(ctx, created.ID, actor.ID, "测试取消后恢复")
	if err != nil {
		t.Fatalf("cancel finance fact before exact recovery: %v", err)
	}
	if cancelled.Status != biz.OperationalFactStatusCancelled {
		t.Fatalf("finance fact status=%s, want CANCELLED", cancelled.Status)
	}
	ordinaryReplay, err := factRepo.CreateFinanceFactDraft(ctx, factIn)
	if err != nil || ordinaryReplay.ID != created.ID || ordinaryReplay.Status != biz.OperationalFactStatusCancelled {
		t.Fatalf("ordinary create replay must preserve cancelled fact semantics, replay=%#v err=%v", ordinaryReplay, err)
	}

	if err := factRepo.ValidateFinanceFactCreateReplay(ctx, factIn); !errors.Is(err, biz.ErrProcessDomainCommandRecoveryRequired) {
		t.Fatalf("cancelled finance preflight must require explicit recovery, got %v", err)
	}
	command := claimedPostgresProcessCommand(
		t, ctx, processRepo, biz.ProcessDomainCommandFinanceReceivableLead,
		idempotencyKey, map[string]any{"source": "shipment", "amount": "256.88"},
	)
	if _, err := factRepo.CreateFinanceFactDraftForProcessCommand(ctx, factIn, command, 7); !errors.Is(err, biz.ErrProcessDomainCommandRecoveryRequired) {
		t.Fatalf("cancelled finance fact must not be rebound as applied, got %v", err)
	}
	node, err := processRepo.GetProcessNodeInstance(ctx, command.Node.ID)
	if err != nil {
		t.Fatalf("read cancelled finance recovery node: %v", err)
	}
	if node.DomainCommandResultHash != nil || node.DomainCommandEffectState != nil ||
		node.DomainCommandEffectRefType != nil || node.DomainCommandEffectRefID != nil {
		t.Fatalf("cancelled finance fact must not record applied result, node=%#v", node)
	}
	row, err := client.FinanceFact.Get(ctx, created.ID)
	if err != nil || row.Status != biz.OperationalFactStatusCancelled {
		t.Fatalf("cancelled finance fact must remain cancelled, row=%#v err=%v", row, err)
	}
}

func TestSalesProcessCommandPostgresRollsBackOnResultConflictAndFailsClosedForLegacyMissingResult(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	logger := log.NewStdLogger(io.Discard)
	processRepo := NewProcessRuntimeRepo(data, logger)
	salesRepo := NewSalesOrderRepo(data, logger)
	suffix := postgresTestSuffix()
	customer, err := client.Customer.Create().SetCode("C-ATOMIC-" + suffix).SetName("Atomic Customer " + suffix).Save(ctx)
	if err != nil {
		t.Fatalf("create sales customer: %v", err)
	}
	createOrder := func(label string) *biz.SalesOrder {
		row, createErr := salesRepo.CreateSalesOrder(ctx, &biz.SalesOrderMutation{
			OrderNo: "SO-ATOMIC-" + label + "-" + suffix, CustomerID: customer.ID,
			CustomerSnapshot: map[string]any{"name": customer.Name}, ContactSnapshot: map[string]any{}, OrderDate: time.Now(),
		})
		if createErr != nil {
			t.Fatalf("create sales order %s: %v", label, createErr)
		}
		return row
	}
	successOrder := createOrder("SUCCESS")
	successPayload := map[string]any{"sales_order_id": successOrder.ID}
	successCommand := claimedPostgresProcessCommand(t, ctx, processRepo, biz.ProcessDomainCommandSalesOrderSubmit, "sales-success/"+suffix, successPayload)
	successResult := &biz.ProcessDomainCommandResult{
		Outcome: biz.SalesOrderProcessCommandOutcomeSubmitted, EffectState: biz.ProcessDomainCommandEffectStateApplied,
		EffectRef: &biz.ProcessBusinessRef{RefType: "sales_order", RefID: successOrder.ID},
	}
	if _, err := salesRepo.SubmitSalesOrderForProcessCommand(ctx, successOrder.ID, successCommand, successResult, 7); err != nil {
		t.Fatalf("submit sales order with atomic result: %v", err)
	}
	assertPostgresProcessEffect(t, ctx, processRepo, successCommand.Node.ID, biz.ProcessDomainCommandEffectStateApplied, "sales_order", successOrder.ID)
	recordedNode, err := processRepo.GetProcessNodeInstance(ctx, successCommand.Node.ID)
	if err != nil || recordedNode.DomainCommandFingerprint == nil || recordedNode.DomainCommandResultHash == nil || recordedNode.DomainCommandEffectState == nil {
		t.Fatalf("read sales command result before completion: node=%#v err=%v", recordedNode, err)
	}
	completedNode, err := processRepo.CompleteProcessNodeInstance(ctx, &biz.ProcessNodeInstanceComplete{
		ID:                               recordedNode.ID,
		ProcessInstanceID:                recordedNode.ProcessInstanceID,
		ExpectedVersion:                  recordedNode.Version,
		Outcome:                          biz.SalesOrderProcessCommandOutcomeSubmitted,
		DomainCommandFingerprint:         recordedNode.DomainCommandFingerprint,
		ExpectedDomainCommandResultHash:  recordedNode.DomainCommandResultHash,
		ExpectedDomainCommandEffectState: recordedNode.DomainCommandEffectState,
	}, 7)
	if err != nil {
		t.Fatalf("complete sales command node before cancellation: %v", err)
	}
	if _, err := salesRepo.UpdateSalesOrderLifecycle(ctx, successOrder.ID, biz.SalesOrderStatusCanceled); err != nil {
		t.Fatalf("cancel sales order with compensation: %v", err)
	}
	assertPostgresProcessEffect(t, ctx, processRepo, successCommand.Node.ID, biz.ProcessDomainCommandEffectStateCompensated, "sales_order", successOrder.ID)
	runtimeUC := biz.NewProcessRuntimeUsecase(processRepo, NewWorkflowRepo(data, logger))
	if _, err := runtimeUC.ExecuteDomainCommandNode(ctx, &biz.ProcessDomainCommandExecution{
		ProcessInstanceID:     successCommand.ProcessInstance.ID,
		ProcessNodeInstanceID: successCommand.Node.ID,
		ExpectedVersion:       completedNode.Version - 1,
		CommandKey:            biz.ProcessDomainCommandSalesOrderSubmit,
		IdempotencyKey:        "sales-success/" + suffix,
		Payload:               successPayload,
	}, 7); !errors.Is(err, biz.ErrProcessDomainCommandRecoveryRequired) {
		t.Fatalf("completed command whose domain effect was compensated must fail closed, got %v", err)
	}

	rollbackOrder := createOrder("ROLLBACK")
	rollbackPayload := map[string]any{"sales_order_id": rollbackOrder.ID}
	rollbackCommand := claimedPostgresProcessCommand(t, ctx, processRepo, biz.ProcessDomainCommandSalesOrderSubmit, "sales-rollback/"+suffix, rollbackPayload)
	conflicting := &biz.ProcessDomainCommandResult{Outcome: "preexisting.result", EffectState: biz.ProcessDomainCommandEffectStateNone}
	conflictRecord, err := biz.BuildProcessNodeDomainCommandResultRecord(rollbackCommand, conflicting)
	if err != nil {
		t.Fatalf("build conflicting process result: %v", err)
	}
	if _, err := processRepo.RecordProcessNodeDomainCommandResult(ctx, conflictRecord, 7); err != nil {
		t.Fatalf("record conflicting process result: %v", err)
	}
	submitResult := &biz.ProcessDomainCommandResult{
		Outcome: biz.SalesOrderProcessCommandOutcomeSubmitted, EffectState: biz.ProcessDomainCommandEffectStateApplied,
		EffectRef: &biz.ProcessBusinessRef{RefType: "sales_order", RefID: rollbackOrder.ID},
	}
	if _, err := salesRepo.SubmitSalesOrderForProcessCommand(ctx, rollbackOrder.ID, rollbackCommand, submitResult, 7); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("conflicting process result must roll back sales submit, got %v", err)
	}
	rolledBack, err := salesRepo.GetSalesOrder(ctx, rollbackOrder.ID)
	if err != nil || rolledBack.LifecycleStatus != biz.SalesOrderStatusDraft {
		t.Fatalf("sales side effect must roll back with result conflict, order=%#v err=%v", rolledBack, err)
	}

	legacyOrder := createOrder("LEGACY")
	if _, err := salesRepo.UpdateSalesOrderLifecycle(ctx, legacyOrder.ID, biz.SalesOrderStatusSubmitted); err != nil {
		t.Fatalf("create legacy submitted side effect: %v", err)
	}
	legacyPayload := map[string]any{"sales_order_id": legacyOrder.ID}
	legacyCommand := claimedPostgresProcessCommand(t, ctx, processRepo, biz.ProcessDomainCommandSalesOrderSubmit, "sales-legacy/"+suffix, legacyPayload)
	legacyResult := &biz.ProcessDomainCommandResult{
		Outcome: biz.SalesOrderProcessCommandOutcomeSubmitted, EffectState: biz.ProcessDomainCommandEffectStateApplied,
		EffectRef: &biz.ProcessBusinessRef{RefType: "sales_order", RefID: legacyOrder.ID},
	}
	if _, err := salesRepo.SubmitSalesOrderForProcessCommand(ctx, legacyOrder.ID, legacyCommand, legacyResult, 7); !errors.Is(err, biz.ErrProcessDomainCommandRecoveryRequired) {
		t.Fatalf("legacy submitted order without exact command result must fail closed, got %v", err)
	}
	node, err := processRepo.GetProcessNodeInstance(ctx, legacyCommand.Node.ID)
	if err != nil || node.DomainCommandResultHash != nil {
		t.Fatalf("legacy fail-closed path must not invent result evidence, node=%#v err=%v", node, err)
	}
}

func TestInventoryPostgresShipmentProcessCommandRollsBackSKUInventoryOnResultConflict(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryPostgresTestData(t)
	logger := log.NewStdLogger(io.Discard)
	inventoryRepo := NewInventoryRepo(data, logger)
	inventoryUC := biz.NewInventoryUsecase(inventoryRepo)
	operationalRepo := NewOperationalFactRepo(data, logger)
	operationalUC := biz.NewOperationalFactUsecase(operationalRepo)
	salesUC := biz.NewSalesOrderUsecase(NewSalesOrderRepo(data, logger))
	processRepo := NewProcessRuntimeRepo(data, logger)
	fixtures := createInventoryPostgresFixtures(t, ctx, client)
	sku := createInventoryPostgresSKU(t, ctx, client, fixtures, "ATOMIC-SHIP")
	quantity := decimal.NewFromInt(5)

	if _, err := inventoryUC.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
		SubjectType: biz.InventorySubjectProduct, SubjectID: fixtures.productID, ProductSkuID: &sku.ID,
		WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID,
		TxnType: biz.InventoryTxnIn, Direction: 1, Quantity: quantity,
		SourceType: "ATOMIC_SHIPMENT_SEED", IdempotencyKey: "atomic-shipment-seed/" + fixtures.suffix,
	}); err != nil {
		t.Fatalf("seed exact SKU inventory: %v", err)
	}
	customer := createSalesOrderTestCustomer(t, ctx, client, "C-ATOMIC-SHIP-"+fixtures.suffix, true)
	order, err := salesUC.CreateSalesOrder(ctx, &biz.SalesOrderMutation{
		OrderNo: "SO-ATOMIC-SHIP-" + fixtures.suffix, CustomerID: customer.ID, OrderDate: time.Now(),
	})
	if err != nil {
		t.Fatalf("create shipment source sales order: %v", err)
	}
	orderItem, err := salesUC.AddSalesOrderItem(ctx, &biz.SalesOrderItemMutation{
		SalesOrderID: order.ID, LineNo: 1, ProductID: fixtures.productID, ProductSkuID: &sku.ID,
		UnitID: fixtures.unitID, OrderedQuantity: quantity,
	})
	if err != nil {
		t.Fatalf("create shipment source sales order item: %v", err)
	}
	if _, err := salesUC.SubmitSalesOrder(ctx, order.ID); err != nil {
		t.Fatalf("submit shipment source sales order: %v", err)
	}
	if _, err := salesUC.ActivateSalesOrder(ctx, order.ID); err != nil {
		t.Fatalf("activate shipment source sales order: %v", err)
	}
	reservation, err := operationalUC.CreateStockReservation(ctx, &biz.StockReservationCreate{
		ReservationNo: "RSV-ATOMIC-SHIP-" + fixtures.suffix,
		SalesOrderID:  &order.ID, SalesOrderItemID: &orderItem.ID,
		ProductID: fixtures.productID, ProductSkuID: &sku.ID,
		WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID, Quantity: quantity,
		IdempotencyKey: "atomic-shipment-reservation/" + fixtures.suffix,
	})
	if err != nil {
		t.Fatalf("create exact SKU reservation: %v", err)
	}
	shipmentRow, err := operationalUC.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{
		Shipment: &biz.ShipmentCreate{
			ShipmentNo:   "SHP-ATOMIC-SHIP-" + fixtures.suffix,
			SalesOrderID: &order.ID, CustomerID: &customer.ID,
			IdempotencyKey: "atomic-shipment/" + fixtures.suffix,
		},
		Items: []*biz.ShipmentItemCreate{{
			SalesOrderItemID: &orderItem.ID, ProductID: fixtures.productID, ProductSkuID: &sku.ID,
			WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID, Quantity: quantity,
		}},
	})
	if err != nil {
		t.Fatalf("create exact SKU shipment: %v", err)
	}
	payload := map[string]any{"shipment_id": shipmentRow.ID}
	command := claimedPostgresProcessCommandForBusinessRef(
		t, ctx, processRepo, biz.ProcessDomainCommandShipmentShip,
		"shipment-rollback/"+fixtures.suffix, payload, biz.ShipmentSourceType, shipmentRow.ID,
	)
	recordConflictingPostgresProcessResult(t, ctx, processRepo, command)
	result := &biz.ProcessDomainCommandResult{
		Outcome: biz.ShipmentProcessCommandOutcomeShipped, EffectState: biz.ProcessDomainCommandEffectStateApplied,
		EffectRef: &biz.ProcessBusinessRef{RefType: biz.ShipmentSourceType, RefID: shipmentRow.ID},
	}
	if _, err := operationalRepo.ShipShipmentForProcessCommand(ctx, shipmentRow.ID, command, result, 7); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("conflicting result must roll back shipment transaction, got %v", err)
	}

	shipmentAfter, err := operationalRepo.GetShipment(ctx, shipmentRow.ID)
	if err != nil || shipmentAfter.Status != biz.ShipmentStatusDraft || shipmentAfter.ShippedAt != nil {
		t.Fatalf("shipment side effect must roll back, shipment=%#v err=%v", shipmentAfter, err)
	}
	reservationAfter, err := client.StockReservation.Get(ctx, reservation.ID)
	if err != nil || reservationAfter.Status != biz.StockReservationStatusActive || reservationAfter.ConsumedAt != nil {
		t.Fatalf("reservation consumption must roll back, reservation=%#v err=%v", reservationAfter, err)
	}
	balance, err := inventoryUC.GetInventoryBalance(ctx, biz.InventoryBalanceKey{
		SubjectType: biz.InventorySubjectProduct, SubjectID: fixtures.productID, ProductSkuID: &sku.ID,
		WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID,
	})
	if err != nil || !balance.Quantity.Equal(quantity) {
		t.Fatalf("SKU balance must stay unchanged after rollback, balance=%#v err=%v", balance, err)
	}
	balances, total, err := inventoryUC.ListInventoryBalances(ctx, biz.InventoryBalanceFilter{
		SubjectType:  biz.InventorySubjectProduct,
		SubjectID:    fixtures.productID,
		ProductSkuID: sku.ID,
		WarehouseID:  fixtures.warehouseID,
		Limit:        10,
	})
	if err != nil || total != 1 || len(balances) != 1 || !balances[0].Quantity.Equal(quantity) ||
		!balances[0].ActiveReservedQuantity.Equal(quantity) || !balances[0].AvailableQuantity.IsZero() {
		t.Fatalf("SKU available balance must retain active reservation after rollback, balances=%#v total=%d err=%v", balances, total, err)
	}
	outboundCount, err := client.InventoryTxn.Query().Where(
		inventorytxn.SourceType(biz.ShipmentSourceType),
		inventorytxn.SourceID(shipmentRow.ID),
		inventorytxn.TxnType(biz.InventoryTxnOut),
		inventorytxn.ProductSkuID(sku.ID),
	).Count(ctx)
	if err != nil || outboundCount != 0 {
		t.Fatalf("SKU OUT txn must roll back, count=%d err=%v", outboundCount, err)
	}
}

func TestInventoryPostgresQualityProcessCommandRollsBackDecisionOnResultConflict(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryPostgresTestData(t)
	logger := log.NewStdLogger(io.Discard)
	inventoryRepo := NewInventoryRepo(data, logger)
	inventoryUC := biz.NewInventoryUsecase(inventoryRepo)
	operationalUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger))
	processRepo := NewProcessRuntimeRepo(data, logger)
	fixtures := createInventoryPostgresFixtures(t, ctx, client)
	sku := createInventoryPostgresSKU(t, ctx, client, fixtures, "ATOMIC-QC")
	lot, err := inventoryUC.CreateInventoryLot(ctx, &biz.InventoryLotCreate{
		SubjectType: biz.InventorySubjectProduct, SubjectID: fixtures.productID, ProductSkuID: &sku.ID,
		LotNo: "LOT-ATOMIC-QC-" + fixtures.suffix,
	})
	if err != nil {
		t.Fatalf("create finished-goods SKU lot: %v", err)
	}
	shipmentRow, err := operationalUC.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{
		Shipment: &biz.ShipmentCreate{
			ShipmentNo:     "SHP-ATOMIC-QC-" + fixtures.suffix,
			IdempotencyKey: "atomic-quality-shipment/" + fixtures.suffix,
		},
		Items: []*biz.ShipmentItemCreate{{
			ProductID: fixtures.productID, ProductSkuID: &sku.ID,
			WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID,
			LotID: &lot.ID, Quantity: decimal.NewFromInt(1),
		}},
	})
	if err != nil {
		t.Fatalf("create finished-goods quality shipment: %v", err)
	}
	inspection, err := inventoryUC.CreateFinishedGoodsQualityInspectionDraft(ctx, &biz.QualityInspectionCreate{
		InspectionNo: "QI-ATOMIC-" + fixtures.suffix,
		SourceID:     shipmentRow.ID, InventoryLotID: lot.ID,
		WarehouseID: fixtures.warehouseID, SubjectID: fixtures.productID,
	})
	if err != nil {
		t.Fatalf("create finished-goods quality inspection: %v", err)
	}
	inspection, err = inventoryUC.SubmitQualityInspection(ctx, inspection.ID)
	if err != nil {
		t.Fatalf("submit finished-goods quality inspection: %v", err)
	}
	if inspection.Status != biz.QualityInspectionStatusSubmitted {
		t.Fatalf("quality fixture status=%s, want SUBMITTED", inspection.Status)
	}
	payload := map[string]any{
		"shipment_id": shipmentRow.ID, "quality_inspection_id": inspection.ID,
		"finished_goods_lot_id": lot.ID, "result": biz.QualityInspectionResultPass,
	}
	command := claimedPostgresProcessCommandForBusinessRef(
		t, ctx, processRepo, biz.ProcessDomainCommandFinishedGoodsQualityDecide,
		"quality-rollback/"+fixtures.suffix, payload, biz.ShipmentSourceType, shipmentRow.ID,
	)
	recordConflictingPostgresProcessResult(t, ctx, processRepo, command)
	inspectorID := 7
	decision := &biz.QualityInspectionDecision{
		InspectionID: inspection.ID, Result: biz.QualityInspectionResultPass,
		InspectedAt: time.Now().UTC().Truncate(time.Microsecond), InspectorID: &inspectorID,
		DecisionNote: stringPtr("atomic result conflict"),
	}
	result := &biz.ProcessDomainCommandResult{
		Outcome:     biz.FinishedGoodsQualityProcessCommandOutcomePassed,
		EffectState: biz.ProcessDomainCommandEffectStateApplied,
		EffectRef:   &biz.ProcessBusinessRef{RefType: "quality_inspection", RefID: inspection.ID},
	}
	if _, err := inventoryRepo.PassQualityInspectionForProcessCommand(ctx, decision, command, result, inspectorID); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("conflicting result must roll back quality decision, got %v", err)
	}

	inspectionAfter, err := inventoryUC.GetQualityInspection(ctx, inspection.ID)
	if err != nil || inspectionAfter.Status != biz.QualityInspectionStatusSubmitted || inspectionAfter.Result != nil ||
		inspectionAfter.InspectedAt != nil || inspectionAfter.InspectorID != nil || inspectionAfter.DecisionNote != nil {
		t.Fatalf("quality decision must roll back, inspection=%#v err=%v", inspectionAfter, err)
	}
	lotAfter, err := inventoryUC.GetInventoryLot(ctx, lot.ID)
	if err != nil || lotAfter.Status != biz.InventoryLotHold {
		t.Fatalf("quality lot transition must roll back, lot=%#v err=%v", lotAfter, err)
	}
}

func TestInventoryPostgresConcurrentQualityProcessCommandDefaultedTimesConverge(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	data, client := openInventoryPostgresTestData(t)
	logger := log.NewStdLogger(io.Discard)
	inventoryRepo := NewInventoryRepo(data, logger)
	inventoryUC := biz.NewInventoryUsecase(inventoryRepo)
	operationalUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger))
	processRepo := NewProcessRuntimeRepo(data, logger)
	fixtures := createInventoryPostgresFixtures(t, ctx, client)
	sku := createInventoryPostgresSKU(t, ctx, client, fixtures, "CONCURRENT-QC")
	lot, err := inventoryUC.CreateInventoryLot(ctx, &biz.InventoryLotCreate{
		SubjectType: biz.InventorySubjectProduct, SubjectID: fixtures.productID, ProductSkuID: &sku.ID,
		LotNo: "LOT-CONCURRENT-QC-" + fixtures.suffix,
	})
	if err != nil {
		t.Fatalf("create concurrent quality lot: %v", err)
	}
	shipmentRow, err := operationalUC.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{
		Shipment: &biz.ShipmentCreate{
			ShipmentNo:     "SHP-CONCURRENT-QC-" + fixtures.suffix,
			IdempotencyKey: "concurrent-quality-shipment/" + fixtures.suffix,
		},
		Items: []*biz.ShipmentItemCreate{{
			ProductID: fixtures.productID, ProductSkuID: &sku.ID,
			WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID,
			LotID: &lot.ID, Quantity: decimal.NewFromInt(1),
		}},
	})
	if err != nil {
		t.Fatalf("create concurrent quality shipment: %v", err)
	}
	inspection, err := inventoryUC.CreateFinishedGoodsQualityInspectionDraft(ctx, &biz.QualityInspectionCreate{
		InspectionNo: "QI-CONCURRENT-" + fixtures.suffix,
		SourceID:     shipmentRow.ID, InventoryLotID: lot.ID,
		WarehouseID: fixtures.warehouseID, SubjectID: fixtures.productID,
	})
	if err != nil {
		t.Fatalf("create concurrent quality inspection: %v", err)
	}
	inspection, err = inventoryUC.SubmitQualityInspection(ctx, inspection.ID)
	if err != nil {
		t.Fatalf("submit concurrent quality inspection: %v", err)
	}
	payload := map[string]any{
		"shipment_id": shipmentRow.ID, "quality_inspection_id": inspection.ID,
		"finished_goods_lot_id": lot.ID, "result": biz.QualityInspectionResultPass,
	}
	command := claimedPostgresProcessCommandForBusinessRef(
		t, ctx, processRepo, biz.ProcessDomainCommandFinishedGoodsQualityDecide,
		"quality-concurrent/"+fixtures.suffix, payload, biz.ShipmentSourceType, shipmentRow.ID,
	)
	result := &biz.ProcessDomainCommandResult{
		Outcome:     biz.FinishedGoodsQualityProcessCommandOutcomePassed,
		EffectState: biz.ProcessDomainCommandEffectStateApplied,
		EffectRef:   &biz.ProcessBusinessRef{RefType: "quality_inspection", RefID: inspection.ID},
	}
	inspectorID := 7
	firstTime := time.Date(2026, 7, 11, 1, 2, 3, 100000000, time.UTC)
	decisions := []*biz.QualityInspectionDecision{
		{
			InspectionID: inspection.ID, Result: biz.QualityInspectionResultPass,
			InspectedAt: firstTime, InspectedAtDefaulted: true, InspectorID: &inspectorID,
		},
		{
			InspectionID: inspection.ID, Result: biz.QualityInspectionResultPass,
			InspectedAt: firstTime.Add(time.Second), InspectedAtDefaulted: true, InspectorID: &inspectorID,
		},
	}
	start := make(chan struct{})
	errs := make(chan error, len(decisions))
	rows := make(chan *biz.QualityInspection, len(decisions))
	var wg sync.WaitGroup
	for _, decision := range decisions {
		decision := decision
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			row, decideErr := inventoryRepo.PassQualityInspectionForProcessCommand(ctx, decision, command, result, inspectorID)
			rows <- row
			errs <- decideErr
		}()
	}
	close(start)
	wg.Wait()
	close(rows)
	close(errs)
	for decideErr := range errs {
		if decideErr != nil {
			t.Fatalf("same current command with defaulted handler times must converge: %v", decideErr)
		}
	}
	for row := range rows {
		if row == nil || row.ID != inspection.ID || row.Status != biz.QualityInspectionStatusPassed {
			t.Fatalf("unexpected concurrent quality result %#v", row)
		}
	}
	persisted, err := inventoryUC.GetQualityInspection(ctx, inspection.ID)
	if err != nil || persisted.InspectedAt == nil || persisted.Status != biz.QualityInspectionStatusPassed {
		t.Fatalf("read concurrent quality decision: inspection=%#v err=%v", persisted, err)
	}
	if !persisted.InspectedAt.Equal(firstTime) && !persisted.InspectedAt.Equal(firstTime.Add(time.Second)) {
		t.Fatalf("persisted quality decision must retain exactly one generated time, got %v", persisted.InspectedAt)
	}
	assertPostgresProcessEffect(
		t, ctx, processRepo, command.Node.ID,
		biz.ProcessDomainCommandEffectStateApplied, "quality_inspection", inspection.ID,
	)
	explicitMismatch := &biz.QualityInspectionDecision{
		InspectionID: inspection.ID, Result: biz.QualityInspectionResultPass,
		InspectedAt: firstTime.Add(2 * time.Second), InspectorID: &inspectorID,
	}
	if _, err := inventoryRepo.PassQualityInspectionForProcessCommand(ctx, explicitMismatch, command, result, inspectorID); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("explicit inspected_at mismatch must remain strict, got %v", err)
	}
}

func TestPurchaseReceiptPostgresProcessCommandCreateRollsBackReceiptLotsAndInspectionsOnResultConflict(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	logger := log.NewStdLogger(io.Discard)
	inventoryRepo := NewInventoryRepo(data, logger)
	processRepo := NewProcessRuntimeRepo(data, logger)
	fixtures := createPurchaseReceiptPostgresFixtures(t, ctx, client)
	orderItem := createApprovedPurchaseOrderItemForReceiptTest(
		t,
		ctx,
		client,
		inventoryTestFixtures{
			unitID:      fixtures.unitID,
			materialID:  fixtures.materialID,
			productID:   fixtures.productID,
			warehouseID: fixtures.warehouseID,
		},
		"ATOMIC-CREATE-"+fixtures.suffix,
		decimal.NewFromInt(7),
	)
	receiptNo := "PR-ATOMIC-CREATE-" + fixtures.suffix
	idempotencyKey := "purchase-create-rollback/" + fixtures.suffix
	receivedAt := time.Date(2026, 7, 11, 0, 0, 0, 0, time.UTC)
	payload := map[string]any{
		"purchase_order_id": orderItem.PurchaseOrderID,
		"receipt_no":        receiptNo,
		"warehouse_id":      fixtures.warehouseID,
		"received_at":       "2026-07-11",
	}
	command := claimedPostgresProcessCommandForBusinessRef(
		t,
		ctx,
		processRepo,
		biz.ProcessDomainCommandPurchaseReceiptCreate,
		idempotencyKey,
		payload,
		"purchase_order",
		orderItem.PurchaseOrderID,
	)
	recordConflictingPostgresProcessResult(t, ctx, processRepo, command)
	conflictBefore, err := processRepo.GetProcessNodeInstance(ctx, command.Node.ID)
	if err != nil || conflictBefore.DomainCommandResultHash == nil ||
		conflictBefore.DomainCommandResultState == nil || conflictBefore.DomainCommandEffectState == nil ||
		conflictBefore.DomainCommandResultRecordedAt == nil {
		t.Fatalf("read preexisting process result before receipt creation: node=%#v err=%v", conflictBefore, err)
	}
	conflictHash := *conflictBefore.DomainCommandResultHash
	conflictRecordedAt := *conflictBefore.DomainCommandResultRecordedAt
	payloadBytes, err := json.Marshal(struct {
		PurchaseOrderID int     `json:"purchase_order_id"`
		ReceiptNo       string  `json:"receipt_no"`
		WarehouseID     int     `json:"warehouse_id"`
		ReceivedAt      string  `json:"received_at"`
		Note            *string `json:"note"`
	}{
		PurchaseOrderID: orderItem.PurchaseOrderID,
		ReceiptNo:       receiptNo,
		WarehouseID:     fixtures.warehouseID,
		ReceivedAt:      receivedAt.Format(time.RFC3339Nano),
	})
	if err != nil {
		t.Fatalf("marshal normalized purchase receipt intent: %v", err)
	}
	payloadHash := fmt.Sprintf("%x", sha256.Sum256(payloadBytes))

	countReceiptFacts := func() (int, int, int, int) {
		t.Helper()
		receiptCount, countErr := client.PurchaseReceipt.Query().Where(
			purchasereceipt.ReceiptNo(receiptNo),
		).Count(ctx)
		if countErr != nil {
			t.Fatalf("count atomic-create receipt headers: %v", countErr)
		}
		itemCount, countErr := client.PurchaseReceiptItem.Query().Where(
			purchasereceiptitem.PurchaseOrderItemID(orderItem.ID),
		).Count(ctx)
		if countErr != nil {
			t.Fatalf("count atomic-create receipt items: %v", countErr)
		}
		lotCount, countErr := client.InventoryLot.Query().Where(
			inventorylot.SubjectType(biz.InventorySubjectMaterial),
			inventorylot.SubjectID(fixtures.materialID),
		).Count(ctx)
		if countErr != nil {
			t.Fatalf("count atomic-create inventory lots: %v", countErr)
		}
		inspectionCount, countErr := client.QualityInspection.Query().Where(
			qualityinspection.MaterialID(fixtures.materialID),
			qualityinspection.SourceType(biz.QualityInspectionSourcePurchaseReceipt),
		).Count(ctx)
		if countErr != nil {
			t.Fatalf("count atomic-create quality inspections: %v", countErr)
		}
		return receiptCount, itemCount, lotCount, inspectionCount
	}
	beforeReceiptCount, beforeItemCount, beforeLotCount, beforeInspectionCount := countReceiptFacts()

	if _, err := inventoryRepo.CreatePurchaseReceiptFromPurchaseOrderForProcessCommand(ctx, &biz.PurchaseReceiptFromPurchaseOrderCreate{
		PurchaseOrderID:        orderItem.PurchaseOrderID,
		ReceiptNo:              receiptNo,
		WarehouseID:            fixtures.warehouseID,
		ReceivedAt:             receivedAt,
		IdempotencyKey:         idempotencyKey,
		IdempotencyPayloadHash: payloadHash,
	}, command, 7); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("conflicting result must roll back purchase receipt creation, got %v", err)
	}

	afterReceiptCount, afterItemCount, afterLotCount, afterInspectionCount := countReceiptFacts()
	if afterReceiptCount != beforeReceiptCount || afterItemCount != beforeItemCount ||
		afterLotCount != beforeLotCount || afterInspectionCount != beforeInspectionCount {
		t.Fatalf(
			"receipt creation facts must roll back together, before=(%d,%d,%d,%d) after=(%d,%d,%d,%d)",
			beforeReceiptCount,
			beforeItemCount,
			beforeLotCount,
			beforeInspectionCount,
			afterReceiptCount,
			afterItemCount,
			afterLotCount,
			afterInspectionCount,
		)
	}
	conflictAfter, err := processRepo.GetProcessNodeInstance(ctx, command.Node.ID)
	if err != nil || conflictAfter.DomainCommandResultHash == nil || *conflictAfter.DomainCommandResultHash != conflictHash ||
		conflictAfter.DomainCommandResultState == nil || *conflictAfter.DomainCommandResultState != *conflictBefore.DomainCommandResultState ||
		conflictAfter.DomainCommandEffectState == nil || *conflictAfter.DomainCommandEffectState != *conflictBefore.DomainCommandEffectState ||
		conflictAfter.DomainCommandResultRecordedAt == nil || !conflictAfter.DomainCommandResultRecordedAt.Equal(conflictRecordedAt) ||
		conflictAfter.DomainCommandResult["outcome"] != "preexisting.result" {
		t.Fatalf("preexisting conflicting process result must remain unchanged, before=%#v after=%#v err=%v", conflictBefore, conflictAfter, err)
	}
}

func TestPurchaseReceiptPostgresProcessCommandRollsBackPostOnResultConflict(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	logger := log.NewStdLogger(io.Discard)
	inventoryRepo := NewInventoryRepo(data, logger)
	inventoryUC := biz.NewInventoryUsecase(inventoryRepo)
	processRepo := NewProcessRuntimeRepo(data, logger)
	fixtures := createPurchaseReceiptPostgresFixtures(t, ctx, client)
	quantity := decimal.NewFromInt(7)
	receipt, err := inventoryUC.CreatePurchaseReceiptDraft(ctx, &biz.PurchaseReceiptCreate{
		ReceiptNo:    "PR-ATOMIC-POST-" + fixtures.suffix,
		SupplierName: "Atomic Supplier", ReceivedAt: time.Now().UTC().Truncate(time.Microsecond),
	})
	if err != nil {
		t.Fatalf("create purchase receipt draft: %v", err)
	}
	item, err := inventoryUC.AddPurchaseReceiptItem(ctx, &biz.PurchaseReceiptItemCreate{
		ReceiptID: receipt.ID, MaterialID: fixtures.materialID,
		WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID,
		LotNo: stringPtr("LOT-ATOMIC-POST-" + fixtures.suffix), Quantity: quantity,
		IdempotencyKey: "test:atomic-post:" + fixtures.suffix,
	})
	if err != nil {
		t.Fatalf("add purchase receipt item: %v", err)
	}
	if item.LotID == nil {
		t.Fatal("purchase receipt item must have a lot before posting")
	}
	passAllPurchaseReceiptQualityInspections(t, ctx, inventoryUC, receipt.ID)
	payload := map[string]any{"purchase_receipt_id": receipt.ID}
	command := claimedPostgresProcessCommandForBusinessRef(
		t, ctx, processRepo, biz.ProcessDomainCommandInventoryPostInbound,
		"purchase-post-rollback/"+fixtures.suffix, payload, biz.PurchaseReceiptSourceType, receipt.ID,
	)
	recordConflictingPostgresProcessResult(t, ctx, processRepo, command)
	result := &biz.ProcessDomainCommandResult{
		Outcome: biz.InventoryProcessCommandOutcomeInboundPosted, EffectState: biz.ProcessDomainCommandEffectStateApplied,
		EffectRef: &biz.ProcessBusinessRef{RefType: "purchase_receipt", RefID: receipt.ID},
	}
	if _, err := inventoryRepo.PostPurchaseReceiptForProcessCommand(ctx, receipt.ID, command, result, 7); !errors.Is(err, biz.ErrIdempotencyConflict) {
		t.Fatalf("conflicting result must roll back purchase receipt post, got %v", err)
	}

	receiptAfter, err := inventoryUC.GetPurchaseReceipt(ctx, receipt.ID)
	if err != nil || receiptAfter.Status != biz.PurchaseReceiptStatusDraft || receiptAfter.PostedAt != nil {
		t.Fatalf("purchase receipt status must roll back, receipt=%#v err=%v", receiptAfter, err)
	}
	inboundCount, err := client.InventoryTxn.Query().Where(
		inventorytxn.SourceType(biz.PurchaseReceiptSourceType),
		inventorytxn.SourceID(receipt.ID),
		inventorytxn.SourceLineID(item.ID),
		inventorytxn.TxnType(biz.InventoryTxnIn),
	).Count(ctx)
	if err != nil || inboundCount != 0 {
		t.Fatalf("purchase receipt IN txn must roll back, count=%d err=%v", inboundCount, err)
	}
	balanceCount, err := client.InventoryBalance.Query().Where(
		inventorybalance.SubjectType(biz.InventorySubjectMaterial),
		inventorybalance.SubjectID(fixtures.materialID),
		inventorybalance.WarehouseID(fixtures.warehouseID),
		inventorybalance.UnitID(fixtures.unitID),
		inventorybalance.LotID(*item.LotID),
	).Count(ctx)
	if err != nil || balanceCount != 0 {
		t.Fatalf("purchase receipt balance mutation must roll back, count=%d err=%v", balanceCount, err)
	}
}

func claimedPostgresProcessCommand(
	t *testing.T,
	ctx context.Context,
	repo *processRuntimeRepo,
	commandKey string,
	idempotencyKey string,
	payload map[string]any,
) *biz.ProcessDomainCommandInput {
	t.Helper()
	return claimedPostgresProcessCommandForBusinessRef(
		t, ctx, repo, commandKey, idempotencyKey, payload, "atomic_test", workflowPostgresSourceID(),
	)
}

func claimedPostgresProcessCommandForBusinessRef(
	t *testing.T,
	ctx context.Context,
	repo *processRuntimeRepo,
	commandKey string,
	idempotencyKey string,
	payload map[string]any,
	businessRefType string,
	businessRefID int,
) *biz.ProcessDomainCommandInput {
	t.Helper()
	suffix := postgresTestSuffix()
	instance, nodes, err := repo.CreateProcessInstance(ctx, &biz.ProcessInstanceCreate{
		ProcessKey: "atomic_result_" + suffix, ProcessVersion: "v1", ConfigRevision: "atomic-result-test",
		DefinitionHash: "sha256:atomic-result-" + suffix, BusinessRefType: businessRefType, BusinessRefID: businessRefID,
		IdempotencyKey: "atomic-process/" + suffix, Status: biz.ProcessStatusActive,
		Nodes: []biz.ProcessNodeInstanceCreate{{NodeKey: "command", NodeType: biz.ProcessNodeTypeDomainCommand, Attempt: 1, Status: biz.ProcessNodeStatusWaiting, PolicySnapshot: map[string]any{"command_key": commandKey}}},
	}, 7)
	if err != nil {
		t.Fatalf("create process command fixture: %v", err)
	}
	nodes[0] = activateProcessNodeForTest(t, ctx, repo, instance, nodes[0])
	fingerprint := postgresProcessCommandFingerprint(t, commandKey, idempotencyKey, payload)
	node, err := repo.ClaimProcessNodeDomainCommand(ctx, &biz.ProcessNodeDomainCommandClaim{
		ProcessInstanceID: instance.ID, ProcessNodeInstanceID: nodes[0].ID, ExpectedVersion: nodes[0].Version, DomainCommandFingerprint: fingerprint,
	})
	if err != nil {
		t.Fatalf("claim process command fixture: %v", err)
	}
	return &biz.ProcessDomainCommandInput{ProcessInstance: instance, Node: node, CommandKey: commandKey, IdempotencyKey: idempotencyKey, Payload: payload}
}

func recordConflictingPostgresProcessResult(
	t *testing.T,
	ctx context.Context,
	repo *processRuntimeRepo,
	command *biz.ProcessDomainCommandInput,
) {
	t.Helper()
	record, err := biz.BuildProcessNodeDomainCommandResultRecord(command, &biz.ProcessDomainCommandResult{
		Outcome: "preexisting.result", EffectState: biz.ProcessDomainCommandEffectStateNone,
	})
	if err != nil {
		t.Fatalf("build conflicting process result: %v", err)
	}
	if _, err := repo.RecordProcessNodeDomainCommandResult(ctx, record, 7); err != nil {
		t.Fatalf("record conflicting process result: %v", err)
	}
}

func postgresProcessCommandFingerprint(t *testing.T, commandKey string, idempotencyKey string, payload map[string]any) string {
	t.Helper()
	canonical, err := json.Marshal(struct {
		CommandKey     string         `json:"command_key"`
		IdempotencyKey string         `json:"idempotency_key"`
		Payload        map[string]any `json:"payload"`
	}{commandKey, idempotencyKey, payload})
	if err != nil {
		t.Fatalf("marshal process command fingerprint: %v", err)
	}
	sum := sha256.Sum256(canonical)
	return fmt.Sprintf("%x", sum)
}

func assertPostgresProcessEffect(
	t *testing.T,
	ctx context.Context,
	repo *processRuntimeRepo,
	nodeID int,
	wantState string,
	wantRefType string,
	wantRefID int,
) {
	t.Helper()
	node, err := repo.GetProcessNodeInstance(ctx, nodeID)
	if err != nil {
		t.Fatalf("read process effect evidence: %v", err)
	}
	if node.DomainCommandResultHash == nil || node.DomainCommandEffectState == nil || *node.DomainCommandEffectState != wantState ||
		node.DomainCommandEffectRefType == nil || *node.DomainCommandEffectRefType != wantRefType ||
		node.DomainCommandEffectRefID == nil || *node.DomainCommandEffectRefID != wantRefID {
		t.Fatalf("unexpected process effect evidence %#v", node)
	}
	if wantState == biz.ProcessDomainCommandEffectStateCompensated && node.DomainCommandCompensationHash == nil {
		t.Fatalf("compensated effect must keep deterministic evidence, node=%#v", node)
	}
}
