package data

import (
	"context"
	"errors"
	"io"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent/runtimeauditevent"
)

func TestRuntimeAuditFiltersUseNamedFields(t *testing.T) {
	fx := newAdminManageAtomicFixture(t)
	for _, event := range []struct{ key, payload string }{
		{"correct", `{"actor":{"id":1,"username":"alice"},"target":{"type":"role","key":"sales"}}`},
		{"unrelated", `{"actor":{"id":2,"username":"bob"},"target":{"type":"user","key":"alice"},"reason":"role sales"}`},
	} {
		fx.client.RuntimeAuditEvent.Create().SetEventType("review").SetEventKey(event.key).SetSource("review").SetPayload(event.payload).SaveX(fx.ctx)
	}
	for _, filter := range []biz.RuntimeAuditEventListFilter{{ActorKey: "alice"}, {TargetType: "role"}, {TargetKey: "sales"}} {
		filter.Source = "review"
		result, err := fx.repo.ListRuntimeAuditEvents(fx.ctx, filter)
		if err != nil || result.Total != 1 || result.Events[0].EventKey != "correct" {
			t.Fatalf("filter=%+v result=%+v err=%v", filter, result, err)
		}
	}
	fx.client.RuntimeAuditEvent.Create().SetEventType("review").SetEventKey("id-only").SetSource("review").SetPayload(`{"actor":{"id":` + strconv.Itoa(fx.operator.ID) + `}}`).SaveX(fx.ctx)
	for keyword, want := range map[string]int{fx.operator.Username: 2, "%": 0} {
		result, err := fx.repo.ListRuntimeAuditEvents(fx.ctx, biz.RuntimeAuditEventListFilter{Source: "review", Keyword: keyword})
		if err != nil || result.Total != want {
			t.Fatalf("keyword=%q total=%d want=%d err=%v", keyword, result.Total, want, err)
		}
	}
}

func TestBOMActivationRechecksDisabledReferences(t *testing.T) {
	for _, subject := range []string{"product", "material", "unit"} {
		t.Run(subject, func(t *testing.T) {
			ctx := t.Context()
			data, client := openInventoryRepoTestData(t, "review_bom_"+subject)
			f := createInventoryTestFixtures(t, ctx, client)
			uc := biz.NewInventoryUsecase(NewInventoryRepo(data, log.NewStdLogger(io.Discard)))
			draft, err := uc.SaveBOMWithItems(ctx, 0, &biz.BOMVersionMutation{ProductID: f.productID, BOMHeaderUpdate: biz.BOMHeaderUpdate{Version: "review"}}, []*biz.BOMItemSaveMutation{{BOMItemUpdate: biz.BOMItemUpdate{MaterialID: f.materialID, UnitID: f.unitID, Quantity: decimal.NewFromInt(1)}}})
			if err != nil {
				t.Fatal(err)
			}
			var want error
			switch subject {
			case "product":
				client.Product.UpdateOneID(f.productID).SetIsActive(false).SaveX(ctx)
				want = biz.ErrProductInactive
			case "material":
				client.Material.UpdateOneID(f.materialID).SetIsActive(false).SaveX(ctx)
				want = biz.ErrMaterialInactive
			case "unit":
				client.Unit.UpdateOneID(f.unitID).SetIsActive(false).SaveX(ctx)
				want = biz.ErrUnitInactive
			}
			if _, err = uc.ActivateBOMVersion(ctx, draft.Header.ID); !errors.Is(err, want) {
				t.Fatalf("activation err=%v want=%v", err, want)
			}
			if got := client.BOMHeader.GetX(ctx, draft.Header.ID); got.Status != biz.BOMStatusDraft {
				t.Fatalf("failed activation changed status: %s", got.Status)
			}
		})
	}
}

func TestAdminManagePostgresLegalNoticeConcurrentAcknowledgementIsSingleReceipt(t *testing.T) {
	ctx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
	defer cancel()
	data, client := openPurchaseReceiptPostgresTestData(t)
	actor := client.AdminUser.Create().SetUsername("review-legal-" + postgresTestSuffix()).SetPasswordHash("fixture-hash").SaveX(ctx)
	repo := &adminManageRepo{data: data, log: log.NewHelper(log.NewStdLogger(io.Discard))}
	event, err := biz.BuildLegalNoticeAcknowledgementAuditEvent(&biz.AdminUser{ID: actor.ID, Username: actor.Username}, "review", "0123456789abcdef", time.Now())
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	start := make(chan struct{})
	errs := make(chan error, 8)
	for range 8 {
		wg.Add(1)
		go func() { defer wg.Done(); <-start; errs <- repo.RecordRuntimeAuditEvent(ctx, event) }()
	}
	close(start)
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	rows, err := client.RuntimeAuditEvent.Query().Where(runtimeauditevent.EventKey(event.EventKey)).All(ctx)
	if err != nil || len(rows) != 1 {
		t.Fatalf("receipts=%d err=%v", len(rows), err)
	}
}
