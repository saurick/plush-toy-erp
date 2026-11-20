package data

import (
	"fmt"
	"io"
	"strings"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/bomitem"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

func TestFinancePaymentListBatchesSourceNames(t *testing.T) {
	ctx := t.Context()
	capture := &sourceDocumentListQueryCapture{}
	data, client := openInventoryRepoTestData(t, "finance_payment_list_scaling", ent.Debug(), ent.Log(capture.log))
	customer := client.Customer.Create().SetCode("PAYMENT-SCALING").SetName("批量查询测试客户").SaveX(ctx)
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	for i := 1; i <= 20; i++ {
		number := fmt.Sprintf("SCALING-%02d", i)
		order := client.SalesOrder.Create().SetOrderNo(number).SetCustomerID(customer.ID).SetOrderDate(time.Now()).SaveX(ctx)
		client.FinancePayment.Create().SetKind("ADVANCE").SetSourceType("sales_order").SetSourceID(order.ID).
			SetPaymentNo(number).SetDirection("RECEIPT").SetCounterpartyType("CUSTOMER").SetCounterpartyID(customer.ID).
			SetAmount(decimal.NewFromInt(100)).SetCurrency("CNY").SetAccountRef("测试账户").SetEvidenceRef("测试回单").
			SetCreatedBy(1).SetIdempotencyKey(number).SetIdempotencyPayloadHash(strings.Repeat("a", 64)).SaveX(ctx)
		if i != 1 && i != 20 {
			continue
		}
		capture.reset()
		rows, total, err := repo.ListFinancePayments(ctx, biz.FinancePaymentFilter{Limit: 200})
		if err != nil || len(rows) != i || total != i {
			t.Fatalf("list %d payments: total=%d rows=%d err=%v", i, total, len(rows), err)
		}
		for _, row := range rows {
			if row.SourceNo != row.PaymentNo {
				t.Fatalf("wrong source name for %s: %s", row.PaymentNo, row.SourceNo)
			}
		}
		queries := capture.selectCount()
		t.Logf("payments=%d SELECTs=%d", i, queries)
		if queries == 0 || queries > 6 {
			t.Fatalf("payment list scales with page rows: %d SELECTs for %d payments", queries, i)
		}
	}
}

func TestEngineeringMaterialPreviewBatchesBOMReferences(t *testing.T) {
	ctx := t.Context()
	capture := &sourceDocumentListQueryCapture{}
	data, client := openInventoryRepoTestData(t, "engineering_material_scaling", ent.Debug(), ent.Log(capture.log))
	f := prepareMaterialRequestFixture(t, ctx, data, "ENGINEERING-SCALING")
	read := func() (*biz.EngineeringMaterialRequest, int) {
		t.Helper()
		capture.reset()
		preview, err := f.uc.GetEngineeringMaterialRequest(ctx, f.order.ID, true)
		if err != nil {
			t.Fatal(err)
		}
		queries := capture.selectCount()
		if queries == 0 {
			t.Fatal("no preview SQL was captured")
		}
		return preview, queries
	}
	before, beforeQueries := read()
	if len(before.Issues) != 0 {
		t.Fatalf("fixture is not confirmed: %v", before.Issues)
	}
	part := client.BOMItem.Query().Where(bomitem.BomHeaderID(f.bom.ID)).FirstX(ctx)
	// Deliberately change the confirmed source so the preview must also retain
	// its stale-fingerprint warning while loading the larger reference set.
	for i := 0; i < 20; i++ {
		client.BOMItem.Create().SetBomHeaderID(f.bom.ID).SetMaterialID(part.MaterialID).SetUnitID(part.UnitID).
			SetQuantity(part.Quantity).SetLossRate(part.LossRate).SaveX(ctx)
	}
	after, afterQueries := read()
	if len(after.Sources) != len(before.Sources)+20 || len(after.Issues) == 0 {
		t.Fatalf("larger stale BOM was not projected: sources=%d issues=%v", len(after.Sources), after.Issues)
	}
	t.Logf("BOM parts=%d SELECTs=%d; parts=%d SELECTs=%d", len(before.Sources), beforeQueries, len(after.Sources), afterQueries)
	if afterQueries != beforeQueries {
		t.Fatalf("preview queries grew with BOM parts: before=%d after=%d", beforeQueries, afterQueries)
	}
}
