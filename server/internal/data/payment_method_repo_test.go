package data

import (
	"context"
	"errors"
	"fmt"
	"github.com/go-kratos/kratos/v2/log"
	"io"
	"reflect"
	"server/internal/biz"
	"server/internal/data/model/ent/paymentmethodpreference"
	"server/internal/data/model/ent/runtimeauditevent"
	"sync"
	"testing"
	"time"
)

func TestPaymentMethodCatalogueSearchOnlyPublishesMaintainedChoices(t *testing.T) {
	fixture, cleanup := newBusinessAttachmentRepoTest(t, "payment_catalogue_search")
	defer cleanup()
	ctx := context.Background()
	client := fixture.data.postgres
	uc := biz.NewMasterDataUsecase(NewMasterDataRepo(fixture.data, log.NewStdLogger(io.Discard)))
	actor := &biz.AdminUser{ID: 5, Username: "manager"}
	client.Supplier.Create().SetCode("PM-FREE").SetName("模拟供应商").SetDefaultPaymentMethod("错别字").SaveX(ctx)
	got, err := uc.ListPaymentMethods(ctx, biz.PaymentMethodFilter{})
	if err != nil || len(got.Methods) != 0 {
		t.Fatalf("history published itself: %+v %v", got, err)
	}
	created, err := uc.CreatePaymentMethod(ctx, actor, "票据%_约定")
	if err != nil {
		t.Fatal(err)
	}
	got, err = uc.ListPaymentMethods(ctx, biz.PaymentMethodFilter{Keyword: "%_"})
	if err != nil || !reflect.DeepEqual(got.Methods, []string{created.Method}) {
		t.Fatalf("literal keyword: %+v %v", got, err)
	}
	for i := 0; i < 56; i++ {
		client.PaymentMethodPreference.Create().SetMethod(fmt.Sprintf("方式%02d", i)).SetIsRecommended(i >= 6).SaveX(ctx)
	}
	got, err = uc.ListPaymentMethods(ctx, biz.PaymentMethodFilter{Keyword: "方式"})
	if err != nil || got.HasMore || len(got.Methods) != 50 || got.Methods[0] != "方式06" {
		t.Fatalf("inactive filter or limit: %+v %v", got, err)
	}
	first, more, err := uc.ListPaymentMethodOptions(ctx, biz.PaymentMethodOptionFilter{Keyword: "方式", IsActive: false, Limit: 3})
	if err != nil || !more || len(first) != 3 {
		t.Fatal("first page missing")
	}
	second, more, err := uc.ListPaymentMethodOptions(ctx, biz.PaymentMethodOptionFilter{Keyword: "方式", IsActive: false, Limit: 3, Offset: 3})
	if err != nil || more || len(second) != 3 || first[2].ID == second[0].ID {
		t.Fatal("second page duplicates")
	}
	got, err = uc.ListPaymentMethods(ctx, biz.PaymentMethodFilter{Keyword: "方式00"})
	if err != nil || !got.KeywordExists || !got.KeywordInactive || len(got.Methods) != 0 {
		t.Fatalf("inactive name: %+v %v", got, err)
	}
	canceled, cancel := context.WithCancel(ctx)
	cancel()
	if _, err := uc.ListPaymentMethods(canceled, biz.PaymentMethodFilter{}); !errors.Is(err, context.Canceled) {
		t.Fatal("cancellation lost")
	}
}

