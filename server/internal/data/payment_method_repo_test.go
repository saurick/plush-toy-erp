package data

import (
	"context"
	"errors"
	"fmt"
	"io"
	"reflect"
	"sort"
	"sync"
	"testing"
	"time"

	"github.com/go-kratos/kratos/v2/log"
	"server/internal/biz"
	"server/internal/data/model/ent/paymentmethodpreference"
	"server/internal/data/model/ent/runtimeauditevent"
)

func TestPaymentMethodSuggestionsReadPersistedDistinctAuthorizedNames(t *testing.T) {
	fixture, cleanup := newBusinessAttachmentRepoTest(t, "payment_method_suggestions")
	defer cleanup()
	ctx := context.Background()
	client := fixture.data.postgres
	supplier := client.Supplier.Create().SetCode("PAY-SUP").SetName("模拟供应商").SetDefaultPaymentMethod(" 银行转账 ").SaveX(ctx)
	customer := client.Customer.Create().SetCode("PAY-CUS").SetName("模拟客户").SetDefaultPaymentMethod("客户专用").SaveX(ctx)
	client.Supplier.Create().SetCode("PAY-EMPTY").SetName("模拟空值").SetDefaultPaymentMethod(" ").SaveX(ctx)
	client.SalesOrder.Create().SetOrderNo("PAY-SALES").SetCustomerID(customer.ID).SetOrderDate(time.Now()).SetPaymentMethod("销售专用").SaveX(ctx)
	client.PurchaseOrder.Create().SetPurchaseOrderNo("PAY-PO").SetSupplierID(supplier.ID).SetPurchaseDate(time.Now()).SetPaymentMethod("银行转账").SaveX(ctx)
	client.PurchaseOrder.Create().SetPurchaseOrderNo("PAY-LITERAL").SetSupplierID(supplier.ID).SetPurchaseDate(time.Now()).SetPaymentMethod("票据%_特约").SaveX(ctx)
	uc := biz.NewMasterDataUsecase(NewMasterDataRepo(fixture.data, log.NewStdLogger(io.Discard)))
	for _, tc := range []struct {
		filter biz.PaymentMethodFilter
		want   []string
	}{
		{biz.PaymentMethodFilter{Suppliers: true}, []string{"现金", "银行承兑", "银行转账"}},
		{biz.PaymentMethodFilter{Customers: true}, []string{"客户专用", "现金", "银行承兑", "银行转账"}},
		{biz.PaymentMethodFilter{SalesOrders: true}, []string{"现金", "银行承兑", "银行转账", "销售专用"}},
		{biz.PaymentMethodFilter{Suppliers: true, PurchaseOrders: true, Keyword: "银行转"}, []string{"银行转账"}},
		{biz.PaymentMethodFilter{PurchaseOrders: true, Keyword: "%_"}, []string{"票据%_特约"}},
	} {
		sort.Strings(tc.want)
		got, err := uc.ListPaymentMethods(ctx, tc.filter)
		if err != nil || got.HasMore || !reflect.DeepEqual(got.Methods, tc.want) {
			t.Fatalf("filter=%+v got=%+v err=%v", tc.filter, got, err)
		}
	}
	method := "商业承兑"
	_, err := uc.UpdateSupplier(ctx, supplier.ID, &biz.SupplierMutation{Code: supplier.Code, Name: supplier.Name, DefaultPaymentTermDays: 60, DefaultPaymentMethod: &method})
	if err != nil {
		t.Fatal(err)
	}
	got, err := uc.ListPaymentMethods(ctx, biz.PaymentMethodFilter{Suppliers: true, Keyword: method})
	if err != nil || !reflect.DeepEqual(got.Methods, []string{method}) {
		t.Fatalf("successful save missing: %+v %v", got, err)
	}
	canceled, cancel := context.WithCancel(ctx)
	cancel()
	if _, err := uc.ListPaymentMethods(canceled, biz.PaymentMethodFilter{Suppliers: true}); !errors.Is(err, context.Canceled) {
		t.Fatalf("canceled query: %v", err)
	}
	for i := 0; i < 55; i++ {
		client.Supplier.Create().SetCode(fmt.Sprintf("PAY-%02d", i)).SetName("模拟候选").SetDefaultPaymentMethod(fmt.Sprintf("方式%02d", i)).SaveX(ctx)
	}
	got, err = uc.ListPaymentMethods(ctx, biz.PaymentMethodFilter{Suppliers: true, Keyword: "方式"})
	if err != nil || !got.HasMore || len(got.Methods) != 50 {
		t.Fatalf("unbounded query: %+v %v", got, err)
	}
	got, err = uc.ListPaymentMethods(ctx, biz.PaymentMethodFilter{Suppliers: true, Keyword: "方式54"})
	if err != nil || got.HasMore || !reflect.DeepEqual(got.Methods, []string{"方式54"}) {
		t.Fatalf("keyword beyond first page: %+v %v", got, err)
	}
}

