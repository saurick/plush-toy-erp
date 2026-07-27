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
		draftID, draftVersion := fact.ID, fact.Version

		var postErr, cancelErr error
		start := make(chan struct{})
		var wg sync.WaitGroup
		wg.Add(2)
		go func() {
			defer wg.Done()
			<-start
			_, postErr = f.factUC.PostProductionFact(ctx, operationalFactStatusMutation(draftID, draftVersion, f.actorID, ""))
		}()
		go func() {
			defer wg.Done()
			<-start
			_, cancelErr = f.factUC.CancelPostedProductionFact(ctx, operationalFactStatusMutation(draftID, draftVersion, f.actorID, "并发撤销生产草稿"))
		}()
		close(start)
		wg.Wait()

		stored := f.client.ProductionFact.GetX(ctx, fact.ID)
		count := f.client.InventoryTxn.Query().Where(
			inventorytxn.SourceType(biz.ProductionFactSourceType), inventorytxn.SourceID(fact.ID),
		).CountX(ctx)
		switch stored.Status {
		case biz.OperationalFactStatusPosted:
			if postErr != nil || !errors.Is(cancelErr, biz.ErrOperationalFactVersionConflict) || count != 1 {
				t.Fatalf("iteration %d post winner fact=%s txns=%d post=%v cancel=%v", iteration, stored.Status, count, postErr, cancelErr)
			}
		case biz.OperationalFactStatusCancelled:
			if cancelErr != nil || !errors.Is(postErr, biz.ErrOperationalFactVersionConflict) || count != 0 {
				t.Fatalf("iteration %d cancel winner fact=%s txns=%d post=%v cancel=%v", iteration, stored.Status, count, postErr, cancelErr)
			}
		default:
			t.Fatalf("iteration %d unexpected production fact=%s txns=%d post=%v cancel=%v", iteration, stored.Status, count, postErr, cancelErr)
		}
	}
}

func TestOperationalFactPostgresDraftCancellationOutsourcingPostVsCancelSerializesInventory(t *testing.T) {
	ctx := context.Background()
	data, client := openInventoryPostgresTestData(t)
	fixtures := createInventoryPostgresFixtures(t, ctx, client)
	uc := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, log.NewStdLogger(io.Discard)))
	actor := client.AdminUser.Create().SetUsername("outsourcing-draft-race-" + fixtures.suffix).SetPasswordHash("test-password-hash").SaveX(ctx)
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
		draftID, draftVersion := fact.ID, fact.Version

		var postErr, cancelErr error
		start := make(chan struct{})
		var wg sync.WaitGroup
		wg.Add(2)
		go func() {
			defer wg.Done()
			<-start
			_, postErr = uc.PostOutsourcingFact(ctx, operationalFactStatusMutation(draftID, draftVersion, actor.ID, ""))
		}()
		go func() {
			defer wg.Done()
			<-start
			_, cancelErr = uc.CancelPostedOutsourcingFact(ctx, operationalFactStatusMutation(draftID, draftVersion, actor.ID, "并发撤销委外草稿"))
		}()
		close(start)
		wg.Wait()

		stored := client.OutsourcingFact.GetX(ctx, fact.ID)
		count := client.InventoryTxn.Query().Where(
			inventorytxn.SourceType(biz.OutsourcingFactSourceType), inventorytxn.SourceID(fact.ID),
		).CountX(ctx)
		switch stored.Status {
		case biz.OperationalFactStatusPosted:
			if postErr != nil || !errors.Is(cancelErr, biz.ErrOperationalFactVersionConflict) || count != 1 {
				t.Fatalf("iteration %d post winner fact=%s txns=%d post=%v cancel=%v", iteration, stored.Status, count, postErr, cancelErr)
			}
		case biz.OperationalFactStatusCancelled:
			if cancelErr != nil || !errors.Is(postErr, biz.ErrOperationalFactVersionConflict) || count != 0 {
				t.Fatalf("iteration %d cancel winner fact=%s txns=%d post=%v cancel=%v", iteration, stored.Status, count, postErr, cancelErr)
			}
		default:
			t.Fatalf("iteration %d unexpected outsourcing fact=%s txns=%d post=%v cancel=%v", iteration, stored.Status, count, postErr, cancelErr)
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
		draftID, draftVersion := fact.ID, fact.Version

		var postErr, cancelErr error
		start := make(chan struct{})
		var wg sync.WaitGroup
		wg.Add(2)
		go func() {
			defer wg.Done()
			<-start
			_, postErr = repo.PostFinanceFact(ctx, operationalFactStatusMutation(draftID, draftVersion, actor.ID, ""))
		}()
		go func() {
			defer wg.Done()
			<-start
			_, cancelErr = repo.CancelPostedFinanceFact(ctx, operationalFactStatusMutation(draftID, draftVersion, actor.ID, "并发财务作废"))
		}()
		close(start)
		wg.Wait()

		stored := client.FinanceFact.GetX(ctx, fact.ID)
		switch stored.Status {
		case biz.OperationalFactStatusPosted:
			if postErr != nil || !errors.Is(cancelErr, biz.ErrOperationalFactVersionConflict) ||
				stored.PostedAt == nil || stored.PostedBy == nil || *stored.PostedBy != actor.ID ||
				stored.CancelledAt != nil || stored.CancelledBy != nil || stored.CancelReason != nil {
				t.Fatalf("iteration %d post winner finance fact=%#v post=%v cancel=%v", iteration, stored, postErr, cancelErr)
			}
		case biz.OperationalFactStatusCancelled:
			if cancelErr != nil || !errors.Is(postErr, biz.ErrOperationalFactVersionConflict) || stored.PostedAt != nil ||
				stored.CancelledAt == nil || stored.CancelledBy == nil || *stored.CancelledBy != actor.ID ||
				stored.CancelReason == nil || *stored.CancelReason != "并发财务作废" {
				t.Fatalf("iteration %d cancel winner finance fact=%#v post=%v cancel=%v", iteration, stored, postErr, cancelErr)
			}
		default:
			t.Fatalf("iteration %d unexpected finance fact=%#v post=%v cancel=%v", iteration, stored, postErr, cancelErr)
		}
	}
}
