package data

import (
	"errors"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"server/internal/biz"
)

func TestPurchaseOrderSupplierGuardRejectsCreateAndSupplierSwitchAtomically(t *testing.T) {
	uc, client := openPurchaseOrderRepoTest(t, "PO-SUPPLIER-GUARD")
	ctx := t.Context()
	unit := createTestUnit(t, ctx, client, "PCS-GUARD")
	supplierA := createPurchaseOrderTestSupplier(t, ctx, client, "SUP-GUARD-A", true)
	supplierB := createPurchaseOrderTestSupplier(t, ctx, client, "SUP-GUARD-B", true)
	material := createTestMaterial(t, ctx, client, unit.ID, "MAT-GUARD")
	client.Material.UpdateOneID(material.ID).SetSupplierID(supplierA.ID).SaveX(ctx)
	input := &biz.PurchaseOrderMutation{PurchaseOrderNo: "PO-GUARD", SupplierID: supplierB.ID, PurchaseDate: time.Now()}
	lines := []*biz.PurchaseOrderItemSaveMutation{{PurchaseOrderItemMutation: biz.PurchaseOrderItemMutation{LineNo: 1, MaterialID: material.ID, UnitID: unit.ID, PurchasedQuantity: decimal.NewFromInt(2)}}}
	if _, err := uc.SavePurchaseOrderWithItems(ctx, 0, input, lines); !errors.Is(err, biz.ErrPurchaseOrderMaterialSupplierMismatch) {
		t.Fatalf("cross supplier create: %v", err)
	}
	if client.PurchaseOrder.Query().CountX(ctx) != 0 {
		t.Fatal("failed save left header")
	}
	input.SupplierID = supplierA.ID
	saved, err := uc.SavePurchaseOrderWithItems(ctx, 0, input, lines)
	if err != nil {
		t.Fatal(err)
	}
	input.Currency = saved.Order.Currency
	input.PaymentTermDays = saved.Order.PaymentTermDays
	input.ExpectedVersion = saved.Order.Version
	input.SupplierID = supplierB.ID
	lines[0].ID = saved.Items[0].ID
	if _, err = uc.SavePurchaseOrderWithItems(ctx, saved.Order.ID, input, lines); !errors.Is(err, biz.ErrPurchaseOrderMaterialSupplierMismatch) {
		t.Fatalf("supplier switch: %v", err)
	}
	current := client.PurchaseOrder.GetX(ctx, saved.Order.ID)
	if current.SupplierID != supplierA.ID || current.Version != saved.Order.Version {
		t.Fatal("failed switch changed header/version")
	}
	if _, err = uc.UpdatePurchaseOrder(ctx, saved.Order.ID, input); !errors.Is(err, biz.ErrPurchaseOrderMaterialSupplierMismatch) {
		t.Fatalf("header-only supplier switch bypassed guard: %v", err)
	}
	client.Material.UpdateOneID(material.ID).SetSupplierID(supplierB.ID).SaveX(ctx)
	if _, err = uc.SubmitPurchaseOrder(ctx, saved.Order.ID); !errors.Is(err, biz.ErrPurchaseOrderMaterialSupplierMismatch) {
		t.Fatalf("submit after material supplier change: %v", err)
	}
	client.Material.UpdateOneID(material.ID).ClearSupplierID().SaveX(ctx)
	if _, err = uc.SavePurchaseOrderWithItems(ctx, saved.Order.ID, input, lines); err != nil {
		t.Fatalf("shared material rejected: %v", err)
	}
}

func TestPurchaseOrderSupplierCandidatesFilterBeforePagination(t *testing.T) {
	uc, client := openMasterDataRepoTest(t, "PURCHASE-SUPPLIER-CANDIDATES")
	defer mustCloseEntClient(t, client)
	ctx := t.Context()
	unit := createTestUnit(t, ctx, client, "PCS-CANDIDATE")
	a := createPurchaseOrderTestSupplier(t, ctx, client, "SUP-CAND-A", true)
	b := createPurchaseOrderTestSupplier(t, ctx, client, "SUP-CAND-B", true)
	for i, supplierID := range []int{a.ID, b.ID, 0} {
		row := createTestMaterial(t, ctx, client, unit.ID, []string{"MAT-A", "MAT-B", "MAT-SHARED"}[i])
		if supplierID != 0 {
			client.Material.UpdateOneID(row.ID).SetSupplierID(supplierID).SaveX(ctx)
		}
	}
	seen := map[int]bool{}
	for offset := 0; offset < 2; offset++ {
		rows, total, err := uc.ListMaterials(ctx, biz.MasterDataFilter{PurchaseSupplierID: a.ID, Limit: 1, Offset: offset})
		if err != nil || total != 2 || len(rows) != 1 {
			t.Fatalf("candidate page: total=%d rows=%v err=%v", total, rows, err)
		}
		if rows[0].SupplierID != nil && *rows[0].SupplierID != a.ID {
			t.Fatal("another supplier in candidate page")
		}
		seen[rows[0].ID] = true
	}
	if len(seen) != 2 {
		t.Fatal("pagination did not retain shared material")
	}
}
