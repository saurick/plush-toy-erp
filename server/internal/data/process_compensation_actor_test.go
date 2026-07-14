package data

import (
	"context"
	"crypto/sha256"
	"fmt"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/enttest"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
	_ "github.com/mattn/go-sqlite3"
	"github.com/shopspring/decimal"
)

func TestCancellationCompensationKeepsAuthenticatedActor(t *testing.T) {
	t.Run("sales order", func(t *testing.T) {
		ctx := context.Background()
		client := enttest.Open(t, dialect.SQLite, "file:compensation_actor_sales?mode=memory&cache=shared&_fk=1")
		defer mustCloseEntClient(t, client)
		data := &Data{postgres: client}
		uc := biz.NewSalesOrderUsecase(NewSalesOrderRepo(data, log.NewStdLogger(io.Discard)))
		customer := createSalesOrderTestCustomer(t, ctx, client, "C-COMP-ACTOR", true)
		order, err := uc.CreateSalesOrder(ctx, &biz.SalesOrderMutation{
			OrderNo: "SO-COMP-ACTOR", CustomerID: customer.ID, OrderDate: time.Now(),
		})
		if err != nil {
			t.Fatalf("create sales order: %v", err)
		}
		if _, err := uc.SubmitSalesOrder(ctx, order.ID); err != nil {
			t.Fatalf("submit sales order: %v", err)
		}
		nodeID := recordAppliedProcessCommandEffect(t, ctx, data, biz.ProcessDomainCommandSalesOrderSubmit, "sales_order", order.ID)
		if _, err := uc.CancelSalesOrderWithActor(ctx, order.ID, 41); err != nil {
			t.Fatalf("cancel sales order with actor: %v", err)
		}
		assertCompensationActor(t, ctx, client, nodeID, 41)
	})

	t.Run("purchase receipt", func(t *testing.T) {
		ctx := context.Background()
		data, client := openInventoryRepoTestData(t, "compensation_actor_purchase_receipt")
		fixtures := createInventoryTestFixtures(t, ctx, client)
		uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
		receipt := createAndPostPurchaseReceipt(t, ctx, uc, "PR-COMP-ACTOR", fixtures, stringPtr("PR-COMP-ACTOR-LOT"), decimal.NewFromInt(5))
		nodeID := recordAppliedProcessCommandEffect(t, ctx, data, biz.ProcessDomainCommandInventoryPostInbound, "purchase_receipt", receipt.ID)
		if _, err := uc.CancelPostedPurchaseReceiptWithActor(ctx, receipt.ID, 42); err != nil {
			t.Fatalf("cancel purchase receipt with actor: %v", err)
		}
		assertCompensationActor(t, ctx, client, nodeID, 42)
	})

	t.Run("shipment", func(t *testing.T) {
		ctx := context.Background()
		data, client := openInventoryRepoTestData(t, "compensation_actor_shipment")
		fixtures := createInventoryTestFixtures(t, ctx, client)
		inventoryRepo := NewInventoryRepo(data, log.NewStdLogger(io.Discard))
		factUC := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))
		if _, err := inventoryRepo.ApplyInventoryTxnAndUpdateBalance(ctx, &biz.InventoryTxnCreate{
			SubjectType: biz.InventorySubjectProduct, SubjectID: fixtures.productID, WarehouseID: fixtures.warehouseID,
			TxnType: biz.InventoryTxnIn, Direction: 1, Quantity: decimal.NewFromInt(5), UnitID: fixtures.unitID,
			SourceType: "COMPENSATION_ACTOR_TEST", IdempotencyKey: "COMPENSATION_ACTOR_TEST:SHIPMENT:IN",
		}); err != nil {
			t.Fatalf("seed shipment inventory: %v", err)
		}
		shipment, err := factUC.CreateShipmentDraftWithItems(ctx, &biz.ShipmentCreateWithItems{
			Shipment: &biz.ShipmentCreate{ShipmentNo: "SHP-COMP-ACTOR", IdempotencyKey: "SHP-COMP-ACTOR"},
			Items: []*biz.ShipmentItemCreate{{
				ProductID: fixtures.productID, WarehouseID: fixtures.warehouseID, UnitID: fixtures.unitID, Quantity: decimal.NewFromInt(2),
			}},
		})
		if err != nil {
			t.Fatalf("create shipment: %v", err)
		}
		if _, err := factUC.ShipShipment(ctx, shipment.ID); err != nil {
			t.Fatalf("ship shipment: %v", err)
		}
		nodeID := recordAppliedProcessCommandEffect(t, ctx, data, biz.ProcessDomainCommandShipmentShip, "shipment", shipment.ID)
		if _, err := factUC.CancelShippedShipmentWithActor(ctx, shipment.ID, 43); err != nil {
			t.Fatalf("cancel shipment with actor: %v", err)
		}
		assertCompensationActor(t, ctx, client, nodeID, 43)
	})

	t.Run("finance fact", func(t *testing.T) {
		ctx := context.Background()
		data, client := openInventoryRepoTestData(t, "compensation_actor_finance")
		actor := client.AdminUser.Create().SetUsername("finance-compensation-actor").SetPasswordHash("test-password-hash").SaveX(ctx)
		factRepo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
		factUC := biz.NewOperationalFactUsecase(factRepo)
		fact, err := factRepo.CreateFinanceFactDraft(ctx, &biz.FinanceFactCreate{
			FactNo: "FIN-COMP-ACTOR", FactType: biz.FinanceFactReceivable,
			CounterpartyType: biz.FinanceCounterpartyCustomer, Amount: decimal.NewFromInt(100),
			Currency: biz.FinanceCurrencyCNY, IdempotencyKey: "FIN-COMP-ACTOR", OccurredAt: time.Now(),
		})
		if err != nil {
			t.Fatalf("create finance fact: %v", err)
		}
		if _, err := factUC.PostFinanceFact(ctx, fact.ID); err != nil {
			t.Fatalf("post finance fact: %v", err)
		}
		nodeID := recordAppliedProcessCommandEffect(t, ctx, data, biz.ProcessDomainCommandFinanceReceivableLead, "finance_fact", fact.ID)
		if _, err := factUC.CancelPostedFinanceFact(ctx, fact.ID, actor.ID, "测试取消并核对流程结果"); err != nil {
			t.Fatalf("cancel finance fact with actor: %v", err)
		}
		assertCompensationActor(t, ctx, client, nodeID, actor.ID)
		node, err := client.ProcessNodeInstance.Get(ctx, nodeID)
		if err != nil {
			t.Fatalf("read finance compensation: %v", err)
		}
		if got, _ := node.DomainCommandCompensation["reason"].(string); got != "测试取消并核对流程结果" {
			t.Fatalf("finance compensation reason=%q", got)
		}
	})
}

