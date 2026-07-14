package data

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent/outsourcingorderitem"
	"server/internal/data/model/ent/purchaseorderitem"
	"server/internal/data/model/ent/salesorderitem"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

// The paused repos stop after usecase validation and before the real repo write,
// making the save-vs-submit TOCTOU ordering deterministic.
type pausedSalesOrderSaveRepo struct {
	biz.SalesOrderRepo
	entered chan<- struct{}
	release <-chan struct{}
}

func (r *pausedSalesOrderSaveRepo) SaveSalesOrderWithItems(ctx context.Context, id int, order *biz.SalesOrderMutation, items []*biz.SalesOrderItemSaveMutation) (*biz.SalesOrderWithItems, error) {
	r.entered <- struct{}{}
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-r.release:
	}
	return r.SalesOrderRepo.SaveSalesOrderWithItems(ctx, id, order, items)
}

type pausedPurchaseOrderSaveRepo struct {
	biz.PurchaseOrderRepo
	entered chan<- struct{}
	release <-chan struct{}
}

func (r *pausedPurchaseOrderSaveRepo) SavePurchaseOrderWithItems(ctx context.Context, id int, order *biz.PurchaseOrderMutation, items []*biz.PurchaseOrderItemSaveMutation) (*biz.PurchaseOrderWithItems, error) {
	r.entered <- struct{}{}
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-r.release:
	}
	return r.PurchaseOrderRepo.SavePurchaseOrderWithItems(ctx, id, order, items)
}

type pausedOutsourcingOrderSaveRepo struct {
	biz.OutsourcingOrderRepo
	entered chan<- struct{}
	release <-chan struct{}
}

func (r *pausedOutsourcingOrderSaveRepo) SaveOutsourcingOrderWithItems(ctx context.Context, id int, order *biz.OutsourcingOrderMutation, items []*biz.OutsourcingOrderItemSaveMutation) (*biz.OutsourcingOrderWithItems, error) {
	r.entered <- struct{}{}
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-r.release:
	}
	return r.OutsourcingOrderRepo.SaveOutsourcingOrderWithItems(ctx, id, order, items)
}