func TestPaymentMethodRecommendationPreservesRecordsAndAuditsAtomically(t *testing.T) {
	fixture, cleanup := newBusinessAttachmentRepoTest(t, "payment_method_recommendation")
	defer cleanup()
	ctx := context.Background()
	client := fixture.data.postgres
	repo := NewMasterDataRepo(fixture.data, log.NewStdLogger(io.Discard))
	uc := biz.NewMasterDataUsecase(repo)
	actor := &biz.AdminUser{ID: 5, Username: "manager"}
	customer := client.Customer.Create().SetCode("PM-C").SetName("模拟客户").SetDefaultPaymentMethod("aa").SetDefaultPaymentTermDays(30).SaveX(ctx)
	supplier := client.Supplier.Create().SetCode("PM-S").SetName("模拟供应商").SetDefaultPaymentMethod(" aa ").SaveX(ctx)
	order := client.SalesOrder.Create().SetOrderNo("PM-ORDER").SetCustomerID(customer.ID).SetOrderDate(time.Now()).SetPaymentMethod("aa").SetPaymentTermDays(30).SetLifecycleStatus(biz.SalesOrderStatusActive).SaveX(ctx)
	hidden, err := uc.SetPaymentMethodRecommendation(ctx, actor, biz.PaymentMethodRecommendationChange{Method: " aa "})
	if err != nil || hidden.Version != 1 || hidden.IsRecommended {
		t.Fatalf("hide: %+v %v", hidden, err)
	}
	got, err := uc.ListPaymentMethods(ctx, biz.PaymentMethodFilter{Suppliers: true, Keyword: "aa"})
	if err != nil || len(got.Methods) != 0 || !got.KeywordNotRecommended {
		t.Fatalf("hidden candidate leaked: %+v %v", got, err)
	}
	client.Supplier.UpdateOneID(supplier.ID).SetDefaultPaymentMethod("aa").SaveX(ctx)
	got, _ = uc.ListPaymentMethods(ctx, biz.PaymentMethodFilter{Suppliers: true, Keyword: "aa"})
	if len(got.Methods) != 0 {
		t.Fatal("saving hidden name restored recommendations")
	}
	stored := client.SalesOrder.GetX(ctx, order.ID)
	if *stored.PaymentMethod != "aa" || *stored.PaymentTermDays != 30 || stored.LifecycleStatus != biz.SalesOrderStatusActive || *client.Customer.GetX(ctx, customer.ID).DefaultPaymentMethod != "aa" {
		t.Fatal("recommendation change rewrote source records")
	}
	items, more, err := uc.ListPaymentMethodRecommendations(ctx, biz.PaymentMethodRecommendationFilter{IsRecommended: false})
	if err != nil || more || len(items) != 1 || items[0].Method != "aa" {
		t.Fatalf("hidden management list: %+v %v %v", items, more, err)
	}
	restored, err := uc.SetPaymentMethodRecommendation(ctx, actor, biz.PaymentMethodRecommendationChange{Method: "aa", IsRecommended: true, ExpectedVersion: 1})
	if err != nil || restored.Version != 2 {
		t.Fatalf("restore: %+v %v", restored, err)
	}
	if _, err := uc.SetPaymentMethodRecommendation(ctx, actor, biz.PaymentMethodRecommendationChange{Method: "aa", ExpectedVersion: 1}); !errors.Is(err, biz.ErrPaymentMethodVersionConflict) {
		t.Fatal("stale undo overwrote a newer change")
	}
	if _, err := uc.SetPaymentMethodRecommendation(ctx, actor, biz.PaymentMethodRecommendationChange{Method: "aa", IsRecommended: true, ExpectedVersion: 2}); err != nil {
		t.Fatal(err)
	}
	if client.RuntimeAuditEvent.Query().Where(runtimeauditevent.EventKey("payment_method.recommendation.set")).CountX(ctx) != 2 {
		t.Fatal("audit missing or no-op duplicated audit")
	}
	event := client.RuntimeAuditEvent.Query().Where(runtimeauditevent.EventKey("payment_method.recommendation.set")).FirstX(ctx)
	if event.Payload == "{}" {
		t.Fatal("missing audit payload")
	}
	if _, err := repo.SetPaymentMethodRecommendation(ctx, biz.PaymentMethodRecommendationChange{Method: "现金"}, nil); err == nil {
		t.Fatal("audit failure accepted")
	}
	if client.PaymentMethodPreference.Query().Where(paymentmethodpreference.Method("现金")).ExistX(ctx) {
		t.Fatal("audit failure left preference write")
	}
	if _, err := uc.SetPaymentMethodRecommendation(ctx, actor, biz.PaymentMethodRecommendationChange{Method: "未保存的名字"}); !errors.Is(err, biz.ErrPaymentMethodNotFound) {
		t.Fatalf("unsaved candidate accepted: %v", err)
	}
	if _, err := uc.SetPaymentMethodRecommendation(ctx, actor, biz.PaymentMethodRecommendationChange{Method: "银行转账"}); err != nil {
		t.Fatal(err)
	}
	got, err = uc.ListPaymentMethods(ctx, biz.PaymentMethodFilter{Customers: true, Keyword: "银行转账"})
	if err != nil || len(got.Methods) != 0 || !got.KeywordNotRecommended {
		t.Fatalf("server default reappeared: %+v %v", got, err)
	}
}