func recordAppliedProcessCommandEffect(
	t *testing.T,
	ctx context.Context,
	data *Data,
	commandKey string,
	refType string,
	refID int,
) int {
	t.Helper()
	repo := NewProcessRuntimeRepo(data, log.NewStdLogger(io.Discard))
	seed := fmt.Sprintf("%s:%s:%d", commandKey, refType, refID)
	fingerprintBytes := sha256.Sum256([]byte("fingerprint:" + seed))
	resultHashBytes := sha256.Sum256([]byte("result:" + seed))
	fingerprint := fmt.Sprintf("%x", fingerprintBytes)
	resultHash := fmt.Sprintf("%x", resultHashBytes)
	instance, nodes, err := repo.CreateProcessInstance(ctx, &biz.ProcessInstanceCreate{
		ProcessKey: "compensation_actor", ProcessVersion: "v1", ConfigRevision: "test", DefinitionHash: "sha256:test",
		BusinessRefType: refType, BusinessRefID: refID, IdempotencyKey: "compensation-actor:" + seed, Status: biz.ProcessStatusActive,
		Nodes: []biz.ProcessNodeInstanceCreate{{
			NodeKey: "command", NodeType: biz.ProcessNodeTypeDomainCommand, Attempt: 1, Status: biz.ProcessNodeStatusWaiting,
			PolicySnapshot: map[string]any{"command_key": commandKey},
		}},
	}, 7)
	if err != nil {
		t.Fatalf("create process command effect: %v", err)
	}
	nodes[0] = activateProcessNodeForTest(t, ctx, repo, instance, nodes[0])
	node, err := repo.ClaimProcessNodeDomainCommand(ctx, &biz.ProcessNodeDomainCommandClaim{
		ProcessInstanceID: instance.ID, ProcessNodeInstanceID: nodes[0].ID,
		ExpectedVersion: nodes[0].Version, DomainCommandFingerprint: fingerprint,
	})
	if err != nil {
		t.Fatalf("claim process command effect: %v", err)
	}
	if _, err := repo.RecordProcessNodeDomainCommandResult(ctx, &biz.ProcessNodeDomainCommandResultRecord{
		ProcessInstanceID: instance.ID, ProcessNodeInstanceID: node.ID, ExpectedVersion: node.Version,
		DomainCommandFingerprint: fingerprint, ProtocolVersion: biz.ProcessDomainCommandProtocolVersionCurrent,
		ResultState: biz.ProcessDomainCommandResultStateSucceeded,
		Result: map[string]any{
			"outcome": "test.applied", "block_reason": "", "linked_business_refs": []any{},
			"effect_state": biz.ProcessDomainCommandEffectStateApplied, "result_version": float64(1),
		},
		ResultHash: resultHash, EffectState: biz.ProcessDomainCommandEffectStateApplied,
		EffectRefType: &refType, EffectRefID: &refID,
	}, 7); err != nil {
		t.Fatalf("record process command effect: %v", err)
	}
	return node.ID
}

func assertCompensationActor(t *testing.T, ctx context.Context, client *ent.Client, nodeID int, actorID int) {
	t.Helper()
	node, err := client.ProcessNodeInstance.Get(ctx, nodeID)
	if err != nil {
		t.Fatalf("read compensated process node: %v", err)
	}
	if node.DomainCommandCompensatedBy == nil || *node.DomainCommandCompensatedBy != actorID {
		t.Fatalf("expected compensation actor %d, got %#v", actorID, node.DomainCommandCompensatedBy)
	}
}
