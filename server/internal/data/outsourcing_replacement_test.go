package data

import (
	"context"
	"errors"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestOutsourcingStandalonePartialReturnReplacement(t *testing.T) {
	data, client := openInventoryRepoTestData(t, "outsourcing_replacement")
	testOutsourcingStandalonePartialReturnReplacement(t, data, client, false)
}
func TestOutsourcingFactFromOrderPostgresStandaloneReplacement(t *testing.T) {
	data, client := openPurchaseOperationalPostgresTestData(t)
	testOutsourcingStandalonePartialReturnReplacement(t, data, client, true)
}
func testOutsourcingStandalonePartialReturnReplacement(t *testing.T, data *Data, client *ent.Client, concurrent bool) {
	t.Helper()
	ctx := context.Background()
	fixtures := createInventoryTestFixtures(t, ctx, client)
	logger := log.NewStdLogger(io.Discard)
	inv := biz.NewInventoryUsecase(NewInventoryRepo(data, logger))
	facts := biz.NewOperationalFactUsecase(NewOperationalFactRepo(data, logger))
	actor := client.AdminUser.Create().SetUsername("replacement-actor").SetPasswordHash("test-only").SaveX(ctx)
	fact := createPostedOutsourcingReturnForQuality(t, ctx, client, inv, facts, fixtures, actor.ID, "REPLACEMENT")
	client.OutsourcingOrderItem.UpdateOneID(*fact.SourceLineID).SetOutsourcingQuantity(fact.Quantity).SaveX(ctx)
	qi, err := inv.CreateQualityInspectionFromOutsourcingReturn(ctx, &biz.QualityInspectionFromOutsourcingReturnCreate{InspectionNo: "QI-REPLACEMENT", OutsourcingFactID: fact.ID})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = inv.SubmitQualityInspection(ctx, qi.ID); err != nil {
		t.Fatal(err)
	}
	rejected, err := inv.RejectQualityInspection(ctx, approximateQualityInspectionDecision(qi.ID, biz.QualityInspectionResultReject))
	if err != nil {
		t.Fatal(err)
	}
	create := func(no string) *biz.OutsourcingReturnDisposition {
		row, err := facts.CreateOutsourcingReturnDisposition(ctx, &biz.OutsourcingReturnDispositionCreate{DispositionNo: no, QualityInspectionID: rejected.ID, DispositionType: biz.OutsourcingDispositionReturnToVendor, Quantity: decimal.NewFromInt(1), Reason: "不合格退回加工厂", IdempotencyKey: no, CreatedBy: actor.ID})
		if err != nil {
			t.Fatal(err)
		}
		if row.ProductionWIPBatchID != nil {
			t.Fatal("standalone return invented WIP source")
		}
		return row
	}
	first, second := create("RTV-1"), create("RTV-2")
	if _, err = facts.CreateOutsourcingReturnDisposition(ctx, &biz.OutsourcingReturnDispositionCreate{DispositionNo: "RTV-OVER", QualityInspectionID: rejected.ID, DispositionType: biz.OutsourcingDispositionReturnToVendor, Quantity: decimal.NewFromInt(1), Reason: "不得超退", IdempotencyKey: "rtv-over", CreatedBy: actor.ID}); !errors.Is(err, biz.ErrOutsourcingDispositionSourceInvalid) {
		t.Fatalf("over return: %v", err)
	}
	replacementInput := &biz.OutsourcingFactFromOrderCreate{FactNo: "REPLACEMENT-RETURN", OutsourcingOrderID: *fact.SourceID, OutsourcingOrderItemID: *fact.SourceLineID, WarehouseID: fact.WarehouseID, NewLotNo: stringPtr("REPLACEMENT-NEW-LOT"), Quantity: fact.Quantity, IdempotencyKey: "replacement-return"}
	if _, err = facts.CreateOutsourcingReturnReceiptFromOrder(ctx, replacementInput); !errors.Is(err, biz.ErrOutsourcingOrderFactQuantityExceeded) {
		t.Fatalf("draft return released capacity: %v", err)
	}
	first, err = facts.PostOutsourcingReturnDisposition(ctx, &biz.OutsourcingReturnDispositionMutation{ID: first.ID, ExpectedVersion: first.Version, ActorID: actor.ID})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = facts.CreateOutsourcingReturnReceiptFromOrder(ctx, replacementInput); !errors.Is(err, biz.ErrOutsourcingOrderFactQuantityExceeded) {
		t.Fatalf("partial return exceeded capacity: %v", err)
	}
	second, err = facts.PostOutsourcingReturnDisposition(ctx, &biz.OutsourcingReturnDispositionMutation{ID: second.ID, ExpectedVersion: second.Version, ActorID: actor.ID})
	if err != nil {
		t.Fatal(err)
	}
	replay, err := facts.PostOutsourcingReturnDisposition(ctx, &biz.OutsourcingReturnDispositionMutation{ID: second.ID, ExpectedVersion: second.Version - 1, ActorID: actor.ID})
	if err != nil || replay.ID != second.ID {
		t.Fatalf("post replay: %v", err)
	}
	assertOutsourcingDispositionBalance(t, ctx, inv, fact, decimal.Zero)
	fresh, _, err := facts.ListOutsourcingFacts(ctx, biz.OperationalFactFilter{SourceType: biz.OutsourcingOrderSourceType, SourceID: *fact.SourceID, Limit: 100})
	if err != nil || len(fresh) != 1 || !fresh[0].ReturnedToVendorQuantity.Equal(fact.Quantity) {
		t.Fatalf("net receipt projection: %#v %v", fresh, err)
	}
	replacement, err := facts.CreateOutsourcingReturnReceiptFromOrder(ctx, replacementInput)
	if err != nil {
		t.Fatal(err)
	}
	cancel := &biz.OutsourcingReturnDispositionMutation{ID: first.ID, ExpectedVersion: first.Version, ActorID: actor.ID, Reason: "撤销返厂"}
	postReplacement := func() error {
		var postErr error
		replacement, postErr = facts.PostOutsourcingFact(ctx, operationalFactStatusMutation(replacement.ID, replacement.Version, actor.ID, ""))
		return postErr
	}
	if concurrent {
		postErr, cancelErr := runPostgresSourceLockRace(t, ctx, data, "outsourcing_orders", *fact.SourceID, postReplacement, func() error {
			_, err := facts.CancelOutsourcingReturnDisposition(ctx, cancel)
			return err
		})
		if postErr != nil || !errors.Is(cancelErr, biz.ErrOutsourcingOrderFactQuantityExceeded) {
			t.Fatalf("concurrent replacement / return cancellation: post=%v cancel=%v", postErr, cancelErr)
		}
	} else if err := postReplacement(); err != nil {
		t.Fatal(err)
	}
	if _, err = facts.CancelOutsourcingReturnDisposition(ctx, cancel); !errors.Is(err, biz.ErrOutsourcingOrderFactQuantityExceeded) {
		t.Fatalf("replacement must block return reversal: %v", err)
	}
	if _, err = facts.CancelPostedOutsourcingFact(ctx, operationalFactStatusMutation(replacement.ID, replacement.Version, actor.ID, "补回作废")); err != nil {
		t.Fatal(err)
	}
	if _, err = facts.CancelOutsourcingReturnDisposition(ctx, cancel); err != nil {
		t.Fatal(err)
	}
	assertOutsourcingDispositionBalance(t, ctx, inv, fact, decimal.NewFromInt(1))
}