func TestPaymentMethodRecommendationRestoreSurvivesSourceCorrection(t *testing.T) {
	fixture, cleanup := newBusinessAttachmentRepoTest(t, "payment_method_restore_source")
	defer cleanup()
	ctx := context.Background()
	client := fixture.data.postgres
	supplier := client.Supplier.Create().SetCode("PM-RESTORE").SetName("模拟供应商").SetDefaultPaymentMethod("曾用方式").SaveX(ctx)
	uc := biz.NewMasterDataUsecase(NewMasterDataRepo(fixture.data, log.NewStdLogger(io.Discard)))
	actor := &biz.AdminUser{ID: 5, Username: "manager"}
	if _, err := uc.SetPaymentMethodRecommendation(ctx, actor, biz.PaymentMethodRecommendationChange{Method: "曾用方式"}); err != nil {
		t.Fatal(err)
	}
	client.Supplier.UpdateOneID(supplier.ID).ClearDefaultPaymentMethod().SaveX(ctx)
	items, _, err := uc.ListPaymentMethodRecommendations(ctx, biz.PaymentMethodRecommendationFilter{IsRecommended: false, Keyword: "曾用方式"})
	if err != nil || len(items) != 1 {
		t.Fatalf("source correction lost recoverable candidate: %+v %v", items, err)
	}
	if _, err := uc.SetPaymentMethodRecommendation(ctx, actor, biz.PaymentMethodRecommendationChange{Method: "曾用方式", IsRecommended: true, ExpectedVersion: 1}); err != nil {
		t.Fatal(err)
	}
	got, err := uc.ListPaymentMethods(ctx, biz.PaymentMethodFilter{Customers: true, Keyword: "曾用方式"})
	if err != nil || !reflect.DeepEqual(got.Methods, []string{"曾用方式"}) {
		t.Fatalf("explicit company restoration missing: %+v %v", got, err)
	}
	if client.Supplier.GetX(ctx, supplier.ID).DefaultPaymentMethod != nil {
		t.Fatal("restoration rewrote the corrected source")
	}
}

