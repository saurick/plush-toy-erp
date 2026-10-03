package data

import (
	"context"
	"errors"
	"strconv"
	"testing"

	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/bomitem"
	"server/internal/data/model/ent/purchaseorder"
)

func approveMaterialRequestFixture(t *testing.T, ctx context.Context, f materialRequestFixture, request *biz.EngineeringMaterialRequest) *biz.EngineeringMaterialRequest {
	t.Helper()
	boss, err := f.uc.ReviewEngineeringMaterialRequest(ctx, &biz.EngineeringMaterialReview{
		ID: request.ID, ExpectedVersion: request.Version, ActorID: 22, Action: "BOSS_APPROVE",
	})
	if err != nil {
		t.Fatal(err)
	}
	approved, err := f.uc.ReviewEngineeringMaterialRequest(ctx, financeMaterialRequestInput(boss))
	if err != nil {
		t.Fatal(err)
	}
	return approved
}

// Read committed purchase rows by business identity, independent of result order
// and generated order numbers. Every frozen material must appear exactly once.
func assertMaterialPurchaseResult(t *testing.T, ctx context.Context, client *ent.Client, request *biz.EngineeringMaterialRequest) {
	t.Helper()
	want := make(map[[2]int]*biz.EngineeringMaterialRequestItem)
	suppliers := make(map[int]bool)
	for _, item := range request.Items {
		want[[2]int{item.MaterialID, item.UnitID}] = item
		suppliers[item.SupplierID] = true
	}
	orders := client.PurchaseOrder.Query().Where(purchaseorder.EngineeringMaterialRequestID(request.ID)).WithItems().AllX(ctx)
	if len(orders) != len(suppliers) {
		t.Fatalf("purchase result has %d suppliers, want %d", len(orders), len(suppliers))
	}
	for _, order := range orders {
		if !suppliers[order.SupplierID] || order.LifecycleStatus != biz.PurchaseOrderStatusApproved || order.ExpectedArrivalDate != nil {
			t.Fatalf("unexpected purchase header: %+v", order)
		}
		delete(suppliers, order.SupplierID)
		if len(order.Edges.Items) == 0 {
			t.Fatal("supplier purchase has no material lines")
		}
		for _, line := range order.Edges.Items {
			key := [2]int{line.MaterialID, line.UnitID}
			item, ok := want[key]
			if !ok || item.SupplierID != order.SupplierID || !item.RequiredQuantity.Equal(line.PurchasedQuantity) {
				t.Fatalf("missing, duplicate or incorrect frozen purchase line: %+v", line)
			}
			if line.UnitPrice != nil || line.Amount != nil || line.ExpectedArrivalDate != nil {
				t.Fatal("approval invented price, amount or arrival date")
			}
			delete(want, key)
		}
	}
	if len(want) != 0 {
		t.Fatalf("purchase result omitted %d frozen materials", len(want))
	}
}

func assertMaterialDemandQuantities(t *testing.T, request *biz.EngineeringMaterialRequest, key string, quantities [2]string) {
	t.Helper()
	if len(request.Items) != len(quantities) {
		t.Fatalf("material groups = %d, want %d", len(request.Items), len(quantities))
	}
	for index, want := range quantities {
		found := false
		for _, item := range request.Items {
			if item.MaterialCode == key+"-M"+strconv.Itoa(index) {
				found = true
				if !item.RequiredQuantity.Equal(decimal.RequireFromString(want)) {
					t.Fatalf("material %d demand = %s, want %s", index, item.RequiredQuantity, want)
				}
			}
		}
		if !found {
			t.Fatalf("supplier material %d was merged into a different material", index)
		}
	}
}

func TestEngineeringMaterialCalculationGroupsBeforeRounding(t *testing.T) {
	// Expected values are independent examples of the business formula. In
	// particular, rounding each position before grouping changes the carry case.
	for caseIndex, tc := range []struct {
		name   string
		demand materialRequestDemand
		want   [2]string
	}{
		{"samples_and_loss", materialRequestDemand{ordered: "10", samples: "2", usage: "0.125", loss: "0.1", precision: 6}, [2]string{"3.3", "1.65"}},
		{"integer_group", materialRequestDemand{ordered: "1", samples: "0", usage: "0.4", loss: "0", precision: 0}, [2]string{"1", "1"}},
		{"weight_precision", materialRequestDemand{ordered: "3", samples: "1", usage: "0.2501", loss: "0.02", precision: 3}, [2]string{"2.041", "1.021"}},
		{"six_digit_carry", materialRequestDemand{ordered: "1", samples: "0", usage: "0.333333", loss: "0.000001", precision: 6}, [2]string{"0.666667", "0.333334"}},
		{"smallest_coefficient", materialRequestDemand{ordered: "1", samples: "0", usage: "0.000001", loss: "0", precision: 6}, [2]string{"0.000002", "0.000001"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.Background()
			_, client := openSalesOrderRepoTest(t, "material_calculation_"+tc.name)
			defer mustCloseEntClient(t, client)
			key := "CALC-" + strconv.Itoa(caseIndex)
			f := prepareMaterialRequestFixtureWithDemand(t, ctx, &Data{postgres: client}, key, tc.demand)
			preview, err := f.uc.GetEngineeringMaterialRequest(ctx, f.order.ID, true)
			if err != nil || len(preview.Issues) != 0 || len(preview.Items) != 2 || len(preview.Sources) != 3 {
				t.Fatalf("calculation preview: %+v %v", preview, err)
			}
			assertMaterialDemandQuantities(t, preview, key, tc.want)
			request, err := f.uc.SubmitEngineeringMaterialRequest(ctx, &biz.EngineeringMaterialSubmit{
				SalesOrderID: f.order.ID, ExpectedVersion: preview.SourceOrderVersion, ExpectedSourceHash: preview.SourceHash, ActorID: 11,
			})
			if err != nil {
				t.Fatal(err)
			}
			approveMaterialRequestFixture(t, ctx, f, request)
			assertMaterialPurchaseResult(t, ctx, client, request)
		})
	}
}