func TestPaymentMethodCatalogueLifecyclePreservesSnapshotsAndAuditsAtomically(t *testing.T) {
	fixture, cleanup := newBusinessAttachmentRepoTest(t, "payment_catalogue_lifecycle")
	defer cleanup()
	ctx := context.Background()
	client := fixture.data.postgres
	repo := NewMasterDataRepo(fixture.data, log.NewStdLogger(io.Discard))
	uc := biz.NewMasterDataUsecase(repo)
	actor := &biz.AdminUser{ID: 5, Username: "manager"}
	customer := client.Customer.Create().SetCode("PM-C").SetName("模拟客户").SetDefaultPaymentMethod("银行转账").SetDefaultPaymentTermDays(30).SaveX(ctx)
	order := client.SalesOrder.Create().SetOrderNo("PM-SO").SetCustomerID(customer.ID).SetOrderDate(time.Now()).SetPaymentMethod("银行转账").SetPaymentTermDays(30).SetLifecycleStatus(biz.SalesOrderStatusActive).SaveX(ctx)
	used, err := uc.CreatePaymentMethod(ctx, actor, "银行转账")
	if err != nil || !used.HasBeenUsed {
		t.Fatalf("existing references lost: %+v %v", used, err)
	}
	renamed, err := uc.UpdatePaymentMethod(ctx, actor, biz.PaymentMethodOptionChange{ID: used.ID, Method: "银行汇款", IsActive: true, ExpectedVersion: used.Version})
	if err != nil || !renamed.HasBeenUsed || renamed.Version != 2 {
		t.Fatalf("rename: %+v %v", renamed, err)
	}
	if err := uc.DeletePaymentMethod(ctx, actor, renamed.ID, renamed.Version); !errors.Is(err, biz.ErrPaymentMethodInUse) {
		t.Fatal("renamed used option was deletable")
	}
	if *client.SalesOrder.GetX(ctx, order.ID).PaymentMethod != "银行转账" || *client.Customer.GetX(ctx, customer.ID).DefaultPaymentMethod != "银行转账" {
		t.Fatal("rename rewrote snapshots")
	}
	hidden, err := uc.UpdatePaymentMethod(ctx, actor, biz.PaymentMethodOptionChange{ID: renamed.ID, Method: renamed.Method, ExpectedVersion: renamed.Version})
	if err != nil || hidden.IsActive {
		t.Fatal("disable failed")
	}
	if _, err := uc.UpdatePaymentMethod(ctx, actor, biz.PaymentMethodOptionChange{ID: hidden.ID, Method: hidden.Method, IsActive: true, ExpectedVersion: renamed.Version}); !errors.Is(err, biz.ErrPaymentMethodVersionConflict) {
		t.Fatal("stale restore accepted")
	}
	restored, err := uc.UpdatePaymentMethod(ctx, actor, biz.PaymentMethodOptionChange{ID: hidden.ID, Method: hidden.Method, IsActive: true, ExpectedVersion: hidden.Version})
	if err != nil || !restored.IsActive {
		t.Fatal("restore failed")
	}
	before := client.PaymentMethodPreference.GetX(ctx, restored.ID)
	if _, err := repo.UpdatePaymentMethod(ctx, biz.PaymentMethodOptionChange{ID: restored.ID, Method: "审计失败回滚", IsActive: true, ExpectedVersion: restored.Version}, nil); err == nil {
		t.Fatal("missing audit accepted")
	}
	after := client.PaymentMethodPreference.GetX(ctx, restored.ID)
	if after.Method != before.Method || after.Version != before.Version {
		t.Fatal("audit failure left a partial update")
	}
	unused, err := uc.CreatePaymentMethod(ctx, actor, "Unused")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := uc.CreatePaymentMethod(ctx, actor, " unused "); !errors.Is(err, biz.ErrPaymentMethodExists) {
		t.Fatal("case-insensitive duplicate accepted")
	}
	if err := repo.DeletePaymentMethod(ctx, unused.ID, unused.Version, nil); err == nil {
		t.Fatal("delete without audit succeeded")
	}
	if !client.PaymentMethodPreference.Query().Where(paymentmethodpreference.ID(unused.ID)).ExistX(ctx) {
		t.Fatal("delete audit failure was not atomic")
	}
	if err := uc.DeletePaymentMethod(ctx, actor, unused.ID, unused.Version); err != nil {
		t.Fatal(err)
	}
	got, err := uc.ListPaymentMethods(ctx, biz.PaymentMethodFilter{Keyword: "Unused"})
	if err != nil || len(got.Methods) != 0 {
		t.Fatal("deleted option reappeared")
	}
	if client.RuntimeAuditEvent.Query().Where(runtimeauditevent.EventKey("payment_method.delete")).CountX(ctx) != 1 {
		t.Fatal("delete audit missing")
	}
}

