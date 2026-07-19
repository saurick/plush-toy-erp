package data

import (
	"context"
	"errors"
	"fmt"
	"io"
	"sync"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent/inventorytxn"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestOperationalFactPostgresDraftCancellationProductionPostVsCancelSerializesInventory(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderPGFixture(t)
	for iteration := 0; iteration < 8; iteration++ {
		label := fmt.Sprintf("draft-post-cancel-%d", iteration)
		order := f.createReleasedOrder(t, ctx, label)
		input := f.linkedFactInput(order, label, 1)
		fact, err := f.factUC.CreateProductionFactDraft(ctx, &input)
		if err != nil {
			t.Fatalf("create production draft: %v", err)
		}

		var postErr, cancelErr error
		start := make(chan struct{})
		var wg sync.WaitGroup
		wg.Add(2)
		go func() {
			defer wg.Done()
			<-start
			_, postErr = f.factUC.PostProductionFact(ctx, fact.ID)
		}()
		go func() {
			defer wg.Done()
			<-start
			_, cancelErr = f.factUC.CancelPostedProductionFact(ctx, fact.ID)
		}()
		close(start)
		wg.Wait()

		stored := f.client.ProductionFact.GetX(ctx, fact.ID)
		if stored.Status != biz.OperationalFactStatusCancelled || cancelErr != nil {
			t.Fatalf("iteration %d final production fact=%s post=%v cancel=%v", iteration, stored.Status, postErr, cancelErr)
		}
		count := f.client.InventoryTxn.Query().Where(
			inventorytxn.SourceType(biz.ProductionFactSourceType), inventorytxn.SourceID(fact.ID),
		).CountX(ctx)
		switch count {
		case 0:
			if !errors.Is(postErr, biz.ErrBadParam) {
				t.Fatalf("iteration %d cancel-first post error=%v", iteration, postErr)
			}
		case 2:
			if postErr != nil {
				t.Fatalf("iteration %d post-first error=%v", iteration, postErr)
			}
		default:
			t.Fatalf("iteration %d partial inventory mutation count=%d", iteration, count)
		}
	}
}

func TestOperationalFactPostgresDraftCancellationOutsourcingPostVsCancelSerializesInventory(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryPostgresTestData(t)
	fixtures := createInventoryPostgresFixtures(t, ctx, client)
	uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))
	for iteration := 0; iteration < 8; iteration++ {
		label := fmt.Sprintf("DRAFT-POST-CANCEL-%d-%s", iteration, fixtures.suffix)
		order, line := createPostgresOutsourcingProductSource(t, ctx, client, fixtures, label, decimal.NewFromInt(3))
		lotNo := "PG-OUT-" + label
		fact, err := uc.CreateOutsourcingReturnReceiptFromOrder(ctx, &biz.OutsourcingFactFromOrderCreate{
			FactNo: "PG-OUT-" + label, OutsourcingOrderID: order.ID, OutsourcingOrderItemID: line.ID,
			WarehouseID: fixtures.warehouseID, NewLotNo: &lotNo, Quantity: decimal.NewFromInt(1),
			IdempotencyKey: "PG-OUT-" + label,
		})
		if err != nil {
			t.Fatalf("create outsourcing draft: %v", err)
		}

		var postErr, cancelErr error
		start := make(chan struct{})
		var wg sync.WaitGroup
		wg.Add(2)
		go func() {
			defer wg.Done()
			<-start
			_, postErr = uc.PostOutsourcingFact(ctx, fact.ID)
		}()
		go func() {
			defer wg.Done()
			<-start
			_, cancelErr = uc.CancelPostedOutsourcingFact(ctx, fact.ID)
		}()
		close(start)
		wg.Wait()

		stored := client.OutsourcingFact.GetX(ctx, fact.ID)
		if stored.Status != biz.OperationalFactStatusCancelled || cancelErr != nil {
			t.Fatalf("iteration %d final outsourcing fact=%s post=%v cancel=%v", iteration, stored.Status, postErr, cancelErr)
		}
		count := client.InventoryTxn.Query().Where(
			inventorytxn.SourceType(biz.OutsourcingFactSourceType), inventorytxn.SourceID(fact.ID),
		).CountX(ctx)
		switch count {
		case 0:
			if !errors.Is(postErr, biz.ErrBadParam) {
				t.Fatalf("iteration %d cancel-first post error=%v", iteration, postErr)
			}
		case 2:
			if postErr != nil {
				t.Fatalf("iteration %d post-first error=%v", iteration, postErr)
			}
		default:
			t.Fatalf("iteration %d partial inventory mutation count=%d", iteration, count)
		}
	}
}

func TestOperationalFactPostgresDraftCancellationFinancePostVsCancelPreservesAudit(t *testing.T) {
	ctx := context.Background()
	data, client := openPurchaseReceiptPostgresTestData(t)
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	suffix := postgresTestSuffix()
	actor := client.AdminUser.Create().SetUsername("finance-post-cancel-" + suffix).SetPasswordHash("test-password-hash").SaveX(ctx)
	for iteration := 0; iteration < 8; iteration++ {
		fact := createFinanceFactDraftForCancelAudit(
			t, ctx, data, client, fmt.Sprintf("FIN-POST-CANCEL-%d-%s", iteration, suffix),
			fmt.Sprintf("finance-post-cancel-%d-%s", iteration, suffix),
		)

		var postErr, cancelErr error
		start := make(chan struct{})
		var wg sync.WaitGroup
		wg.Add(2)
		go func() {
			defer wg.Done()
			<-start
			_, postErr = repo.PostFinanceFact(ctx, fact.ID)
		}()
		go func() {
			defer wg.Done()
			<-start
			_, cancelErr = repo.CancelPostedFinanceFact(ctx, fact.ID, actor.ID, "并发财务作废")
		}()
		close(start)
		wg.Wait()

		stored := client.FinanceFact.GetX(ctx, fact.ID)
		if stored.Status != biz.OperationalFactStatusCancelled || cancelErr != nil || stored.CancelledAt == nil ||
			stored.CancelledBy == nil || *stored.CancelledBy != actor.ID || stored.CancelReason == nil || *stored.CancelReason != "并发财务作废" {
			t.Fatalf("iteration %d final finance fact=%#v post=%v cancel=%v", iteration, stored, postErr, cancelErr)
		}
		if stored.PostedAt == nil {
			if !errors.Is(postErr, biz.ErrBadParam) {
				t.Fatalf("iteration %d cancel-first post error=%v", iteration, postErr)
			}
		} else if postErr != nil {
			t.Fatalf("iteration %d post-first error=%v", iteration, postErr)
		}
	}
}