func TestEngineeringMaterialCalculationRejectsGroupedOverflow(t *testing.T) {
	ctx := context.Background()
	_, client := openSalesOrderRepoTest(t, "material_calculation_overflow")
	defer mustCloseEntClient(t, client)
	f := prepareMaterialRequestFixtureWithDemand(t, ctx, &Data{postgres: client}, "CALC-OVERFLOW", materialRequestDemand{
		ordered: "99999999999999", samples: "0", usage: "1", loss: "0", precision: 0,
	})
	if _, err := f.uc.GetEngineeringMaterialRequest(ctx, f.order.ID, true); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("accepted grouped demand above storage limit: %v", err)
	}
	if client.EngineeringMaterialRequest.Query().CountX(ctx) != 0 || client.PurchaseOrder.Query().CountX(ctx) != 0 {
		t.Fatal("invalid calculation persisted procurement")
	}
}

func TestSourceDocumentPostgresEngineeringMaterialQuantities(t *testing.T) {
	for _, tc := range []struct {
		name   string
		demand materialRequestDemand
		want   [2]string
	}{
		{"six_digit_carry", materialRequestDemand{ordered: "1", samples: "0", usage: "0.333333", loss: "0.000001", precision: 6}, [2]string{"0.666667", "0.333334"}},
		{"large_exact_quantity", materialRequestDemand{ordered: "99999999999999", samples: "0", usage: "0.5", loss: "0", precision: 0}, [2]string{"99999999999999", "50000000000000"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			data, client := openPurchaseReceiptPostgresTestData(t)
			ctx := context.Background()
			key := "PG-MR-Q-" + postgresTestSuffix()
			f := prepareMaterialRequestFixtureWithDemand(t, ctx, data, key, tc.demand)
			preview, err := f.uc.GetEngineeringMaterialRequest(ctx, f.order.ID, true)
			if err != nil || len(preview.Issues) != 0 {
				t.Fatalf("PostgreSQL quantity preview: %+v %v", preview, err)
			}
			assertMaterialDemandQuantities(t, preview, key, tc.want)
			request, err := f.uc.SubmitEngineeringMaterialRequest(ctx, &biz.EngineeringMaterialSubmit{
				SalesOrderID: f.order.ID, ExpectedVersion: preview.SourceOrderVersion, ExpectedSourceHash: preview.SourceHash, ActorID: 11,
			})
			if err != nil {
				t.Fatal(err)
			}
			approveMaterialRequestFixture(t, ctx, f, request)
			stored, err := f.uc.GetEngineeringMaterialRequestByID(ctx, f.order.ID, request.ID)
			if err != nil {
				t.Fatal(err)
			}
			assertMaterialDemandQuantities(t, stored, key, tc.want)
			assertMaterialPurchaseResult(t, ctx, client, request)
		})
	}
}

func TestEngineeringMaterialSubmissionRequiresReadySources(t *testing.T) {
	for _, issue := range []string{"missing_supplier", "disabled_supplier", "unit_mismatch", "changed_bom"} {
		t.Run(issue, func(t *testing.T) {
			ctx := context.Background()
			_, client := openSalesOrderRepoTest(t, "material_readiness_"+issue)
			defer mustCloseEntClient(t, client)
			f := prepareMaterialRequestFixture(t, ctx, &Data{postgres: client}, "MATERIAL-READY")
			part := client.BOMItem.Query().Where(bomitem.BomHeaderID(f.bom.ID)).FirstX(ctx)
			switch issue {
			case "missing_supplier":
				client.Material.UpdateOneID(part.MaterialID).ClearSupplierID().SaveX(ctx)
			case "disabled_supplier":
				m := client.Material.GetX(ctx, part.MaterialID)
				client.Supplier.UpdateOneID(*m.SupplierID).SetIsActive(false).SaveX(ctx)
			case "unit_mismatch":
				other := createSalesOrderTestUnit(t, ctx, client, "OTHER-MATERIAL-U", true)
				client.BOMItem.UpdateOneID(part.ID).SetUnitID(other.ID).SaveX(ctx)
			case "changed_bom":
				client.BOMItem.UpdateOneID(part.ID).SetQuantity(decimal.RequireFromString("0.2")).SaveX(ctx)
			}
			preview, err := f.uc.GetEngineeringMaterialRequest(ctx, f.order.ID, true)
			if err != nil || len(preview.Issues) == 0 {
				t.Fatalf("invalid source produced a ready preview: %+v %v", preview, err)
			}
			if _, err := f.uc.SubmitEngineeringMaterialRequest(ctx, &biz.EngineeringMaterialSubmit{
				SalesOrderID: f.order.ID, ExpectedVersion: preview.SourceOrderVersion, ExpectedSourceHash: preview.SourceHash, ActorID: 11,
			}); !errors.Is(err, biz.ErrMaterialRequestNotReady) {
				t.Fatalf("invalid source was submitted: %v", err)
			}
			if client.EngineeringMaterialRequest.Query().CountX(ctx) != 0 || client.WorkflowTask.Query().CountX(ctx) != 0 || client.PurchaseOrder.Query().CountX(ctx) != 0 {
				t.Fatal("source validation failure persisted approval or purchases")
			}
		})
	}
}

