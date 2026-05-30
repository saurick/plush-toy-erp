package data

import (
	"context"
	"errors"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/contact"
	"server/internal/data/model/ent/enttest"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
	_ "github.com/mattn/go-sqlite3"
)

func openMasterDataRepoTest(t *testing.T, name string) (*biz.MasterDataUsecase, *ent.Client) {
	t.Helper()
	client := enttest.Open(t, dialect.SQLite, "file:"+name+"?mode=memory&cache=shared&_fk=1")
	repo := NewMasterDataRepo(&Data{postgres: client}, log.NewStdLogger(io.Discard))
	return biz.NewMasterDataUsecase(repo), client
}

func TestMasterDataRepoCustomerSupplierCRUD(t *testing.T) {
	ctx := context.Background()
	uc, client := openMasterDataRepoTest(t, "masterdata_repo_crud")
	defer mustCloseEntClient(t, client)

	shortName := "成品客户"
	customer, err := uc.CreateCustomer(ctx, &biz.CustomerMutation{
		Code:      "C-001",
		Name:      "测试客户",
		ShortName: &shortName,
	})
	if err != nil {
		t.Fatalf("create customer failed: %v", err)
	}
	if _, err := uc.CreateCustomer(ctx, &biz.CustomerMutation{Code: "C-001", Name: "重复客户"}); !ent.IsConstraintError(err) {
		t.Fatalf("expected duplicate customer code rejected, got %v", err)
	}
	updatedCustomer, err := uc.UpdateCustomer(ctx, customer.ID, &biz.CustomerMutation{Code: "C-001-A", Name: "测试客户A"})
	if err != nil {
		t.Fatalf("update customer failed: %v", err)
	}
	if updatedCustomer.ShortName != nil {
		t.Fatalf("expected customer short_name cleared, got %q", *updatedCustomer.ShortName)
	}
	disabledCustomer, err := uc.SetCustomerActive(ctx, customer.ID, false)
	if err != nil {
		t.Fatalf("disable customer failed: %v", err)
	}
	if disabledCustomer.IsActive {
		t.Fatalf("expected customer inactive")
	}
	customers, total, err := uc.ListCustomers(ctx, biz.MasterDataFilter{Keyword: "客户", Limit: 20})
	if err != nil {
		t.Fatalf("list customers failed: %v", err)
	}
	if total != 1 || len(customers) != 1 {
		t.Fatalf("expected one customer, total=%d len=%d", total, len(customers))
	}
	activeCustomers, activeTotal, err := uc.ListCustomers(ctx, biz.MasterDataFilter{ActiveOnly: true})
	if err != nil {
		t.Fatalf("list active customers failed: %v", err)
	}
	if activeTotal != 0 || len(activeCustomers) != 0 {
		t.Fatalf("expected inactive customer filtered out, total=%d len=%d", activeTotal, len(activeCustomers))
	}

	supplierType := "material"
	supplier, err := uc.CreateSupplier(ctx, &biz.SupplierMutation{
		Code:         "S-001",
		Name:         "测试供应商",
		SupplierType: &supplierType,
	})
	if err != nil {
		t.Fatalf("create supplier failed: %v", err)
	}
	if _, err := uc.CreateSupplier(ctx, &biz.SupplierMutation{Code: "S-001", Name: "重复供应商"}); !ent.IsConstraintError(err) {
		t.Fatalf("expected duplicate supplier code rejected, got %v", err)
	}
	loadedSupplier, err := uc.GetSupplier(ctx, supplier.ID)
	if err != nil {
		t.Fatalf("get supplier failed: %v", err)
	}
	if loadedSupplier.SupplierType == nil || *loadedSupplier.SupplierType != supplierType {
		t.Fatalf("expected supplier type %s, got %#v", supplierType, loadedSupplier.SupplierType)
	}
	if _, err := uc.SetSupplierActive(ctx, supplier.ID, false); err != nil {
		t.Fatalf("disable supplier failed: %v", err)
	}
	if _, err := uc.UpdateSupplier(ctx, 999999, &biz.SupplierMutation{Code: "S-X", Name: "不存在"}); !errors.Is(err, biz.ErrSupplierNotFound) {
		t.Fatalf("expected missing supplier update rejected, got %v", err)
	}
}

