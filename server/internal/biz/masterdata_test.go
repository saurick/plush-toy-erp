package biz

import (
	"context"
	"errors"
	"testing"
)

type masterDataRepoStub struct {
	customers      map[int]bool
	suppliers      map[int]bool
	products       map[int]bool
	units          map[int]bool
	createdProduct *ProductMutation
	createdProcess *ProcessMutation
	createdSKU     *ProductSKUMutation
	created        *ContactMutation
	updated        *ContactMutation
}

func (s *masterDataRepoStub) CreateCustomer(context.Context, *CustomerMutation) (*Customer, error) {
	return nil, nil
}
func (s *masterDataRepoStub) UpdateCustomer(context.Context, int, *CustomerMutation) (*Customer, error) {
	return nil, nil
}
func (s *masterDataRepoStub) SaveCustomerWithContacts(context.Context, int, *CustomerMutation, []*ContactSaveMutation) (*CustomerWithContacts, error) {
	return nil, nil
}
func (s *masterDataRepoStub) GetCustomer(context.Context, int) (*Customer, error) {
	return nil, nil
}
func (s *masterDataRepoStub) ListCustomers(context.Context, MasterDataFilter) ([]*Customer, int, error) {
	return nil, 0, nil
}
func (s *masterDataRepoStub) SetCustomerActive(context.Context, int, bool) (*Customer, error) {
	return nil, nil
}
func (s *masterDataRepoStub) CustomerExists(_ context.Context, id int) (bool, error) {
	return s.customers[id], nil
}
func (s *masterDataRepoStub) CreateSupplier(context.Context, *SupplierMutation) (*Supplier, error) {
	return nil, nil
}
func (s *masterDataRepoStub) UpdateSupplier(context.Context, int, *SupplierMutation) (*Supplier, error) {
	return nil, nil
}
func (s *masterDataRepoStub) SaveSupplierWithContacts(context.Context, int, *SupplierMutation, []*ContactSaveMutation) (*SupplierWithContacts, error) {
	return nil, nil
}
func (s *masterDataRepoStub) GetSupplier(context.Context, int) (*Supplier, error) {
	return nil, nil
}
func (s *masterDataRepoStub) ListSuppliers(context.Context, MasterDataFilter) ([]*Supplier, int, error) {
	return nil, 0, nil
}
func (s *masterDataRepoStub) SetSupplierActive(context.Context, int, bool) (*Supplier, error) {
	return nil, nil
}
func (s *masterDataRepoStub) SupplierExists(_ context.Context, id int) (bool, error) {
	return s.suppliers[id], nil
}
func (s *masterDataRepoStub) CreateMaterial(context.Context, *MaterialMutation) (*Material, error) {
	return nil, nil
}
func (s *masterDataRepoStub) UpdateMaterial(context.Context, int, *MaterialMutation) (*Material, error) {
	return nil, nil
}
func (s *masterDataRepoStub) GetMaterial(context.Context, int) (*Material, error) {
	return nil, nil
}
func (s *masterDataRepoStub) ListMaterials(context.Context, MasterDataFilter) ([]*Material, int, error) {
	return nil, 0, nil
}
func (s *masterDataRepoStub) SetMaterialActive(context.Context, int, bool) (*Material, error) {
	return nil, nil
}
func (s *masterDataRepoStub) ListUnits(context.Context, MasterDataFilter) ([]*Unit, int, error) {
	return []*Unit{{ID: 1, Code: "PCS", Name: "个", IsActive: true}}, 1, nil
}
func (s *masterDataRepoStub) ListWarehouses(context.Context, MasterDataFilter) ([]*Warehouse, int, error) {
	return []*Warehouse{{ID: 1, Code: "WH-01", Name: "仓库", Type: "FINISHED_GOODS", IsActive: true}}, 1, nil
}
func (s *masterDataRepoStub) UnitIsActive(_ context.Context, id int) (bool, error) {
	if s.units == nil {
		return false, ErrUnitNotFound
	}
	if _, ok := s.units[id]; !ok {
		return false, ErrUnitNotFound
	}
	return s.units[id], nil
}
func (s *masterDataRepoStub) CreateProcess(_ context.Context, in *ProcessMutation) (*Process, error) {
	cp := *in
	s.createdProcess = &cp
	return &Process{ID: 1, Code: in.Code, Name: in.Name, Category: in.Category, OutsourcingEnabled: in.OutsourcingEnabled, InhouseEnabled: in.InhouseEnabled, QualityRequired: in.QualityRequired, SortOrder: in.SortOrder, Note: in.Note, IsActive: true}, nil
}
func (s *masterDataRepoStub) UpdateProcess(context.Context, int, *ProcessMutation) (*Process, error) {
	return nil, nil
}
func (s *masterDataRepoStub) GetProcess(context.Context, int) (*Process, error) {
	return nil, nil
}
func (s *masterDataRepoStub) ListProcesses(context.Context, MasterDataFilter) ([]*Process, int, error) {
	return nil, 0, nil
}
func (s *masterDataRepoStub) SetProcessActive(context.Context, int, bool) (*Process, error) {
	return nil, nil
}
func (s *masterDataRepoStub) ProductIsActive(_ context.Context, id int) (bool, error) {
	if s.products == nil {
		return false, ErrProductNotFound
	}
	if _, ok := s.products[id]; !ok {
		return false, ErrProductNotFound
	}
	return s.products[id], nil
}
func (s *masterDataRepoStub) CreateProduct(_ context.Context, in *ProductMutation) (*Product, error) {
	cp := *in
	s.createdProduct = &cp
	return &Product{ID: 1, Code: in.Code, Name: in.Name, StyleNo: in.StyleNo, CustomerStyleNo: in.CustomerStyleNo, DefaultUnitID: in.DefaultUnitID, IsActive: true}, nil
}
func (s *masterDataRepoStub) UpdateProduct(context.Context, int, *ProductMutation) (*Product, error) {
	return nil, nil
}
func (s *masterDataRepoStub) GetProduct(context.Context, int) (*Product, error) {
	return nil, nil
}
func (s *masterDataRepoStub) ListProducts(context.Context, MasterDataFilter) ([]*Product, int, error) {
	return nil, 0, nil
}
func (s *masterDataRepoStub) SetProductActive(context.Context, int, bool) (*Product, error) {
	return nil, nil
}
func (s *masterDataRepoStub) CreateProductSKU(_ context.Context, in *ProductSKUMutation) (*ProductSKU, error) {
	cp := *in
	s.createdSKU = &cp
	return &ProductSKU{ID: 1, ProductID: in.ProductID, SKUCode: in.SKUCode, DefaultUnitID: in.DefaultUnitID, IsActive: true}, nil
}
func (s *masterDataRepoStub) UpdateProductSKU(context.Context, int, *ProductSKUMutation) (*ProductSKU, error) {
	return nil, nil
}
func (s *masterDataRepoStub) GetProductSKU(context.Context, int) (*ProductSKU, error) {
	return nil, nil
}
func (s *masterDataRepoStub) ListProductSKUs(context.Context, ProductSKUFilter) ([]*ProductSKU, int, error) {
	return nil, 0, nil
}
func (s *masterDataRepoStub) SetProductSKUActive(context.Context, int, bool) (*ProductSKU, error) {
	return nil, nil
}
func (s *masterDataRepoStub) CreateContact(_ context.Context, in *ContactMutation) (*Contact, error) {
	cp := *in
	s.created = &cp
	return &Contact{ID: 1, OwnerType: in.OwnerType, OwnerID: in.OwnerID, Name: in.Name, IsPrimary: in.IsPrimary}, nil
}
func (s *masterDataRepoStub) UpdateContact(_ context.Context, _ int, in *ContactMutation) (*Contact, error) {
	cp := *in
	s.updated = &cp
	return &Contact{ID: 1, OwnerType: in.OwnerType, OwnerID: in.OwnerID, Name: in.Name, IsPrimary: in.IsPrimary}, nil
}
func (s *masterDataRepoStub) GetContact(context.Context, int) (*Contact, error) {
	return nil, nil
}
func (s *masterDataRepoStub) ListContactsByOwner(context.Context, ContactFilter) ([]*Contact, int, error) {
	return nil, 0, nil
}
func (s *masterDataRepoStub) SetPrimaryContact(context.Context, int) (*Contact, error) {
	return nil, nil
}
func (s *masterDataRepoStub) DisableContact(context.Context, int) (*Contact, error) {
	return nil, nil
}