func TestPaymentMethodCatalogueFirstUseRollsBackAndStaysUsedAfterSourceClear(t *testing.T) {
	fixture, cleanup := newBusinessAttachmentRepoTest(t, "payment_catalogue_use")
	defer cleanup()
	ctx := context.Background()
	client := fixture.data.postgres
	uc := biz.NewMasterDataUsecase(NewMasterDataRepo(fixture.data, log.NewStdLogger(io.Discard)))
	actor := &biz.AdminUser{ID: 5, Username: "manager"}
	method, err := uc.CreatePaymentMethod(ctx, actor, "新方式")
	if err != nil {
		t.Fatal(err)
	}
	name := method.Method
	days := 0
	saved, err := uc.CreateCustomer(ctx, &biz.CustomerMutation{Code: "PM-SAVED", Name: "模拟客户", DefaultPaymentMethod: &name, DefaultPaymentTermDays: &days})
	if err != nil {
		t.Fatal(err)
	}
	if !client.PaymentMethodPreference.GetX(ctx, method.ID).HasBeenUsed {
		t.Fatal("business save did not guard use")
	}
	if _, err := uc.UpdateCustomer(ctx, saved.ID, &biz.CustomerMutation{Code: saved.Code, Name: saved.Name}); err != nil {
		t.Fatal(err)
	}
	if err := uc.DeletePaymentMethod(ctx, actor, method.ID, method.Version); !errors.Is(err, biz.ErrPaymentMethodInUse) {
		t.Fatal("source clear made a used option deletable")
	}
	fresh, err := uc.CreatePaymentMethod(ctx, actor, "失败保存方式")
	if err != nil {
		t.Fatal(err)
	}
	name = fresh.Method
	if _, err := uc.CreateCustomer(ctx, &biz.CustomerMutation{Code: saved.Code, Name: "重复编号", DefaultPaymentMethod: &name, DefaultPaymentTermDays: &days}); err == nil {
		t.Fatal("duplicate customer was accepted")
	}
	if client.PaymentMethodPreference.GetX(ctx, fresh.ID).HasBeenUsed {
		t.Fatal("failed business save left lifetime use")
	}
}

func TestPaymentMethodPostgresConcurrentChangesAndAudit(t *testing.T) {
	data, client := openInventoryPostgresTestData(t)
	ctx := context.Background()
	uc := biz.NewMasterDataUsecase(NewMasterDataRepo(data, log.NewStdLogger(io.Discard)))
	actor := &biz.AdminUser{ID: 8, Username: "manager"}
	name := "并发付款" + postgresTestSuffix()
	item, err := uc.CreatePaymentMethod(ctx, actor, name)
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := uc.UpdatePaymentMethod(ctx, actor, biz.PaymentMethodOptionChange{ID: item.ID, Method: item.Method, ExpectedVersion: item.Version})
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
		t.Fatalf("concurrent update wins=%d conflicts=%d", wins, conflicts)
	}
	row := client.PaymentMethodPreference.GetX(ctx, item.ID)
	if row.IsRecommended || row.Version != 2 {
		t.Fatal("concurrent update lost CAS")
	}
	if _, err := NewMasterDataRepo(data, log.NewStdLogger(io.Discard)).UpdatePaymentMethod(ctx, biz.PaymentMethodOptionChange{ID: item.ID, Method: "回滚" + name, IsActive: true, ExpectedVersion: 2}, nil); err == nil {
		t.Fatal("audit failure accepted")
	}
	if client.PaymentMethodPreference.GetX(ctx, item.ID).Method != name {
		t.Fatal("PG audit failure was not atomic")
	}
	// The business writer holds the same lock until commit, so delete must observe first use.
	tx, err := client.Tx(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if err := recordPaymentMethodUse(ctx, tx.Client(), data.sqlDialect, &name); err != nil {
		t.Fatal(err)
	}
	deletion := make(chan error, 1)
	go func() { deletion <- uc.DeletePaymentMethod(ctx, actor, item.ID, 2) }()
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	if err := <-deletion; !errors.Is(err, biz.ErrPaymentMethodInUse) {
		t.Fatalf("first use/delete race: %v", err)
	}
}
