package data

import (
	"context"
	"io"
	"testing"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"server/internal/biz"
	"server/internal/data/model/ent"
)

func TestBusinessDocumentSearchQueries(t *testing.T) {
	_, client := openSalesOrderRepoTest(t, "business_search_queries")
	defer mustCloseEntClient(t, client)
	assertBusinessSearchQueries(t, client)
}

func assertBusinessSearchQueries(t *testing.T, client *ent.Client) {
	ctx := context.Background()
	checks := map[string]func() (int, error){
		"sales": func() (int, error) {
			return client.SalesOrder.Query().Where(businessDocumentKeyword("sales", "产品")).Count(ctx)
		},
		"purchase": func() (int, error) {
			return client.PurchaseOrder.Query().Where(businessDocumentKeyword("purchase", "产品")).Count(ctx)
		},
		"engineering": func() (int, error) {
			return client.EngineeringMaterialRequest.Query().Where(businessDocumentKeyword("engineering", "产品")).Count(ctx)
		},
		"production": func() (int, error) {
			return client.ProductionOrder.Query().Where(businessDocumentKeyword("production", "产品")).Count(ctx)
		},
		"outsourcing": func() (int, error) {
			return client.OutsourcingOrder.Query().Where(businessDocumentKeyword("outsourcing", "产品")).Count(ctx)
		},
		"receipt": func() (int, error) {
			return client.PurchaseReceipt.Query().Where(businessDocumentKeyword("receipt", "产品")).Count(ctx)
		},
		"shipment": func() (int, error) {
			return client.Shipment.Query().Where(businessDocumentKeyword("shipment", "产品")).Count(ctx)
		},
		"quality": func() (int, error) {
			return client.QualityInspection.Query().Where(businessDocumentKeyword("quality", "产品")).Count(ctx)
		},
		"production_fact": func() (int, error) {
			return client.ProductionFact.Query().Where(businessDocumentKeyword("production_fact", "产品")).Count(ctx)
		},
		"outsourcing_fact": func() (int, error) {
			return client.OutsourcingFact.Query().Where(businessDocumentKeyword("outsourcing_fact", "产品")).Count(ctx)
		},
		"finance": func() (int, error) {
			return client.FinanceFact.Query().Where(businessDocumentKeyword("finance", "产品")).Count(ctx)
		},
		"payment": func() (int, error) {
			return client.FinancePayment.Query().Where(businessDocumentKeyword("payment", "产品")).Count(ctx)
		},
		"credit": func() (int, error) {
			return client.FinanceCreditNote.Query().Where(businessDocumentKeyword("credit", "产品")).Count(ctx)
		},
		"balance": func() (int, error) {
			return client.InventoryBalance.Query().Where(businessDocumentKeyword("balance", "产品")).Count(ctx)
		},
		"lot": func() (int, error) {
			return client.InventoryLot.Query().Where(businessDocumentKeyword("lot", "产品")).Count(ctx)
		},
		"inventory_txn": func() (int, error) {
			return client.InventoryTxn.Query().Where(businessDocumentKeyword("inventory_txn", "产品")).Count(ctx)
		},
		"bom": func() (int, error) {
			return client.BOMHeader.Query().Where(businessDocumentKeyword("bom", "产品")).Count(ctx)
		},
	}
	for name, check := range checks {
		t.Run(name, func(t *testing.T) {
			if _, err := check(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestPurchaseSearchUsesFrozenMaterialSourcesAndPagination(t *testing.T) {
	_, client := openSalesOrderRepoTest(t, "business_purchase_search")
	defer mustCloseEntClient(t, client)
	assertFrozenPurchaseSearch(t, &Data{postgres: client})
}

func assertFrozenPurchaseSearch(t *testing.T, data *Data) {
	ctx := context.Background()
	client := data.postgres
	f := prepareMaterialRequestFixture(t, ctx, data, "SEARCH")
	request := submitMaterialRequestFixture(t, ctx, f)
	boss, err := f.uc.ReviewEngineeringMaterialRequest(ctx, &biz.EngineeringMaterialReview{ID: request.ID, ExpectedVersion: request.Version, ActorID: 22, Action: "BOSS_APPROVE"})
	if err != nil {
		t.Fatal(err)
	}
	approved, err := f.uc.ReviewEngineeringMaterialRequest(ctx, financeMaterialRequestInput(boss))
	if err != nil {
		t.Fatal(err)
	}
	if len(approved.PurchaseOrders) != 2 {
		t.Fatal("fixture must produce two suppliers")
	}
	first, second := approved.PurchaseOrders[0], approved.PurchaseOrders[1]
	if first.SupplierName == "" || second.SupplierName == "" {
		t.Fatal("approval must expose frozen supplier names")
	}
	firstItem := client.PurchaseOrder.GetX(ctx, first.ID).QueryItems().OnlyX(ctx)
	row := client.EngineeringMaterialRequest.GetX(ctx, request.ID)
	client.Product.UpdateOneID(f.bom.ProductID).SetStyleNo("MONKEY-26204").SaveX(ctx)
	otherProduct := client.Product.Create().SetCode("SEARCH-OTHER").SetName("另一产品").SetDefaultUnitID(firstItem.UnitID).SaveX(ctx)
	for _, source := range row.SourceSnapshot {
		if int(source["material_id"].(float64)) == firstItem.MaterialID {
			source["product_name"], source["product_code"], source["customer_product_no"] = "冻结抱抱猴子", "Monkey-AbC", "STYLE%_01"
		} else {
			source["product_name"], source["product_code"], source["customer_product_no"] = "冻结抱抱兔子", "Rabbit-XyZ", "STYLEZZ01"
			source["product_id"] = otherProduct.ID
		}
	}
	client.EngineeringMaterialRequest.UpdateOne(row).SetSourceSnapshot(row.SourceSnapshot).SaveX(ctx)
	repo := &purchaseOrderRepo{data: data}
	for _, tc := range []struct {
		keyword string
		want    int
	}{{"猴子", first.ID}, {"monkey-abc", first.ID}, {"monkey-26204", first.ID}, {"STYLE%_", first.ID}, {"兔子", second.ID}, {"不存在", 0}, {"' OR 1=1 --", 0}} {
		t.Run(tc.keyword, func(t *testing.T) {
			rows, total, err := repo.ListPurchaseOrders(ctx, biz.PurchaseOrderFilter{Keyword: tc.keyword, Limit: 10})
			if err != nil {
				t.Fatal(err)
			}
			if tc.want == 0 {
				if total != 0 {
					t.Fatalf("unexpected matches: %+v", rows)
				}
				return
			}
			if total != 1 || len(rows) != 1 || rows[0].ID != tc.want {
				t.Fatalf("wrong material/product binding: total=%d rows=%+v", total, rows)
			}
		})
	}
	rows, total, err := repo.ListPurchaseOrders(ctx, biz.PurchaseOrderFilter{Keyword: "猴子", SupplierID: second.SupplierID, Limit: 10})
	if err != nil || total != 0 || len(rows) != 0 {
		t.Fatalf("supplier filter lost: %v %d", err, total)
	}
	rows, total, err = repo.ListPurchaseOrders(ctx, biz.PurchaseOrderFilter{Keyword: "冻结抱抱", Limit: 1, Offset: 1})
	if err != nil || total != 2 || len(rows) != 1 {
		t.Fatalf("search must precede pagination: %v %d", err, total)
	}
}

func TestBusinessDocumentSearchPostgres(t *testing.T) {
	data, client := openInventoryPostgresTestData(t)
	assertBusinessSearchQueries(t, client)
	assertFrozenPurchaseSearch(t, data)
	assertFinanceProductSearch(t, data)
}

func TestFinanceProductSearchFollowsAllocations(t *testing.T) {
	data, _ := openInventoryRepoTestData(t, "business_finance_search")
	assertFinanceProductSearch(t, data)
}

func assertFinanceProductSearch(t *testing.T, data *Data) {
	t.Helper()
	ctx, client := context.Background(), data.postgres
	customer := client.Customer.Create().SetCode("SEARCH-FIN-C").SetName("搜索核销客户").SaveX(ctx)
	creator := client.AdminUser.Create().SetUsername("search-fin-creator").SetPasswordHash("fixture").SaveX(ctx)
	approver := client.AdminUser.Create().SetUsername("search-fin-approver").SetPasswordHash("fixture").SaveX(ctx)
	poster := client.AdminUser.Create().SetUsername("search-fin-poster").SetPasswordHash("fixture").SaveX(ctx)
	fact := createPostedReceivableFinanceFactFixture(t, ctx, data, client, customer, "SEARCH-AR", 100)
	shipment := client.Shipment.GetX(ctx, *fact.SourceID)
	item := shipment.QueryItems().OnlyX(ctx)
	client.Product.UpdateOneID(item.ProductID).SetStyleNo("Search-Fox-26204").SaveX(ctx)
	repo := NewOperationalFactRepo(data, log.NewStdLogger(io.Discard))
	uc := biz.NewOperationalFactUsecase(repo)
	create := func(no string) *biz.FinancePayment {
		p, err := uc.CreateFinancePayment(ctx, &biz.FinancePaymentCreate{PaymentNo: no, Direction: biz.FinancePaymentDirectionReceipt, CounterpartyType: biz.FinanceCounterpartyCustomer, CounterpartyID: customer.ID, Amount: decimal.NewFromInt(1), Currency: "CNY", AccountRef: "SearchBank", EvidenceRef: no, IdempotencyKey: no}, creator.ID)
		if err != nil {
			t.Fatal(err)
		}
		return p
	}
	payment := create("SEARCH-PAY")
	create("SEARCH-UNALLOCATED")
	payment = approveFinancePaymentForRepoTest(t, ctx, client, payment.ID, approver.ID)
	_, err := repo.postFinancePayment(ctx, &biz.FinancePaymentPost{ID: payment.ID, ExpectedVersion: payment.Version, Allocations: []biz.FinancePaymentAllocationInput{{FinanceFactID: fact.ID, Amount: decimal.NewFromInt(1)}}}, poster.ID, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	credit, err := uc.CreateFinanceCreditNote(ctx, &biz.FinanceCreditNoteCreate{CreditNoteNo: "SEARCH-CREDIT", FinanceFactID: fact.ID, Amount: decimal.NewFromInt(1), Reason: "搜索关联验证", IdempotencyKey: "SEARCH-CREDIT"}, creator.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, keyword := range []string{"search-fox-26204", shipment.ShipmentNo} {
		payments, total, err := uc.ListFinancePayments(ctx, biz.FinancePaymentFilter{Keyword: keyword})
		if err != nil || total != 1 || len(payments) != 1 || payments[0].ID != payment.ID {
			t.Fatalf("allocation search %q: total=%d err=%v", keyword, total, err)
		}
		credits, total, err := uc.ListFinanceCreditNotes(ctx, biz.FinanceCreditNoteFilter{Keyword: keyword})
		if err != nil || total != 1 || len(credits) != 1 || credits[0].ID != credit.ID {
			t.Fatalf("credit search %q: total=%d err=%v", keyword, total, err)
		}
		facts, total, err := uc.ListFinanceFacts(ctx, biz.OperationalFactFilter{Keyword: keyword, Limit: 10})
		if err != nil || total != 1 || len(facts) != 1 || facts[0].ID != fact.ID {
			t.Fatalf("finance search %q: total=%d err=%v", keyword, total, err)
		}
	}
	payments, total, err := uc.ListFinancePayments(ctx, biz.FinancePaymentFilter{Keyword: "搜索核销客户"})
	if err != nil || total != 2 || len(payments) != 2 {
		t.Fatalf("counterparty search: total=%d err=%v", total, err)
	}
	_, total, err = uc.ListFinancePayments(ctx, biz.FinancePaymentFilter{Keyword: "search-fox-26204", Status: biz.FinancePaymentStatusDraft})
	if err != nil || total != 0 {
		t.Fatalf("status filter lost: total=%d err=%v", total, err)
	}
}

func TestProductionAndStockSearchUsesLinkedIdentity(t *testing.T) {
	ctx := context.Background()
	f := openProductionOrderRepoTest(t, "business_production_search")
	f.client.Product.UpdateOneID(f.productID).SetStyleNo("Mo-26204").SaveX(ctx)
	order, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: f.draft("SEARCH-MO", 10), ActorID: f.actorID, IdempotencyKey: "search-mo"})
	if err != nil {
		t.Fatal(err)
	}
	for _, keyword := range []string{"mo-26204", "POR-P", "POR-SO", "POR-C"} {
		rows, total, err := f.uc.List(ctx, biz.ProductionOrderFilter{Keyword: keyword, Limit: 10})
		if err != nil || total != 1 || len(rows) != 1 || rows[0].ID != order.Order.ID {
			t.Fatalf("production %q: total=%d err=%v", keyword, total, err)
		}
	}
	warehouse := createTestProductWarehouse(t, ctx, f.client, "SEARCH-WAREHOUSE")
	materialWarehouse := createTestWarehouse(t, ctx, f.client, "SEARCH-MATERIAL-WH")
	bomPart := f.client.BOMHeader.GetX(ctx, f.bomID).QueryItems().OnlyX(ctx)
	createRequirement := func(target *biz.ProductionOrderAggregate) *ent.ProductionOrderMaterialRequirement {
		return f.client.ProductionOrderMaterialRequirement.Create().
			SetProductionOrderID(target.Order.ID).SetProductionOrderItemID(target.Items[0].ID).
			SetBomHeaderID(f.bomID).SetBomItemID(bomPart.ID).SetMaterialID(f.materialID).SetUnitID(f.unitID).
			SetUnitQuantitySnapshot(decimal.NewFromInt(2)).SetLossRateSnapshot(decimal.Zero).SetPlannedQuantity(decimal.NewFromInt(20)).
			SetMaterialCodeSnapshot("POR-M").SetMaterialNameSnapshot("材料").SetUnitCodeSnapshot("POR-U").SetUnitNameSnapshot("件").SaveX(ctx)
	}
	spare, err := f.uc.CreateDraft(ctx, &biz.ProductionOrderCreate{Draft: f.draft("SEARCH-SPARE", 10), ActorID: f.actorID, IdempotencyKey: "search-spare"})
	if err != nil {
		t.Fatal(err)
	}
	createRequirement(spare)
	requirement := createRequirement(order)
	if requirement.ID == order.Items[0].ID {
		t.Fatal("fixture must distinguish requirement and order item IDs")
	}

	f.client.ProductionFact.Create().SetFactNo("SEARCH-ISSUE").SetFactType(biz.ProductionFactMaterialIssue).
		SetSubjectType("MATERIAL").SetSubjectID(f.materialID).SetWarehouseID(materialWarehouse.ID).SetUnitID(f.unitID).
		SetQuantity(decimal.NewFromInt(1)).SetSourceType(biz.ProductionOrderSourceType).SetSourceID(order.Order.ID).
		SetSourceLineID(requirement.ID).SetIdempotencyKey("search-issue").SaveX(ctx)
	for _, keyword := range []string{"mo-26204", "POR-SO"} {
		count, err := f.client.ProductionFact.Query().Where(businessDocumentKeyword("production_fact", keyword)).Count(ctx)
		if err != nil || count != 1 {
			t.Fatalf("material issue must follow requirement to product: %q %d %v", keyword, count, err)
		}
	}
	lot := f.client.InventoryLot.Create().SetSubjectType("PRODUCT").SetSubjectID(f.productID).SetLotNo("SEARCH-LOT").SaveX(ctx)
	f.client.InventoryBalance.Create().SetSubjectType("PRODUCT").SetSubjectID(f.productID).SetWarehouseID(warehouse.ID).SetUnitID(f.unitID).SetLotID(lot.ID).SetQuantity(decimal.NewFromInt(2)).SaveX(ctx)
	for _, keyword := range []string{"mo-26204", "POR-P"} {
		count, err := f.client.InventoryBalance.Query().Where(businessDocumentKeyword("balance", keyword)).Count(ctx)
		if err != nil || count != 1 {
			t.Fatalf("stock %q: count=%d err=%v", keyword, count, err)
		}
		count, err = f.client.InventoryLot.Query().Where(businessDocumentKeyword("lot", keyword)).Count(ctx)
		if err != nil || count != 1 {
			t.Fatalf("lot %q: count=%d err=%v", keyword, count, err)
		}
	}
	count, err := f.client.InventoryBalance.Query().Where(businessDocumentKeyword("balance", "POR-M")).Count(ctx)
	if err != nil || count != 0 {
		t.Fatalf("a product's BOM material is not its stock identity: %d %v", count, err)
	}
}