func TestMasterDataRepoContactOwnerGuardAndPrimaryStrategy(t *testing.T) {
	ctx := context.Background()
	uc, client := openMasterDataRepoTest(t, "masterdata_repo_contacts")
	defer mustCloseEntClient(t, client)

	customer, err := uc.CreateCustomer(ctx, &biz.CustomerMutation{Code: "C-001", Name: "测试客户"})
	if err != nil {
		t.Fatalf("create customer failed: %v", err)
	}
	supplier, err := uc.CreateSupplier(ctx, &biz.SupplierMutation{Code: "S-001", Name: "测试供应商"})
	if err != nil {
		t.Fatalf("create supplier failed: %v", err)
	}

	first, err := uc.CreateContact(ctx, &biz.ContactMutation{
		OwnerType: biz.ContactOwnerCustomer,
		OwnerID:   customer.ID,
		Name:      "客户主联系人1",
		IsPrimary: true,
	})
	if err != nil {
		t.Fatalf("create primary customer contact failed: %v", err)
	}
	second, err := uc.CreateContact(ctx, &biz.ContactMutation{
		OwnerType: biz.ContactOwnerCustomer,
		OwnerID:   customer.ID,
		Name:      "客户主联系人2",
		IsPrimary: true,
	})
	if err != nil {
		t.Fatalf("create second primary customer contact failed: %v", err)
	}
	reloadedFirst, err := uc.GetContact(ctx, first.ID)
	if err != nil {
		t.Fatalf("reload first contact failed: %v", err)
	}
	if reloadedFirst.IsPrimary {
		t.Fatalf("expected first primary contact unset after second primary created")
	}
	if !second.IsPrimary {
		t.Fatalf("expected second contact primary")
	}
	primaryCount, err := client.Contact.Query().
		Where(contact.OwnerType(biz.ContactOwnerCustomer), contact.OwnerID(customer.ID), contact.IsPrimary(true)).
		Count(ctx)
	if err != nil {
		t.Fatalf("count primary contacts failed: %v", err)
	}
	if primaryCount != 1 {
		t.Fatalf("expected exactly one primary contact, got %d", primaryCount)
	}

	supplierContact, err := uc.CreateContact(ctx, &biz.ContactMutation{
		OwnerType: biz.ContactOwnerSupplier,
		OwnerID:   supplier.ID,
		Name:      "供应商联系人",
		IsPrimary: true,
	})
	if err != nil {
		t.Fatalf("create supplier contact failed: %v", err)
	}
	if supplierContact.OwnerType != biz.ContactOwnerSupplier || supplierContact.OwnerID != supplier.ID {
		t.Fatalf("expected supplier contact owner retained, got %#v", supplierContact)
	}

	if _, err := uc.CreateContact(ctx, &biz.ContactMutation{
		OwnerType: biz.ContactOwnerCustomer,
		OwnerID:   999999,
		Name:      "不存在客户联系人",
	}); !errors.Is(err, biz.ErrCustomerNotFound) {
		t.Fatalf("expected missing customer rejected, got %v", err)
	}
	if _, err := uc.CreateContact(ctx, &biz.ContactMutation{
		OwnerType: biz.ContactOwnerSupplier,
		OwnerID:   999999,
		Name:      "不存在供应商联系人",
	}); !errors.Is(err, biz.ErrSupplierNotFound) {
		t.Fatalf("expected missing supplier rejected, got %v", err)
	}
	if _, err := uc.CreateContact(ctx, &biz.ContactMutation{
		OwnerType: "PARTNER",
		OwnerID:   customer.ID,
		Name:      "非法联系人",
	}); !errors.Is(err, biz.ErrBadParam) {
		t.Fatalf("expected illegal owner type rejected, got %v", err)
	}

	list, total, err := uc.ListContactsByOwner(ctx, biz.ContactFilter{
		OwnerType: biz.ContactOwnerCustomer,
		OwnerID:   customer.ID,
	})
	if err != nil {
		t.Fatalf("list customer contacts failed: %v", err)
	}
	if total != 2 || len(list) != 2 || !list[0].IsPrimary {
		t.Fatalf("expected primary contact first, total=%d rows=%#v", total, list)
	}

	promoted, err := uc.SetPrimaryContact(ctx, first.ID)
	if err != nil {
		t.Fatalf("set primary contact failed: %v", err)
	}
	if !promoted.IsPrimary {
		t.Fatalf("expected promoted contact primary")
	}
	reloadedSecond, err := uc.GetContact(ctx, second.ID)
	if err != nil {
		t.Fatalf("reload second contact failed: %v", err)
	}
	if reloadedSecond.IsPrimary {
		t.Fatalf("expected second contact unset after first promoted")
	}
	disabled, err := uc.DisableContact(ctx, first.ID)
	if err != nil {
		t.Fatalf("disable contact failed: %v", err)
	}
	if disabled.IsActive || disabled.IsPrimary {
		t.Fatalf("expected disabled contact inactive and not primary, got %#v", disabled)
	}
}
