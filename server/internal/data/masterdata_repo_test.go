package data

import (
	"context"
	"errors"
	"io"
	"testing"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/contact"
	"server/internal/data/model/ent/customer"
	"server/internal/data/model/ent/enttest"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
	_ "github.com/mattn/go-sqlite3"
	"github.com/shopspring/decimal"
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
	defaultPaymentMethod := "30天月结"
	defaultPaymentTermDays := 30
	customer, err := uc.CreateCustomer(ctx, &biz.CustomerMutation{
		Code:                   "C-001",
		Name:                   "测试客户",
		ShortName:              &shortName,
		DefaultPaymentMethod:   &defaultPaymentMethod,
		DefaultPaymentTermDays: &defaultPaymentTermDays,
	})
	if err != nil {
		t.Fatalf("create customer failed: %v", err)
	}
	if customer.DefaultPaymentMethod == nil || *customer.DefaultPaymentMethod != defaultPaymentMethod || customer.DefaultPaymentTermDays == nil || *customer.DefaultPaymentTermDays != defaultPaymentTermDays {
		t.Fatalf("expected customer payment defaults retained, got %#v", customer)
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
	if updatedCustomer.DefaultPaymentMethod != nil || updatedCustomer.DefaultPaymentTermDays != nil {
		t.Fatalf("expected customer payment defaults cleared, got %#v", updatedCustomer)
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

func TestMasterDataRepoMaterialCRUDAndUnitGuard(t *testing.T) {
	ctx := context.Background()
	uc, client := openMasterDataRepoTest(t, "masterdata_repo_materials")
	defer mustCloseEntClient(t, client)

	unitRow, err := client.Unit.Create().SetCode("PCS").SetName("个").Save(ctx)
	if err != nil {
		t.Fatalf("create unit failed: %v", err)
	}
	category := "填充"
	spec := "7D"
	color := "白色"
	material, err := uc.CreateMaterial(ctx, &biz.MaterialMutation{
		Code:          "M-001",
		Name:          "PP 棉",
		Category:      &category,
		Spec:          &spec,
		Color:         &color,
		DefaultUnitID: unitRow.ID,
	})
	if err != nil {
		t.Fatalf("create material failed: %v", err)
	}
	if material.DefaultUnitID != unitRow.ID || material.Category == nil || *material.Category != category {
		t.Fatalf("expected material fields retained, got %#v", material)
	}
	if _, err := uc.CreateMaterial(ctx, &biz.MaterialMutation{Code: "M-001", Name: "重复材料", DefaultUnitID: unitRow.ID}); !ent.IsConstraintError(err) {
		t.Fatalf("expected duplicate material code rejected, got %v", err)
	}
	if _, err := uc.CreateMaterial(ctx, &biz.MaterialMutation{Code: "M-002", Name: "缺单位", DefaultUnitID: 999999}); !errors.Is(err, biz.ErrUnitNotFound) {
		t.Fatalf("expected missing unit rejected, got %v", err)
	}

	updated, err := uc.UpdateMaterial(ctx, material.ID, &biz.MaterialMutation{
		Code:          "M-001-A",
		Name:          "PP 棉 A",
		DefaultUnitID: unitRow.ID,
	})
	if err != nil {
		t.Fatalf("update material failed: %v", err)
	}
	if updated.Category != nil || updated.Spec != nil || updated.Color != nil {
		t.Fatalf("expected optional material fields cleared, got %#v", updated)
	}
	if _, err := uc.SetMaterialActive(ctx, material.ID, false); err != nil {
		t.Fatalf("disable material failed: %v", err)
	}
	list, total, err := uc.ListMaterials(ctx, biz.MasterDataFilter{Keyword: "PP", Limit: 20})
	if err != nil {
		t.Fatalf("list materials failed: %v", err)
	}
	if total != 1 || len(list) != 1 {
		t.Fatalf("expected one material, total=%d len=%d", total, len(list))
	}
	activeList, activeTotal, err := uc.ListMaterials(ctx, biz.MasterDataFilter{ActiveOnly: true})
	if err != nil {
		t.Fatalf("list active materials failed: %v", err)
	}
	if activeTotal != 0 || len(activeList) != 0 {
		t.Fatalf("expected inactive material filtered out, total=%d len=%d", activeTotal, len(activeList))
	}
	unitList, unitTotal, err := uc.ListUnits(ctx, biz.MasterDataFilter{Keyword: "PC", ActiveOnly: true, Limit: 20})
	if err != nil {
		t.Fatalf("list units failed: %v", err)
	}
	if unitTotal != 1 || len(unitList) != 1 || unitList[0].Name != "个" {
		t.Fatalf("expected active PCS unit, total=%d list=%#v", unitTotal, unitList)
	}
}

func TestMasterDataRepoProcessCRUD(t *testing.T) {
	ctx := context.Background()
	uc, client := openMasterDataRepoTest(t, "masterdata_repo_processes")
	defer mustCloseEntClient(t, client)

	category := "委外车缝"
	processItem, err := uc.CreateProcess(ctx, &biz.ProcessMutation{
		Code:               "PROC-SEW",
		Name:               "车缝",
		Category:           &category,
		OutsourcingEnabled: true,
		InhouseEnabled:     false,
		QualityRequired:    true,
		SortOrder:          20,
	})
	if err != nil {
		t.Fatalf("create process failed: %v", err)
	}
	if processItem.Category == nil ||
		*processItem.Category != category ||
		!processItem.OutsourcingEnabled ||
		processItem.InhouseEnabled ||
		!processItem.QualityRequired ||
		processItem.SortOrder != 20 {
		t.Fatalf("expected process fields retained, got %#v", processItem)
	}
	if _, err := uc.CreateProcess(ctx, &biz.ProcessMutation{Code: "PROC-SEW", Name: "重复工序"}); !ent.IsConstraintError(err) {
		t.Fatalf("expected duplicate process code rejected, got %v", err)
	}

	note := "可外发也可内制"
	updated, err := uc.UpdateProcess(ctx, processItem.ID, &biz.ProcessMutation{
		Code:               "PROC-SEW-A",
		Name:               "车缝 A",
		OutsourcingEnabled: true,
		InhouseEnabled:     true,
		QualityRequired:    false,
		SortOrder:          10,
		Note:               &note,
	})
	if err != nil {
		t.Fatalf("update process failed: %v", err)
	}
	if updated.Category != nil ||
		!updated.OutsourcingEnabled ||
		!updated.InhouseEnabled ||
		updated.QualityRequired ||
		updated.SortOrder != 10 ||
		updated.Note == nil ||
		*updated.Note != note {
		t.Fatalf("expected process optional fields and flags updated, got %#v", updated)
	}
	if _, err := uc.UpdateProcess(ctx, 999999, &biz.ProcessMutation{Code: "PROC-X", Name: "不存在"}); !errors.Is(err, biz.ErrProcessNotFound) {
		t.Fatalf("expected missing process update rejected, got %v", err)
	}
	if _, err := uc.SetProcessActive(ctx, processItem.ID, false); err != nil {
		t.Fatalf("disable process failed: %v", err)
	}
	list, total, err := uc.ListProcesses(ctx, biz.MasterDataFilter{Keyword: "车缝", Limit: 20})
	if err != nil {
		t.Fatalf("list processes failed: %v", err)
	}
	if total != 1 || len(list) != 1 {
		t.Fatalf("expected one process, total=%d len=%d", total, len(list))
	}
	activeList, activeTotal, err := uc.ListProcesses(ctx, biz.MasterDataFilter{ActiveOnly: true})
	if err != nil {
		t.Fatalf("list active processes failed: %v", err)
	}
	if activeTotal != 0 || len(activeList) != 0 {
		t.Fatalf("expected inactive process filtered out, total=%d len=%d", activeTotal, len(activeList))
	}
}

func TestMasterDataRepoProductCRUDAndUnitGuard(t *testing.T) {
	ctx := context.Background()
	uc, client := openMasterDataRepoTest(t, "masterdata_repo_products")
	defer mustCloseEntClient(t, client)

	unitRow, err := client.Unit.Create().SetCode("PCS").SetName("个").Save(ctx)
	if err != nil {
		t.Fatalf("create unit failed: %v", err)
	}
	styleNo := "BEAR-BASE"
	customerStyleNo := "CUS-BEAR"
	unitNetWeightG := decimal.RequireFromString("0.425")
	product, err := uc.CreateProduct(ctx, &biz.ProductMutation{
		Code:            "P-001",
		Name:            "毛绒熊",
		StyleNo:         &styleNo,
		CustomerStyleNo: &customerStyleNo,
		DefaultUnitID:   unitRow.ID,
		UnitNetWeightG:  &unitNetWeightG,
	})
	if err != nil {
		t.Fatalf("create product failed: %v", err)
	}
	if product.DefaultUnitID != unitRow.ID || product.StyleNo == nil || *product.StyleNo != styleNo || product.UnitNetWeightG == nil || !product.UnitNetWeightG.Equal(unitNetWeightG) {
		t.Fatalf("expected product fields retained, got %#v", product)
	}
	if _, err := uc.CreateProduct(ctx, &biz.ProductMutation{Code: "P-001", Name: "重复产品", DefaultUnitID: unitRow.ID}); !ent.IsConstraintError(err) {
		t.Fatalf("expected duplicate product code rejected, got %v", err)
	}
	if _, err := uc.CreateProduct(ctx, &biz.ProductMutation{Code: "P-002", Name: "缺单位", DefaultUnitID: 999999}); !errors.Is(err, biz.ErrUnitNotFound) {
		t.Fatalf("expected missing unit rejected, got %v", err)
	}

	updatedUnitNetWeightG := decimal.RequireFromString("0.5")
	updated, err := uc.UpdateProduct(ctx, product.ID, &biz.ProductMutation{
		Code:           "P-001-A",
		Name:           "毛绒熊 A",
		DefaultUnitID:  unitRow.ID,
		UnitNetWeightG: &updatedUnitNetWeightG,
	})
	if err != nil {
		t.Fatalf("update product failed: %v", err)
	}
	if updated.StyleNo != nil || updated.CustomerStyleNo != nil || updated.UnitNetWeightG == nil || !updated.UnitNetWeightG.Equal(updatedUnitNetWeightG) {
		t.Fatalf("expected optional product fields cleared, got %#v", updated)
	}
	cleared, err := uc.UpdateProduct(ctx, product.ID, &biz.ProductMutation{
		Code:          "P-001-A",
		Name:          "毛绒熊 A",
		DefaultUnitID: unitRow.ID,
	})
	if err != nil {
		t.Fatalf("clear product unit net weight failed: %v", err)
	}
	if cleared.UnitNetWeightG != nil {
		t.Fatalf("expected product unit net weight cleared, got %#v", cleared.UnitNetWeightG)
	}
	if _, err := uc.SetProductActive(ctx, product.ID, false); err != nil {
		t.Fatalf("disable product failed: %v", err)
	}
	list, total, err := uc.ListProducts(ctx, biz.MasterDataFilter{Keyword: "毛绒", Limit: 20})
	if err != nil {
		t.Fatalf("list products failed: %v", err)
	}
	if total != 1 || len(list) != 1 {
		t.Fatalf("expected one product, total=%d len=%d", total, len(list))
	}
	activeList, activeTotal, err := uc.ListProducts(ctx, biz.MasterDataFilter{ActiveOnly: true})
	if err != nil {
		t.Fatalf("list active products failed: %v", err)
	}
	if activeTotal != 0 || len(activeList) != 0 {
		t.Fatalf("expected inactive product filtered out, total=%d len=%d", activeTotal, len(activeList))
	}
}

func TestMasterDataRepoProductSKUCRUDAndGuards(t *testing.T) {
	ctx := context.Background()
	uc, client := openMasterDataRepoTest(t, "masterdata_repo_product_skus")
	defer mustCloseEntClient(t, client)

	unitRow, err := client.Unit.Create().SetCode("PCS").SetName("个").Save(ctx)
	if err != nil {
		t.Fatalf("create unit failed: %v", err)
	}
	productRow, err := client.Product.Create().
		SetCode("P-001").
		SetName("毛绒熊").
		SetDefaultUnitID(unitRow.ID).
		Save(ctx)
	if err != nil {
		t.Fatalf("create product failed: %v", err)
	}
	skuName := "红色小号"
	color := "红色"
	defaultUnitID := unitRow.ID
	unitNetWeightG := decimal.RequireFromString("0.425000")
	sku, err := uc.CreateProductSKU(ctx, &biz.ProductSKUMutation{
		ProductID:      productRow.ID,
		SKUCode:        "SKU-RED-S",
		SKUName:        &skuName,
		Color:          &color,
		DefaultUnitID:  &defaultUnitID,
		UnitNetWeightG: &unitNetWeightG,
	})
	if err != nil {
		t.Fatalf("create product sku failed: %v", err)
	}
	if sku.ProductID != productRow.ID || sku.SKUName == nil || *sku.SKUName != skuName || sku.UnitNetWeightG == nil || !sku.UnitNetWeightG.Equal(unitNetWeightG) {
		t.Fatalf("expected sku fields retained, got %#v", sku)
	}
	if _, err := uc.CreateProductSKU(ctx, &biz.ProductSKUMutation{ProductID: productRow.ID, SKUCode: "SKU-RED-S"}); !ent.IsConstraintError(err) {
		t.Fatalf("expected duplicate sku code rejected, got %v", err)
	}
	if _, err := uc.CreateProductSKU(ctx, &biz.ProductSKUMutation{ProductID: 999999, SKUCode: "SKU-MISSING"}); !errors.Is(err, biz.ErrProductNotFound) {
		t.Fatalf("expected missing product rejected, got %v", err)
	}

	updated, err := uc.UpdateProductSKU(ctx, sku.ID, &biz.ProductSKUMutation{
		ProductID: productRow.ID,
		SKUCode:   "SKU-RED-S-A",
	})
	if err != nil {
		t.Fatalf("update product sku failed: %v", err)
	}
	if updated.SKUName != nil || updated.Color != nil || updated.DefaultUnitID != nil || updated.UnitNetWeightG != nil {
		t.Fatalf("expected optional sku fields cleared, got %#v", updated)
	}
	if _, err := uc.SetProductSKUActive(ctx, sku.ID, false); err != nil {
		t.Fatalf("disable product sku failed: %v", err)
	}
	list, total, err := uc.ListProductSKUs(ctx, biz.ProductSKUFilter{Keyword: "RED", Limit: 20})
	if err != nil {
		t.Fatalf("list product skus failed: %v", err)
	}
	if total != 1 || len(list) != 1 {
		t.Fatalf("expected one sku, total=%d len=%d", total, len(list))
	}
	activeList, activeTotal, err := uc.ListProductSKUs(ctx, biz.ProductSKUFilter{ActiveOnly: true})
	if err != nil {
		t.Fatalf("list active product skus failed: %v", err)
	}
	if activeTotal != 0 || len(activeList) != 0 {
		t.Fatalf("expected inactive sku filtered out, total=%d len=%d", activeTotal, len(activeList))
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

func TestMasterDataRepoSaveCustomerWithContactsIsAtomic(t *testing.T) {
	ctx := context.Background()
	uc, client := openMasterDataRepoTest(t, "masterdata_repo_customer_contacts_atomic")
	defer mustCloseEntClient(t, client)

	if _, err := uc.SaveCustomerWithContacts(ctx, 0, &biz.CustomerMutation{
		Code: "C-ROLLBACK",
		Name: "应回滚客户",
	}, []*biz.ContactSaveMutation{
		{ContactMutation: biz.ContactMutation{Name: "有效联系人", IsPrimary: true}},
		{ID: 999999, ContactMutation: biz.ContactMutation{Name: "不存在联系人"}},
	}); !errors.Is(err, biz.ErrContactNotFound) {
		t.Fatalf("expected missing contact to reject aggregate save, got %v", err)
	}
	rolledBack, err := client.Customer.Query().
		Where(customer.Code("C-ROLLBACK")).
		Count(ctx)
	if err != nil {
		t.Fatalf("count rolled back customer failed: %v", err)
	}
	if rolledBack != 0 {
		t.Fatalf("expected aggregate failure to rollback customer, got %d rows", rolledBack)
	}

	saved, err := uc.SaveCustomerWithContacts(ctx, 0, &biz.CustomerMutation{
		Code: "C-AGG",
		Name: "聚合客户",
	}, []*biz.ContactSaveMutation{
		{ContactMutation: biz.ContactMutation{Name: "主联系人", IsPrimary: true}},
		{ContactMutation: biz.ContactMutation{Name: "备用联系人"}},
	})
	if err != nil {
		t.Fatalf("save customer with contacts failed: %v", err)
	}
	if saved.Customer == nil || saved.Customer.ID <= 0 || len(saved.Contacts) != 2 {
		t.Fatalf("expected saved customer with two contacts, got %#v", saved)
	}
	if !saved.Contacts[0].IsPrimary {
		t.Fatalf("expected primary contact first, got %#v", saved.Contacts)
	}

	updated, err := uc.SaveCustomerWithContacts(ctx, saved.Customer.ID, &biz.CustomerMutation{
		Code: "C-AGG-A",
		Name: "聚合客户A",
	}, []*biz.ContactSaveMutation{
		{ID: saved.Contacts[1].ID, ContactMutation: biz.ContactMutation{Name: "备用联系人A", IsPrimary: true}},
	})
	if err != nil {
		t.Fatalf("update customer with contacts failed: %v", err)
	}
	if updated.Customer.Code != "C-AGG-A" || len(updated.Contacts) != 1 || updated.Contacts[0].ID != saved.Contacts[1].ID {
		t.Fatalf("expected update to retain only second contact, got %#v", updated)
	}
	disabledFirst, err := uc.GetContact(ctx, saved.Contacts[0].ID)
	if err != nil {
		t.Fatalf("get disabled old contact failed: %v", err)
	}
	if disabledFirst.IsActive || disabledFirst.IsPrimary {
		t.Fatalf("expected omitted contact disabled in same aggregate save, got %#v", disabledFirst)
	}
}