func TestMasterDataUsecaseContactOwnerGuard(t *testing.T) {
	ctx := context.Background()
	repo := &masterDataRepoStub{
		customers: map[int]bool{10: true},
		suppliers: map[int]bool{20: true},
	}
	uc := NewMasterDataUsecase(repo)

	if _, err := uc.CreateContact(ctx, &ContactMutation{
		OwnerType: " customer ",
		OwnerID:   10,
		Name:      " 主联系人 ",
	}); err != nil {
		t.Fatalf("expected existing customer owner to pass, got %v", err)
	}
	if repo.created.OwnerType != ContactOwnerCustomer || repo.created.Name != "主联系人" {
		t.Fatalf("expected normalized contact mutation, got %#v", repo.created)
	}

	if _, err := uc.CreateContact(ctx, &ContactMutation{
		OwnerType: ContactOwnerCustomer,
		OwnerID:   999,
		Name:      "联系人",
	}); !errors.Is(err, ErrCustomerNotFound) {
		t.Fatalf("expected missing customer owner rejected, got %v", err)
	}
	if _, err := uc.CreateContact(ctx, &ContactMutation{
		OwnerType: ContactOwnerSupplier,
		OwnerID:   999,
		Name:      "联系人",
	}); !errors.Is(err, ErrSupplierNotFound) {
		t.Fatalf("expected missing supplier owner rejected, got %v", err)
	}
	if _, err := uc.CreateContact(ctx, &ContactMutation{
		OwnerType: "PARTNER",
		OwnerID:   10,
		Name:      "联系人",
	}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected illegal owner type rejected, got %v", err)
	}
}