func TestEngineeringMaterialSubmissionRejectsStalePreview(t *testing.T) {
	for _, changed := range []string{"order_version", "production_quantity", "bom_usage"} {
		t.Run(changed, func(t *testing.T) {
			ctx := context.Background()
			_, client := openSalesOrderRepoTest(t, "material_stale_"+changed)
			defer mustCloseEntClient(t, client)
			f := prepareMaterialRequestFixture(t, ctx, &Data{postgres: client}, "MATERIAL-STALE")
			preview, err := f.uc.GetEngineeringMaterialRequest(ctx, f.order.ID, true)
			if err != nil {
				t.Fatal(err)
			}
			switch changed {
			case "order_version":
				client.SalesOrder.UpdateOneID(f.order.ID).AddVersion(1).SaveX(ctx)
			case "production_quantity":
				client.SalesOrderItem.UpdateOneID(f.line.ID).SetPreShipmentSampleQuantity(decimal.NewFromInt(15)).SaveX(ctx)
			case "bom_usage":
				part := client.BOMItem.Query().Where(bomitem.BomHeaderID(f.bom.ID)).FirstX(ctx)
				client.BOMItem.UpdateOneID(part.ID).SetQuantity(decimal.RequireFromString("0.2")).SaveX(ctx)
			}
			if _, err := f.uc.SubmitEngineeringMaterialRequest(ctx, &biz.EngineeringMaterialSubmit{
				SalesOrderID: f.order.ID, ExpectedVersion: preview.SourceOrderVersion, ExpectedSourceHash: preview.SourceHash, ActorID: 11,
			}); !errors.Is(err, biz.ErrMaterialRequestConflict) {
				t.Fatalf("submitted stale %s preview: %v", changed, err)
			}
			if client.EngineeringMaterialRequest.Query().CountX(ctx) != 0 || client.WorkflowTask.Query().CountX(ctx) != 0 || client.PurchaseOrder.Query().CountX(ctx) != 0 {
				t.Fatal("stale submission persisted approval or purchases")
			}
		})
	}
}

func TestEngineeringMaterialInventoryDoesNotReduceDemand(t *testing.T) {
	ctx := context.Background()
	_, client := openSalesOrderRepoTest(t, "material_inventory_reference")
	defer mustCloseEntClient(t, client)
	f := prepareMaterialRequestFixture(t, ctx, &Data{postgres: client}, "MATERIAL-STOCK-REFERENCE")
	before, err := f.uc.GetEngineeringMaterialRequest(ctx, f.order.ID, true)
	if err != nil {
		t.Fatal(err)
	}
	warehouse := createTestWarehouse(t, ctx, client, "MATERIAL-REFERENCE-WH")
	for _, item := range before.Items {
		client.InventoryBalance.Create().SetSubjectType(biz.InventorySubjectMaterial).SetSubjectID(item.MaterialID).
			SetWarehouseID(warehouse.ID).SetUnitID(item.UnitID).SetQuantity(decimal.NewFromInt(10000)).SaveX(ctx)
	}
	after, err := f.uc.GetEngineeringMaterialRequest(ctx, f.order.ID, true)
	if err != nil || after.SourceHash != before.SourceHash {
		t.Fatalf("reference stock changed procurement inputs: %+v %v", after, err)
	}
	request := submitMaterialRequestFixture(t, ctx, f)
	approveMaterialRequestFixture(t, ctx, f, request)
	assertMaterialPurchaseResult(t, ctx, client, request)
	for _, balance := range client.InventoryBalance.Query().AllX(ctx) {
		if !balance.Quantity.Equal(decimal.NewFromInt(10000)) {
			t.Fatal("approval consumed reference inventory")
		}
	}
	if client.InventoryTxn.Query().CountX(ctx) != 0 || client.PurchaseReceipt.Query().CountX(ctx) != 0 {
		t.Fatal("approval posted warehouse facts")
	}
}