func TestPaymentMethodRecommendationFiltersBeforeLimitAndPagesManagement(t *testing.T) {
	fixture, cleanup := newBusinessAttachmentRepoTest(t, "payment_method_paging")
	defer cleanup()
	ctx := context.Background()
	client := fixture.data.postgres
	uc := biz.NewMasterDataUsecase(NewMasterDataRepo(fixture.data, log.NewStdLogger(io.Discard)))
	for i := 0; i < 56; i++ {
		name := fmt.Sprintf("方案%02d", i)
		client.Supplier.Create().SetCode(fmt.Sprintf("PM-P-%02d", i)).SetName("模拟候选").SetDefaultPaymentMethod(name).SaveX(ctx)
		if i < 6 {
			client.PaymentMethodPreference.Create().SetMethod(name).SetIsRecommended(false).SaveX(ctx)
		}
	}
	got, err := uc.ListPaymentMethods(ctx, biz.PaymentMethodFilter{Suppliers: true, Keyword: "方案"})
	if err != nil || got.HasMore || len(got.Methods) != 50 || got.Methods[0] != "方案06" || got.Methods[49] != "方案55" {
		t.Fatalf("suppression applied after limit: %+v %v", got, err)
	}
	first, more, err := uc.ListPaymentMethodRecommendations(ctx, biz.PaymentMethodRecommendationFilter{Keyword: "方案", IsRecommended: false, Limit: 3})
	if err != nil || !more || len(first) != 3 {
		t.Fatalf("management first page: %+v %v %v", first, more, err)
	}
	second, more, err := uc.ListPaymentMethodRecommendations(ctx, biz.PaymentMethodRecommendationFilter{Keyword: "方案", IsRecommended: false, Limit: 3, Offset: 3})
	if err != nil || more || len(second) != 3 || first[2].Method == second[0].Method {
		t.Fatalf("management next page: %+v %v %v", second, more, err)
	}
}

func TestPaymentMethodPostgresConcurrentChangesAndAudit(t *testing.T) {
	data, client := openInventoryPostgresTestData(t)
	ctx := context.Background()
	suffix := postgresTestSuffix()
	name := "并发付款" + suffix
	supplier := client.Supplier.Create().SetCode("PM-PG-" + suffix).SetName("模拟候选").SetDefaultPaymentMethod(name).SaveX(ctx)
	uc := biz.NewMasterDataUsecase(NewMasterDataRepo(data, log.NewStdLogger(io.Discard)))
	actor := &biz.AdminUser{ID: 8, Username: "manager"}
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := uc.SetPaymentMethodRecommendation(ctx, actor, biz.PaymentMethodRecommendationChange{Method: name})
			results <- err
		}()
	}
	wg.Wait()
	close(results)
	wins, conflicts := 0, 0
	for err := range results {
		if err == nil {
			wins++
		} else if errors.Is(err, biz.ErrPaymentMethodVersionConflict) {
			conflicts++
		} else {
			t.Fatal(err)
		}
	}
	if wins != 1 || conflicts != 1 {
		t.Fatalf("concurrent hide: wins=%d conflicts=%d", wins, conflicts)
	}
	row := client.PaymentMethodPreference.Query().Where(paymentmethodpreference.Method(name)).OnlyX(ctx)
	if row.IsRecommended || row.Version != 1 {
		t.Fatalf("concurrent preference: %+v", row)
	}
	if _, err := uc.SetPaymentMethodRecommendation(ctx, actor, biz.PaymentMethodRecommendationChange{Method: name, IsRecommended: true, ExpectedVersion: 1}); err != nil {
		t.Fatal(err)
	}
	if _, err := uc.SetPaymentMethodRecommendation(ctx, actor, biz.PaymentMethodRecommendationChange{Method: name, ExpectedVersion: 1}); !errors.Is(err, biz.ErrPaymentMethodVersionConflict) {
		t.Fatal("stale recommendation change accepted")
	}
	if _, err := NewMasterDataRepo(data, log.NewStdLogger(io.Discard)).SetPaymentMethodRecommendation(ctx, biz.PaymentMethodRecommendationChange{Method: name, ExpectedVersion: 2}, nil); err == nil {
		t.Fatal("missing audit accepted")
	}
	row = client.PaymentMethodPreference.Query().Where(paymentmethodpreference.Method(name)).OnlyX(ctx)
	if !row.IsRecommended || row.Version != 2 {
		t.Fatal("audit failure was not atomic")
	}
	client.Supplier.UpdateOneID(supplier.ID).ClearDefaultPaymentMethod().SaveX(ctx)
	got, err := uc.ListPaymentMethods(ctx, biz.PaymentMethodFilter{Customers: true, Keyword: name})
	if err != nil || !reflect.DeepEqual(got.Methods, []string{name}) {
		t.Fatalf("restored PG suggestions: %+v %v", got, err)
	}
}