func TestMasterDataUsecaseNormalizesCustomerSupplierAndContactInput(t *testing.T) {
	note := "  "
	if _, err := normalizeCustomerMutation(CustomerMutation{Code: " C-001 ", Name: " 客户 ", Note: &note}); err != nil {
		t.Fatalf("expected customer mutation valid, got %v", err)
	}
	if _, err := normalizeCustomerMutation(CustomerMutation{Code: " ", Name: "客户"}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected empty customer code rejected, got %v", err)
	}
	supplierType := " material "
	supplierInput, err := normalizeSupplierMutation(SupplierMutation{Code: " S-001 ", Name: " 供应商 ", SupplierType: &supplierType})
	if err != nil {
		t.Fatalf("expected supplier mutation valid, got %v", err)
	}
	if supplierInput.SupplierType == nil || *supplierInput.SupplierType != "material" {
		t.Fatalf("expected supplier type trimmed, got %#v", supplierInput.SupplierType)
	}
	category := " 填充 "
	materialInput, err := normalizeMaterialMutation(MaterialMutation{Code: " M-001 ", Name: " PP 棉 ", Category: &category, DefaultUnitID: 10})
	if err != nil {
		t.Fatalf("expected material mutation valid, got %v", err)
	}
	if materialInput.Code != "M-001" || materialInput.Name != "PP 棉" || materialInput.Category == nil || *materialInput.Category != "填充" {
		t.Fatalf("expected normalized material, got %#v", materialInput)
	}
	if _, err := normalizeMaterialMutation(MaterialMutation{Code: "M-001", Name: "PP 棉"}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected missing material unit rejected, got %v", err)
	}
	processCategory := " 委外车缝 "
	processNote := "  "
	processInput, err := normalizeProcessMutation(ProcessMutation{Code: " PR-001 ", Name: " 车缝 ", Category: &processCategory, SortOrder: -1, Note: &processNote})
	if err != nil {
		t.Fatalf("expected process mutation valid, got %v", err)
	}
	if processInput.Code != "PR-001" || processInput.Name != "车缝" || processInput.Category == nil || *processInput.Category != "委外车缝" || processInput.SortOrder != 0 {
		t.Fatalf("expected normalized process, got %#v", processInput)
	}
	if processInput.Note != nil {
		t.Fatalf("expected blank process note cleared, got %#v", processInput.Note)
	}
	if _, err := normalizeProcessMutation(ProcessMutation{Code: " ", Name: "车缝"}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected empty process code rejected, got %v", err)
	}
	styleNo := "  BEAR-BASE  "
	customerStyleNo := " "
	productInput, err := normalizeProductMutation(ProductMutation{Code: " P-001 ", Name: " 毛绒熊 ", StyleNo: &styleNo, CustomerStyleNo: &customerStyleNo, DefaultUnitID: 10})
	if err != nil {
		t.Fatalf("expected product mutation valid, got %v", err)
	}
	if productInput.Code != "P-001" || productInput.Name != "毛绒熊" || productInput.StyleNo == nil || *productInput.StyleNo != "BEAR-BASE" {
		t.Fatalf("expected normalized product, got %#v", productInput)
	}
	if productInput.CustomerStyleNo != nil {
		t.Fatalf("expected blank customer style cleared, got %#v", productInput.CustomerStyleNo)
	}
	if _, err := normalizeProductMutation(ProductMutation{Code: "P-001", Name: "毛绒熊"}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected missing product unit rejected, got %v", err)
	}
	contactInput, err := normalizeContactMutation(ContactMutation{OwnerType: "supplier", OwnerID: 20, Name: " 联系人 "})
	if err != nil {
		t.Fatalf("expected contact mutation valid, got %v", err)
	}
	if contactInput.OwnerType != ContactOwnerSupplier || contactInput.Name != "联系人" {
		t.Fatalf("expected normalized contact, got %#v", contactInput)
	}
}