func TestSourceDocumentPostgresSaveSubmitConcurrency(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	logger := log.NewStdLogger(io.Discard)
	suffix := postgresTestSuffix()

	t.Run("sales_order", func(t *testing.T) {
		unit := createTestUnit(t, ctx, client, "SO-PG-U-"+suffix)
		product := createTestProduct(t, ctx, client, unit.ID, "SO-PG-P-"+suffix)
		customer := createSalesOrderTestCustomer(t, ctx, client, "SO-PG-C-"+suffix, true)
		realRepo := NewSalesOrderRepo(data, logger)
		realUC := biz.NewSalesOrderUsecase(realRepo)
		orderDate := time.Date(2026, 7, 10, 0, 0, 0, 0, time.UTC)
		originalQuantity := decimal.NewFromInt(10)

		created, err := realUC.SaveSalesOrderWithItems(ctx, 0, &biz.SalesOrderMutation{
			OrderNo:    "SO-PG-CONCURRENT-" + suffix,
			CustomerID: customer.ID,
			OrderDate:  orderDate,
		}, []*biz.SalesOrderItemSaveMutation{{
			SalesOrderItemMutation: biz.SalesOrderItemMutation{
				LineNo:          1,
				ProductID:       product.ID,
				UnitID:          unit.ID,
				OrderedQuantity: originalQuantity,
			},
		}})
		if err != nil {
			t.Fatalf("create sales order: %v", err)
		}

		entered := make(chan struct{}, 1)
		release := make(chan struct{})
		closeSourceDocumentReleaseOnCleanup(t, release)
		pausedUC := biz.NewSalesOrderUsecase(&pausedSalesOrderSaveRepo{SalesOrderRepo: realRepo, entered: entered, release: release})
		saveErr := make(chan error, 1)
		go func() {
			_, err := pausedUC.SaveSalesOrderWithItems(ctx, created.Order.ID, &biz.SalesOrderMutation{
				OrderNo:         "SO-PG-MUTATED-" + suffix,
				CustomerID:      customer.ID,
				OrderDate:       orderDate,
				ExpectedVersion: created.Order.Version,
			}, []*biz.SalesOrderItemSaveMutation{{
				ID: created.Items[0].ID,
				SalesOrderItemMutation: biz.SalesOrderItemMutation{
					LineNo:          1,
					ProductID:       product.ID,
					UnitID:          unit.ID,
					OrderedQuantity: decimal.NewFromInt(99),
				},
			}})
			saveErr <- err
		}()
		waitForPausedSourceDocumentSave(t, entered)
		if _, err := realUC.SubmitSalesOrder(ctx, created.Order.ID); err != nil {
			close(release)
			t.Fatalf("submit sales order while stale save is paused: %v", err)
		}
		close(release)
		if err := <-saveErr; !errors.Is(err, biz.ErrBadParam) {
			t.Fatalf("stale sales-order save must be rejected after submit, got %v", err)
		}

		order, err := client.SalesOrder.Get(ctx, created.Order.ID)
		if err != nil {
			t.Fatalf("reload sales order: %v", err)
		}
		items, err := client.SalesOrderItem.Query().Where(salesorderitem.SalesOrderID(order.ID)).All(ctx)
		if err != nil {
			t.Fatalf("reload sales order items: %v", err)
		}
		if order.LifecycleStatus != biz.SalesOrderStatusSubmitted || order.OrderNo != created.Order.OrderNo || len(items) != 1 || !items[0].OrderedQuantity.Equal(originalQuantity) {
			t.Fatalf("submitted sales order must retain original header/items, order=%#v items=%#v", order, items)
		}
		if _, err := realUC.ActivateSalesOrder(ctx, order.ID); err != nil {
			t.Fatalf("activate submitted sales order: %v", err)
		}
		if _, err := realRepo.UpdateSalesOrderLifecycle(ctx, order.ID, biz.SalesOrderStatusSubmitted); !errors.Is(err, biz.ErrBadParam) {
			t.Fatalf("stale lifecycle write must not regress active sales order, got %v", err)
		}
	})

	t.Run("purchase_order", func(t *testing.T) {
		unit := createTestUnit(t, ctx, client, "PO-PG-U-"+suffix)
		material := createTestMaterial(t, ctx, client, unit.ID, "PO-PG-M-"+suffix)
		supplier := createPurchaseOrderTestSupplier(t, ctx, client, "PO-PG-S-"+suffix, true)
		realRepo := NewPurchaseOrderRepo(data, logger)
		realUC := biz.NewPurchaseOrderUsecase(realRepo)
		purchaseDate := time.Date(2026, 7, 10, 0, 0, 0, 0, time.UTC)
		originalQuantity := decimal.NewFromInt(10)

		created, err := realUC.SavePurchaseOrderWithItems(ctx, 0, &biz.PurchaseOrderMutation{
			PurchaseOrderNo: "PO-PG-CONCURRENT-" + suffix,
			SupplierID:      supplier.ID,
			PurchaseDate:    purchaseDate,
		}, []*biz.PurchaseOrderItemSaveMutation{{
			PurchaseOrderItemMutation: biz.PurchaseOrderItemMutation{
				LineNo:            1,
				MaterialID:        material.ID,
				UnitID:            unit.ID,
				PurchasedQuantity: originalQuantity,
			},
		}})
		if err != nil {
			t.Fatalf("create purchase order: %v", err)
		}

		entered := make(chan struct{}, 1)
		release := make(chan struct{})
		closeSourceDocumentReleaseOnCleanup(t, release)
		pausedUC := biz.NewPurchaseOrderUsecase(&pausedPurchaseOrderSaveRepo{PurchaseOrderRepo: realRepo, entered: entered, release: release})
		saveErr := make(chan error, 1)
		go func() {
			_, err := pausedUC.SavePurchaseOrderWithItems(ctx, created.Order.ID, &biz.PurchaseOrderMutation{
				PurchaseOrderNo: "PO-PG-MUTATED-" + suffix,
				SupplierID:      supplier.ID,
				PurchaseDate:    purchaseDate,
				ExpectedVersion: created.Order.Version,
			}, []*biz.PurchaseOrderItemSaveMutation{{
				ID: created.Items[0].ID,
				PurchaseOrderItemMutation: biz.PurchaseOrderItemMutation{
					LineNo:            1,
					MaterialID:        material.ID,
					UnitID:            unit.ID,
					PurchasedQuantity: decimal.NewFromInt(99),
				},
			}})
			saveErr <- err
		}()
		waitForPausedSourceDocumentSave(t, entered)
		if _, err := realUC.SubmitPurchaseOrder(ctx, created.Order.ID); err != nil {
			close(release)
			t.Fatalf("submit purchase order while stale save is paused: %v", err)
		}
		close(release)
		if err := <-saveErr; !errors.Is(err, biz.ErrBadParam) {
			t.Fatalf("stale purchase-order save must be rejected after submit, got %v", err)
		}

		order, err := client.PurchaseOrder.Get(ctx, created.Order.ID)
		if err != nil {
			t.Fatalf("reload purchase order: %v", err)
		}
		items, err := client.PurchaseOrderItem.Query().Where(purchaseorderitem.PurchaseOrderID(order.ID)).All(ctx)
		if err != nil {
			t.Fatalf("reload purchase order items: %v", err)
		}
		if order.LifecycleStatus != biz.PurchaseOrderStatusSubmitted || order.PurchaseOrderNo != created.Order.PurchaseOrderNo || len(items) != 1 || !items[0].PurchasedQuantity.Equal(originalQuantity) {
			t.Fatalf("submitted purchase order must retain original header/items, order=%#v items=%#v", order, items)
		}
		if _, err := realUC.ApprovePurchaseOrder(ctx, order.ID); err != nil {
			t.Fatalf("approve submitted purchase order: %v", err)
		}
		if _, err := realRepo.UpdatePurchaseOrderLifecycle(ctx, order.ID, biz.PurchaseOrderStatusSubmitted); !errors.Is(err, biz.ErrBadParam) {
			t.Fatalf("stale lifecycle write must not regress approved purchase order, got %v", err)
		}
	})

	t.Run("outsourcing_order", func(t *testing.T) {
		unit := createTestUnit(t, ctx, client, "OUT-PG-U-"+suffix)
		product := createTestProduct(t, ctx, client, unit.ID, "OUT-PG-P-"+suffix)
		supplier := createPurchaseOrderTestSupplier(t, ctx, client, "OUT-PG-S-"+suffix, true)
		process, err := client.Process.Create().
			SetCode("OUT-PG-PROC-" + suffix).
			SetName("车缝加工").
			SetOutsourcingEnabled(true).
			Save(ctx)
		if err != nil {
			t.Fatalf("create outsourcing process: %v", err)
		}
		realRepo := NewOutsourcingOrderRepo(data, logger)
		realUC := biz.NewOutsourcingOrderUsecase(realRepo)
		orderDate := time.Date(2026, 7, 10, 0, 0, 0, 0, time.UTC)
		originalQuantity := decimal.NewFromInt(10)

		created, err := realUC.SaveOutsourcingOrderWithItems(ctx, 0, &biz.OutsourcingOrderMutation{
			OutsourcingOrderNo: "OUT-PG-CONCURRENT-" + suffix,
			SupplierID:         supplier.ID,
			OrderDate:          orderDate,
		}, []*biz.OutsourcingOrderItemSaveMutation{{
			OutsourcingOrderItemMutation: biz.OutsourcingOrderItemMutation{
				LineNo:              1,
				SubjectType:         biz.OutsourcingOrderSubjectProduct,
				ProductID:           &product.ID,
				ProcessID:           process.ID,
				UnitID:              unit.ID,
				OutsourcingQuantity: originalQuantity,
			},
		}})
		if err != nil {
			t.Fatalf("create outsourcing order: %v", err)
		}

		entered := make(chan struct{}, 1)
		release := make(chan struct{})
		closeSourceDocumentReleaseOnCleanup(t, release)
		pausedUC := biz.NewOutsourcingOrderUsecase(&pausedOutsourcingOrderSaveRepo{OutsourcingOrderRepo: realRepo, entered: entered, release: release})
		saveErr := make(chan error, 1)
		go func() {
			_, err := pausedUC.SaveOutsourcingOrderWithItems(ctx, created.Order.ID, &biz.OutsourcingOrderMutation{
				OutsourcingOrderNo: "OUT-PG-MUTATED-" + suffix,
				SupplierID:         supplier.ID,
				OrderDate:          orderDate,
				ExpectedVersion:    created.Order.Version,
			}, []*biz.OutsourcingOrderItemSaveMutation{{
				ID: created.Items[0].ID,
				OutsourcingOrderItemMutation: biz.OutsourcingOrderItemMutation{
					LineNo:              1,
					SubjectType:         biz.OutsourcingOrderSubjectProduct,
					ProductID:           &product.ID,
					ProcessID:           process.ID,
					UnitID:              unit.ID,
					OutsourcingQuantity: decimal.NewFromInt(99),
				},
			}})
			saveErr <- err
		}()
		waitForPausedSourceDocumentSave(t, entered)
		if _, err := realUC.SubmitOutsourcingOrder(ctx, created.Order.ID); err != nil {
			close(release)
			t.Fatalf("submit outsourcing order while stale save is paused: %v", err)
		}
		close(release)
		if err := <-saveErr; !errors.Is(err, biz.ErrBadParam) {
			t.Fatalf("stale outsourcing-order save must be rejected after submit, got %v", err)
		}

		order, err := client.OutsourcingOrder.Get(ctx, created.Order.ID)
		if err != nil {
			t.Fatalf("reload outsourcing order: %v", err)
		}
		items, err := client.OutsourcingOrderItem.Query().Where(outsourcingorderitem.OutsourcingOrderID(order.ID)).All(ctx)
		if err != nil {
			t.Fatalf("reload outsourcing order items: %v", err)
		}
		if order.LifecycleStatus != biz.OutsourcingOrderStatusSubmitted || order.OutsourcingOrderNo != created.Order.OutsourcingOrderNo || len(items) != 1 || !items[0].OutsourcingQuantity.Equal(originalQuantity) {
			t.Fatalf("submitted outsourcing order must retain original header/items, order=%#v items=%#v", order, items)
		}
		if _, err := realUC.ConfirmOutsourcingOrder(ctx, order.ID); err != nil {
			t.Fatalf("confirm submitted outsourcing order: %v", err)
		}
		if _, err := realRepo.UpdateOutsourcingOrderLifecycle(ctx, order.ID, biz.OutsourcingOrderStatusSubmitted); !errors.Is(err, biz.ErrBadParam) {
			t.Fatalf("stale lifecycle write must not regress confirmed outsourcing order, got %v", err)
		}
	})
}

func waitForPausedSourceDocumentSave(t *testing.T, entered <-chan struct{}) {
	t.Helper()
	select {
	case <-entered:
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for source-document save to pass usecase prechecks")
	}
}

func closeSourceDocumentReleaseOnCleanup(t *testing.T, release chan struct{}) {
	t.Helper()
	t.Cleanup(func() {
		select {
		case <-release:
		default:
			close(release)
		}
	})
}

var _ biz.SalesOrderRepo = (*pausedSalesOrderSaveRepo)(nil)
var _ biz.PurchaseOrderRepo = (*pausedPurchaseOrderSaveRepo)(nil)
var _ biz.OutsourcingOrderRepo = (*pausedOutsourcingOrderSaveRepo)(nil)