func TestMasterDataUsecaseProductGuardsUnit(t *testing.T) {
	ctx := context.Background()
	unitID := 3
	styleNo := "  BEAR-BASE  "
	repo := &masterDataRepoStub{units: map[int]bool{unitID: true, 4: false}}
	uc := NewMasterDataUsecase(repo)

	product, err := uc.CreateProduct(ctx, &ProductMutation{
		Code:          " P-001 ",
		Name:          " 毛绒熊 ",
		StyleNo:       &styleNo,
		DefaultUnitID: unitID,
	})
	if err != nil {
		t.Fatalf("expected product valid, got %v", err)
	}
	if product.Code != "P-001" || repo.createdProduct.StyleNo == nil || *repo.createdProduct.StyleNo != "BEAR-BASE" {
		t.Fatalf("expected normalized product mutation, got product=%#v mutation=%#v", product, repo.createdProduct)
	}

	if _, err := uc.CreateProduct(ctx, &ProductMutation{Code: "P-X", Name: "产品", DefaultUnitID: 4}); !errors.Is(err, ErrUnitInactive) {
		t.Fatalf("expected inactive unit rejected, got %v", err)
	}
	if _, err := uc.CreateProduct(ctx, &ProductMutation{Code: "P-X", Name: "产品", DefaultUnitID: 999}); !errors.Is(err, ErrUnitNotFound) {
		t.Fatalf("expected missing unit rejected, got %v", err)
	}
	if _, err := uc.CreateProduct(ctx, &ProductMutation{Name: "产品", DefaultUnitID: unitID}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected empty product code rejected, got %v", err)
	}
}

func TestMasterDataUsecaseProductSKUGuardsProductAndUnit(t *testing.T) {
	ctx := context.Background()
	unitID := 3
	skuName := "  红色小号  "
	emptyBarcode := " "
	repo := &masterDataRepoStub{
		products: map[int]bool{7: true, 8: false},
		units:    map[int]bool{unitID: true, 4: false},
	}
	uc := NewMasterDataUsecase(repo)

	sku, err := uc.CreateProductSKU(ctx, &ProductSKUMutation{
		ProductID:     7,
		SKUCode:       " SKU-RED-S ",
		SKUName:       &skuName,
		Barcode:       &emptyBarcode,
		DefaultUnitID: &unitID,
	})
	if err != nil {
		t.Fatalf("expected product sku valid, got %v", err)
	}
	if sku.SKUCode != "SKU-RED-S" || repo.createdSKU.SKUName == nil || *repo.createdSKU.SKUName != "红色小号" {
		t.Fatalf("expected normalized sku mutation, got sku=%#v mutation=%#v", sku, repo.createdSKU)
	}
	if repo.createdSKU.Barcode != nil {
		t.Fatalf("expected blank barcode cleared, got %#v", repo.createdSKU.Barcode)
	}

	if _, err := uc.CreateProductSKU(ctx, &ProductSKUMutation{ProductID: 8, SKUCode: "SKU-X"}); !errors.Is(err, ErrProductInactive) {
		t.Fatalf("expected inactive product rejected, got %v", err)
	}
	if _, err := uc.CreateProductSKU(ctx, &ProductSKUMutation{ProductID: 999, SKUCode: "SKU-X"}); !errors.Is(err, ErrProductNotFound) {
		t.Fatalf("expected missing product rejected, got %v", err)
	}
	inactiveUnitID := 4
	if _, err := uc.CreateProductSKU(ctx, &ProductSKUMutation{ProductID: 7, SKUCode: "SKU-X", DefaultUnitID: &inactiveUnitID}); !errors.Is(err, ErrUnitInactive) {
		t.Fatalf("expected inactive unit rejected, got %v", err)
	}
	if _, err := uc.CreateProductSKU(ctx, &ProductSKUMutation{ProductID: 7}); !errors.Is(err, ErrBadParam) {
		t.Fatalf("expected empty sku code rejected, got %v", err)
	}
}
