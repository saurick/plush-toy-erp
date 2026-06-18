package service

import (
	"context"
	"fmt"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
	"google.golang.org/protobuf/types/known/structpb"
)

type stubMasterDataJSONRPCRepo struct {
	customerExists bool
	supplierExists bool
	productActive  bool
	unitActive     bool
	createdProcess *biz.ProcessMutation
	createdProduct *biz.ProductMutation
	createdSKU     *biz.ProductSKUMutation
	createdContact *biz.ContactMutation
	savedCustomer  *biz.CustomerMutation
	savedSupplier  *biz.SupplierMutation
	savedContacts  []*biz.ContactSaveMutation
}

func (s *stubMasterDataJSONRPCRepo) CreateCustomer(_ context.Context, in *biz.CustomerMutation) (*biz.Customer, error) {
	return &biz.Customer{ID: 1, Code: in.Code, Name: in.Name, IsActive: true, CreatedAt: time.Unix(1, 0), UpdatedAt: time.Unix(1, 0)}, nil
}

func (s *stubMasterDataJSONRPCRepo) UpdateCustomer(_ context.Context, id int, in *biz.CustomerMutation) (*biz.Customer, error) {
	return &biz.Customer{ID: id, Code: in.Code, Name: in.Name, IsActive: true}, nil
}

func (s *stubMasterDataJSONRPCRepo) SaveCustomerWithContacts(_ context.Context, id int, in *biz.CustomerMutation, contacts []*biz.ContactSaveMutation) (*biz.CustomerWithContacts, error) {
	if id <= 0 {
		id = 1
	}
	s.savedCustomer = in
	s.savedContacts = contacts
	outContacts := make([]*biz.Contact, 0, len(contacts))
	for idx, item := range contacts {
		outContacts = append(outContacts, &biz.Contact{
			ID:        idx + 1,
			OwnerType: biz.ContactOwnerCustomer,
			OwnerID:   id,
			Name:      item.Name,
			IsActive:  true,
			IsPrimary: item.IsPrimary,
		})
	}
	return &biz.CustomerWithContacts{
		Customer: &biz.Customer{ID: id, Code: in.Code, Name: in.Name, IsActive: true},
		Contacts: outContacts,
	}, nil
}

func (s *stubMasterDataJSONRPCRepo) GetCustomer(_ context.Context, id int) (*biz.Customer, error) {
	return &biz.Customer{ID: id, Code: "C001", Name: "客户", IsActive: true}, nil
}

func (s *stubMasterDataJSONRPCRepo) ListCustomers(context.Context, biz.MasterDataFilter) ([]*biz.Customer, int, error) {
	return []*biz.Customer{{ID: 1, Code: "C001", Name: "客户", IsActive: true}}, 1, nil
}

func (s *stubMasterDataJSONRPCRepo) SetCustomerActive(_ context.Context, id int, active bool) (*biz.Customer, error) {
	return &biz.Customer{ID: id, Code: "C001", Name: "客户", IsActive: active}, nil
}

func (s *stubMasterDataJSONRPCRepo) CustomerExists(context.Context, int) (bool, error) {
	return s.customerExists, nil
}

func (s *stubMasterDataJSONRPCRepo) CreateSupplier(_ context.Context, in *biz.SupplierMutation) (*biz.Supplier, error) {
	return &biz.Supplier{ID: 1, Code: in.Code, Name: in.Name, IsActive: true}, nil
}

func (s *stubMasterDataJSONRPCRepo) UpdateSupplier(_ context.Context, id int, in *biz.SupplierMutation) (*biz.Supplier, error) {
	return &biz.Supplier{ID: id, Code: in.Code, Name: in.Name, IsActive: true}, nil
}

func (s *stubMasterDataJSONRPCRepo) SaveSupplierWithContacts(_ context.Context, id int, in *biz.SupplierMutation, contacts []*biz.ContactSaveMutation) (*biz.SupplierWithContacts, error) {
	if id <= 0 {
		id = 1
	}
	s.savedSupplier = in
	s.savedContacts = contacts
	outContacts := make([]*biz.Contact, 0, len(contacts))
	for idx, item := range contacts {
		outContacts = append(outContacts, &biz.Contact{
			ID:        idx + 1,
			OwnerType: biz.ContactOwnerSupplier,
			OwnerID:   id,
			Name:      item.Name,
			IsActive:  true,
			IsPrimary: item.IsPrimary,
		})
	}
	return &biz.SupplierWithContacts{
		Supplier: &biz.Supplier{ID: id, Code: in.Code, Name: in.Name, IsActive: true},
		Contacts: outContacts,
	}, nil
}

func (s *stubMasterDataJSONRPCRepo) GetSupplier(_ context.Context, id int) (*biz.Supplier, error) {
	return &biz.Supplier{ID: id, Code: "S001", Name: "供应商", IsActive: true}, nil
}

func (s *stubMasterDataJSONRPCRepo) ListSuppliers(context.Context, biz.MasterDataFilter) ([]*biz.Supplier, int, error) {
	return []*biz.Supplier{{ID: 1, Code: "S001", Name: "供应商", IsActive: true}}, 1, nil
}

func (s *stubMasterDataJSONRPCRepo) SetSupplierActive(_ context.Context, id int, active bool) (*biz.Supplier, error) {
	return &biz.Supplier{ID: id, Code: "S001", Name: "供应商", IsActive: active}, nil
}

func (s *stubMasterDataJSONRPCRepo) SupplierExists(context.Context, int) (bool, error) {
	return s.supplierExists, nil
}

func (s *stubMasterDataJSONRPCRepo) CreateMaterial(_ context.Context, in *biz.MaterialMutation) (*biz.Material, error) {
	return &biz.Material{ID: 1, Code: in.Code, Name: in.Name, DefaultUnitID: in.DefaultUnitID, IsActive: true}, nil
}

func (s *stubMasterDataJSONRPCRepo) UpdateMaterial(_ context.Context, id int, in *biz.MaterialMutation) (*biz.Material, error) {
	return &biz.Material{ID: id, Code: in.Code, Name: in.Name, DefaultUnitID: in.DefaultUnitID, IsActive: true}, nil
}

func (s *stubMasterDataJSONRPCRepo) GetMaterial(_ context.Context, id int) (*biz.Material, error) {
	return &biz.Material{ID: id, Code: "M001", Name: "材料", DefaultUnitID: 1, IsActive: true}, nil
}

func (s *stubMasterDataJSONRPCRepo) ListMaterials(context.Context, biz.MasterDataFilter) ([]*biz.Material, int, error) {
	return []*biz.Material{{ID: 1, Code: "M001", Name: "材料", DefaultUnitID: 1, IsActive: true}}, 1, nil
}

func (s *stubMasterDataJSONRPCRepo) SetMaterialActive(_ context.Context, id int, active bool) (*biz.Material, error) {
	return &biz.Material{ID: id, Code: "M001", Name: "材料", DefaultUnitID: 1, IsActive: active}, nil
}

func (s *stubMasterDataJSONRPCRepo) ListUnits(context.Context, biz.MasterDataFilter) ([]*biz.Unit, int, error) {
	return []*biz.Unit{{ID: 1, Code: "PCS", Name: "个", IsActive: true, CreatedAt: time.Unix(1, 0), UpdatedAt: time.Unix(1, 0)}}, 1, nil
}

func (s *stubMasterDataJSONRPCRepo) ListWarehouses(context.Context, biz.MasterDataFilter) ([]*biz.Warehouse, int, error) {
	return []*biz.Warehouse{{ID: 1, Code: "RM-01", Name: "原料仓", Type: "RAW_MATERIAL", IsActive: true, CreatedAt: time.Unix(1, 0), UpdatedAt: time.Unix(1, 0)}}, 1, nil
}

func (s *stubMasterDataJSONRPCRepo) UnitIsActive(context.Context, int) (bool, error) {
	if !s.unitActive {
		return false, biz.ErrUnitNotFound
	}
	return true, nil
}
func (s *stubMasterDataJSONRPCRepo) CreateProcess(_ context.Context, in *biz.ProcessMutation) (*biz.Process, error) {
	s.createdProcess = in
	return &biz.Process{ID: 1, Code: in.Code, Name: in.Name, Category: in.Category, OutsourcingEnabled: in.OutsourcingEnabled, InhouseEnabled: in.InhouseEnabled, QualityRequired: in.QualityRequired, SortOrder: in.SortOrder, Note: in.Note, IsActive: true, CreatedAt: time.Unix(1, 0), UpdatedAt: time.Unix(1, 0)}, nil
}
func (s *stubMasterDataJSONRPCRepo) UpdateProcess(_ context.Context, id int, in *biz.ProcessMutation) (*biz.Process, error) {
	return &biz.Process{ID: id, Code: in.Code, Name: in.Name, Category: in.Category, OutsourcingEnabled: in.OutsourcingEnabled, InhouseEnabled: in.InhouseEnabled, QualityRequired: in.QualityRequired, SortOrder: in.SortOrder, Note: in.Note, IsActive: true, CreatedAt: time.Unix(1, 0), UpdatedAt: time.Unix(1, 0)}, nil
}
func (s *stubMasterDataJSONRPCRepo) GetProcess(_ context.Context, id int) (*biz.Process, error) {
	category := "委外"
	return &biz.Process{ID: id, Code: "PROC-001", Name: "车缝", Category: &category, OutsourcingEnabled: true, InhouseEnabled: false, IsActive: true, CreatedAt: time.Unix(1, 0), UpdatedAt: time.Unix(1, 0)}, nil
}
func (s *stubMasterDataJSONRPCRepo) ListProcesses(context.Context, biz.MasterDataFilter) ([]*biz.Process, int, error) {
	category := "委外"
	return []*biz.Process{{ID: 1, Code: "PROC-001", Name: "车缝", Category: &category, OutsourcingEnabled: true, InhouseEnabled: false, IsActive: true, CreatedAt: time.Unix(1, 0), UpdatedAt: time.Unix(1, 0)}}, 1, nil
}
func (s *stubMasterDataJSONRPCRepo) SetProcessActive(_ context.Context, id int, active bool) (*biz.Process, error) {
	return &biz.Process{ID: id, Code: "PROC-001", Name: "车缝", OutsourcingEnabled: true, IsActive: active, CreatedAt: time.Unix(1, 0), UpdatedAt: time.Unix(1, 0)}, nil
}
func (s *stubMasterDataJSONRPCRepo) ProductIsActive(context.Context, int) (bool, error) {
	if !s.productActive {
		return false, biz.ErrProductNotFound
	}
	return true, nil
}
func (s *stubMasterDataJSONRPCRepo) CreateProduct(_ context.Context, in *biz.ProductMutation) (*biz.Product, error) {
	s.createdProduct = in
	return &biz.Product{ID: 1, Code: in.Code, Name: in.Name, DefaultUnitID: in.DefaultUnitID, IsActive: true, CreatedAt: time.Unix(1, 0), UpdatedAt: time.Unix(1, 0)}, nil
}
func (s *stubMasterDataJSONRPCRepo) UpdateProduct(_ context.Context, id int, in *biz.ProductMutation) (*biz.Product, error) {
	return &biz.Product{ID: id, Code: in.Code, Name: in.Name, DefaultUnitID: in.DefaultUnitID, IsActive: true, CreatedAt: time.Unix(1, 0), UpdatedAt: time.Unix(1, 0)}, nil
}
func (s *stubMasterDataJSONRPCRepo) GetProduct(_ context.Context, id int) (*biz.Product, error) {
	return &biz.Product{ID: id, Code: "P001", Name: "产品", DefaultUnitID: 1, IsActive: true, CreatedAt: time.Unix(1, 0), UpdatedAt: time.Unix(1, 0)}, nil
}
func (s *stubMasterDataJSONRPCRepo) ListProducts(context.Context, biz.MasterDataFilter) ([]*biz.Product, int, error) {
	return []*biz.Product{{ID: 1, Code: "P001", Name: "产品", DefaultUnitID: 1, IsActive: true, CreatedAt: time.Unix(1, 0), UpdatedAt: time.Unix(1, 0)}}, 1, nil
}
func (s *stubMasterDataJSONRPCRepo) SetProductActive(_ context.Context, id int, active bool) (*biz.Product, error) {
	return &biz.Product{ID: id, Code: "P001", Name: "产品", DefaultUnitID: 1, IsActive: active, CreatedAt: time.Unix(1, 0), UpdatedAt: time.Unix(1, 0)}, nil
}
func (s *stubMasterDataJSONRPCRepo) CreateProductSKU(_ context.Context, in *biz.ProductSKUMutation) (*biz.ProductSKU, error) {
	s.createdSKU = in
	return &biz.ProductSKU{ID: 1, ProductID: in.ProductID, SKUCode: in.SKUCode, SKUName: in.SKUName, DefaultUnitID: in.DefaultUnitID, IsActive: true, CreatedAt: time.Unix(1, 0), UpdatedAt: time.Unix(1, 0)}, nil
}
func (s *stubMasterDataJSONRPCRepo) UpdateProductSKU(_ context.Context, id int, in *biz.ProductSKUMutation) (*biz.ProductSKU, error) {
	return &biz.ProductSKU{ID: id, ProductID: in.ProductID, SKUCode: in.SKUCode, IsActive: true, CreatedAt: time.Unix(1, 0), UpdatedAt: time.Unix(1, 0)}, nil
}
func (s *stubMasterDataJSONRPCRepo) GetProductSKU(_ context.Context, id int) (*biz.ProductSKU, error) {
	return &biz.ProductSKU{ID: id, ProductID: 1, SKUCode: "SKU-001", IsActive: true, CreatedAt: time.Unix(1, 0), UpdatedAt: time.Unix(1, 0)}, nil
}
func (s *stubMasterDataJSONRPCRepo) ListProductSKUs(context.Context, biz.ProductSKUFilter) ([]*biz.ProductSKU, int, error) {
	return []*biz.ProductSKU{{ID: 1, ProductID: 1, SKUCode: "SKU-001", IsActive: true, CreatedAt: time.Unix(1, 0), UpdatedAt: time.Unix(1, 0)}}, 1, nil
}
func (s *stubMasterDataJSONRPCRepo) SetProductSKUActive(_ context.Context, id int, active bool) (*biz.ProductSKU, error) {
	return &biz.ProductSKU{ID: id, ProductID: 1, SKUCode: "SKU-001", IsActive: active, CreatedAt: time.Unix(1, 0), UpdatedAt: time.Unix(1, 0)}, nil
}

func (s *stubMasterDataJSONRPCRepo) CreateContact(_ context.Context, in *biz.ContactMutation) (*biz.Contact, error) {
	s.createdContact = in
	return &biz.Contact{ID: 1, OwnerType: in.OwnerType, OwnerID: in.OwnerID, Name: in.Name, IsActive: true, IsPrimary: in.IsPrimary}, nil
}

func (s *stubMasterDataJSONRPCRepo) UpdateContact(_ context.Context, id int, in *biz.ContactMutation) (*biz.Contact, error) {
	return &biz.Contact{ID: id, OwnerType: in.OwnerType, OwnerID: in.OwnerID, Name: in.Name, IsActive: true, IsPrimary: in.IsPrimary}, nil
}

func (s *stubMasterDataJSONRPCRepo) GetContact(_ context.Context, id int) (*biz.Contact, error) {
	return &biz.Contact{ID: id, OwnerType: biz.ContactOwnerCustomer, OwnerID: 1, Name: "联系人", IsActive: true}, nil
}

func (s *stubMasterDataJSONRPCRepo) ListContactsByOwner(context.Context, biz.ContactFilter) ([]*biz.Contact, int, error) {
	return []*biz.Contact{{ID: 1, OwnerType: biz.ContactOwnerCustomer, OwnerID: 1, Name: "联系人", IsActive: true}}, 1, nil
}

func (s *stubMasterDataJSONRPCRepo) SetPrimaryContact(_ context.Context, id int) (*biz.Contact, error) {
	return &biz.Contact{ID: id, OwnerType: biz.ContactOwnerCustomer, OwnerID: 1, Name: "联系人", IsActive: true, IsPrimary: true}, nil
}

func (s *stubMasterDataJSONRPCRepo) DisableContact(_ context.Context, id int) (*biz.Contact, error) {
	return &biz.Contact{ID: id, OwnerType: biz.ContactOwnerCustomer, OwnerID: 1, Name: "联系人", IsActive: false}, nil
}

type stubSalesOrderJSONRPCRepo struct {
	customerActive       bool
	productActive        bool
	unitActive           bool
	addedItem            *biz.SalesOrderItemMutation
	savedItems           []*biz.SalesOrderItemSaveMutation
	lastSalesOrderFilter biz.SalesOrderFilter
}

func (s *stubSalesOrderJSONRPCRepo) CreateSalesOrder(_ context.Context, in *biz.SalesOrderMutation) (*biz.SalesOrder, error) {
	return &biz.SalesOrder{ID: 1, OrderNo: in.OrderNo, CustomerID: in.CustomerID, OrderDate: in.OrderDate, LifecycleStatus: biz.SalesOrderStatusDraft}, nil
}

func (s *stubSalesOrderJSONRPCRepo) UpdateSalesOrder(_ context.Context, id int, in *biz.SalesOrderMutation) (*biz.SalesOrder, error) {
	return &biz.SalesOrder{ID: id, OrderNo: in.OrderNo, CustomerID: in.CustomerID, OrderDate: in.OrderDate, LifecycleStatus: biz.SalesOrderStatusDraft}, nil
}

func (s *stubSalesOrderJSONRPCRepo) GetSalesOrder(_ context.Context, id int) (*biz.SalesOrder, error) {
	return &biz.SalesOrder{ID: id, OrderNo: "SO001", CustomerID: 1, OrderDate: time.Unix(1, 0), LifecycleStatus: biz.SalesOrderStatusDraft}, nil
}

func (s *stubSalesOrderJSONRPCRepo) ListSalesOrders(_ context.Context, filter biz.SalesOrderFilter) ([]*biz.SalesOrder, int, error) {
	s.lastSalesOrderFilter = filter
	return []*biz.SalesOrder{{ID: 1, OrderNo: "SO001", CustomerID: 1, OrderDate: time.Unix(1, 0), LifecycleStatus: biz.SalesOrderStatusDraft}}, 1, nil
}

func (s *stubSalesOrderJSONRPCRepo) UpdateSalesOrderLifecycle(_ context.Context, id int, lifecycleStatus string) (*biz.SalesOrder, error) {
	return &biz.SalesOrder{ID: id, OrderNo: "SO001", CustomerID: 1, OrderDate: time.Unix(1, 0), LifecycleStatus: lifecycleStatus}, nil
}

func (s *stubSalesOrderJSONRPCRepo) AddSalesOrderItem(_ context.Context, in *biz.SalesOrderItemMutation) (*biz.SalesOrderItem, error) {
	s.addedItem = in
	return &biz.SalesOrderItem{ID: 1, SalesOrderID: in.SalesOrderID, LineNo: in.LineNo, ProductID: in.ProductID, ProductSkuID: in.ProductSkuID, UnitID: in.UnitID, OrderedQuantity: in.OrderedQuantity, LineStatus: biz.SalesOrderItemStatusOpen}, nil
}

func (s *stubSalesOrderJSONRPCRepo) UpdateSalesOrderItem(_ context.Context, id int, in *biz.SalesOrderItemMutation) (*biz.SalesOrderItem, error) {
	return &biz.SalesOrderItem{ID: id, SalesOrderID: in.SalesOrderID, LineNo: in.LineNo, ProductID: in.ProductID, ProductSkuID: in.ProductSkuID, UnitID: in.UnitID, OrderedQuantity: in.OrderedQuantity, LineStatus: biz.SalesOrderItemStatusOpen}, nil
}

func (s *stubSalesOrderJSONRPCRepo) GetSalesOrderItem(_ context.Context, id int) (*biz.SalesOrderItem, error) {
	return &biz.SalesOrderItem{ID: id, SalesOrderID: 1, LineNo: 1, ProductID: 1, UnitID: 1, OrderedQuantity: decimal.NewFromInt(10), LineStatus: biz.SalesOrderItemStatusOpen}, nil
}

func (s *stubSalesOrderJSONRPCRepo) UpdateSalesOrderItemStatus(_ context.Context, id int, lineStatus string) (*biz.SalesOrderItem, error) {
	return &biz.SalesOrderItem{ID: id, SalesOrderID: 1, LineNo: 1, ProductID: 1, UnitID: 1, OrderedQuantity: decimal.NewFromInt(10), LineStatus: lineStatus}, nil
}

func (s *stubSalesOrderJSONRPCRepo) ListSalesOrderItems(context.Context, biz.SalesOrderItemFilter) ([]*biz.SalesOrderItem, int, error) {
	return []*biz.SalesOrderItem{{ID: 1, SalesOrderID: 1, LineNo: 1, ProductID: 1, UnitID: 1, OrderedQuantity: decimal.NewFromInt(10), LineStatus: biz.SalesOrderItemStatusOpen}}, 1, nil
}

func (s *stubSalesOrderJSONRPCRepo) SaveSalesOrderWithItems(_ context.Context, id int, in *biz.SalesOrderMutation, items []*biz.SalesOrderItemSaveMutation) (*biz.SalesOrderWithItems, error) {
	s.savedItems = items
	orderID := id
	if orderID <= 0 {
		orderID = 1
	}
	out := &biz.SalesOrderWithItems{
		Order: &biz.SalesOrder{ID: orderID, OrderNo: in.OrderNo, CustomerID: in.CustomerID, OrderDate: in.OrderDate, LifecycleStatus: biz.SalesOrderStatusDraft},
		Items: make([]*biz.SalesOrderItem, 0, len(items)),
	}
	for idx, item := range items {
		out.Items = append(out.Items, &biz.SalesOrderItem{
			ID:              idx + 1,
			SalesOrderID:    orderID,
			LineNo:          item.LineNo,
			ProductID:       item.ProductID,
			ProductSkuID:    item.ProductSkuID,
			UnitID:          item.UnitID,
			OrderedQuantity: item.OrderedQuantity,
			LineStatus:      biz.SalesOrderItemStatusOpen,
		})
	}
	return out, nil
}

func (s *stubSalesOrderJSONRPCRepo) CustomerIsActive(context.Context, int) (bool, error) {
	if !s.customerActive {
		return false, biz.ErrCustomerNotFound
	}
	return true, nil
}

func (s *stubSalesOrderJSONRPCRepo) ProductIsActive(context.Context, int) (bool, error) {
	if !s.productActive {
		return false, biz.ErrProductNotFound
	}
	return true, nil
}

func (s *stubSalesOrderJSONRPCRepo) UnitIsActive(context.Context, int) (bool, error) {
	if !s.unitActive {
		return false, biz.ErrUnitNotFound
	}
	return true, nil
}

func newMasterDataJSONRPCTestData(repo *stubMasterDataJSONRPCRepo, admin *biz.AdminUser) *jsonrpcDispatcher {
	return &jsonrpcDispatcher{
		log:          log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.masterdata.test")),
		adminReader:  stubAdminAccountReader{admin: admin},
		masterDataUC: biz.NewMasterDataUsecase(repo),
	}
}

func newSalesOrderJSONRPCTestData(repo *stubSalesOrderJSONRPCRepo, admin *biz.AdminUser) *jsonrpcDispatcher {
	return &jsonrpcDispatcher{
		log:          log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.sales_order.test")),
		adminReader:  stubAdminAccountReader{admin: admin},
		salesOrderUC: biz.NewSalesOrderUsecase(repo),
	}
}

func TestJsonrpcDispatcher_MasterDataCreateCustomerRequiresAdminAndPermission(t *testing.T) {
	params := mustJSONRPCStruct(t, map[string]any{"code": "C001", "name": "客户"})

	j := newMasterDataJSONRPCTestData(&stubMasterDataJSONRPCRepo{}, workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionCustomerCreate))
	_, unauthRes, err := j.handleMasterData(context.Background(), "create_customer", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if unauthRes == nil || unauthRes.Code != errcode.AuthRequired.Code {
		t.Fatalf("expected auth required, got %#v", unauthRes)
	}

	userCtx := biz.NewContextWithClaims(context.Background(), &biz.AuthClaims{UserID: 8, Username: "user", Role: biz.RoleUser})
	_, userRes, err := j.handleMasterData(userCtx, "create_customer", "2", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if userRes == nil || userRes.Code != errcode.AdminRequired.Code {
		t.Fatalf("expected admin required, got %#v", userRes)
	}

	disabledAdmin := workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionCustomerCreate)
	disabledAdmin.Disabled = true
	j = newMasterDataJSONRPCTestData(&stubMasterDataJSONRPCRepo{}, disabledAdmin)
	_, disabledRes, err := j.handleMasterData(workflowJSONRPCAdminContext(), "create_customer", "3", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if disabledRes == nil || disabledRes.Code != errcode.AdminDisabled.Code {
		t.Fatalf("expected admin disabled, got %#v", disabledRes)
	}

	j = newMasterDataJSONRPCTestData(&stubMasterDataJSONRPCRepo{}, workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionCustomerRead))
	_, deniedRes, err := j.handleMasterData(workflowJSONRPCAdminContext(), "create_customer", "4", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if deniedRes == nil || deniedRes.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected permission denied, got %#v", deniedRes)
	}

	j = newMasterDataJSONRPCTestData(&stubMasterDataJSONRPCRepo{}, workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionCustomerCreate))
	_, okRes, err := j.handleMasterData(workflowJSONRPCAdminContext(), "create_customer", "5", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if okRes == nil || okRes.Code != errcode.OK.Code {
		t.Fatalf("expected OK, got %#v", okRes)
	}
}

func TestJsonrpcDispatcher_ContactAPIUsesUsecaseOwnerGuard(t *testing.T) {
	repo := &stubMasterDataJSONRPCRepo{customerExists: false}
	j := newMasterDataJSONRPCTestData(repo, workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionContactCreate))
	params := mustJSONRPCStruct(t, map[string]any{
		"owner_type": "CUSTOMER",
		"owner_id":   float64(99),
		"name":       "联系人",
	})

	_, res, err := j.handleMasterData(workflowJSONRPCAdminContext(), "create_contact", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected invalid param for missing owner, got %#v", res)
	}
	if repo.createdContact != nil {
		t.Fatalf("contact API must not bypass usecase owner guard")
	}
}

func TestJsonrpcDispatcher_SaveCustomerWithContactsUsesAggregateUsecase(t *testing.T) {
	params := mustJSONRPCStruct(t, map[string]any{
		"code": "C-AGG",
		"name": "聚合客户",
		"contacts": []any{
			map[string]any{
				"name":       "主联系人",
				"mobile":     "13800000000",
				"is_primary": true,
			},
		},
	})

	j := newMasterDataJSONRPCTestData(
		&stubMasterDataJSONRPCRepo{},
		workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionCustomerCreate, biz.PermissionContactCreate),
	)
	_, deniedRes, err := j.handleMasterData(workflowJSONRPCAdminContext(), "save_customer_with_contacts", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if deniedRes == nil || deniedRes.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected contact aggregate permission denied, got %#v", deniedRes)
	}

	repo := &stubMasterDataJSONRPCRepo{}
	j = newMasterDataJSONRPCTestData(
		repo,
		workflowJSONRPCAdmin(
			[]string{biz.SalesRoleKey},
			biz.PermissionCustomerCreate,
			biz.PermissionContactCreate,
			biz.PermissionContactUpdate,
			biz.PermissionContactDisable,
		),
	)
	_, okRes, err := j.handleMasterData(workflowJSONRPCAdminContext(), "save_customer_with_contacts", "2", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if okRes == nil || okRes.Code != errcode.OK.Code {
		t.Fatalf("expected OK, got %#v", okRes)
	}
	data := okRes.Data.AsMap()
	if data["customer"] == nil {
		t.Fatalf("expected customer in aggregate response, got %#v", data)
	}
	contacts, ok := data["contacts"].([]any)
	if !ok || len(contacts) != 1 {
		t.Fatalf("expected one contact in aggregate response, got %#v", data["contacts"])
	}
	if repo.savedCustomer == nil || len(repo.savedContacts) != 1 || repo.createdContact != nil {
		t.Fatalf("expected aggregate save without standalone contact create, repo=%#v", repo)
	}
}

func TestJsonrpcDispatcher_MaterialAPIRequiresPermissionAndValidUnit(t *testing.T) {
	params := mustJSONRPCStruct(t, map[string]any{
		"code":            "M001",
		"name":            "PP 棉",
		"default_unit_id": float64(1),
	})

	j := newMasterDataJSONRPCTestData(&stubMasterDataJSONRPCRepo{unitActive: true}, workflowJSONRPCAdmin([]string{biz.PurchaseRoleKey}, biz.PermissionMaterialRead))
	_, deniedRes, err := j.handleMasterData(workflowJSONRPCAdminContext(), "create_material", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if deniedRes == nil || deniedRes.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected permission denied, got %#v", deniedRes)
	}

	j = newMasterDataJSONRPCTestData(&stubMasterDataJSONRPCRepo{unitActive: false}, workflowJSONRPCAdmin([]string{biz.PurchaseRoleKey}, biz.PermissionMaterialCreate))
	_, invalidUnitRes, err := j.handleMasterData(workflowJSONRPCAdminContext(), "create_material", "2", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if invalidUnitRes == nil || invalidUnitRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected invalid param for missing unit, got %#v", invalidUnitRes)
	}

	j = newMasterDataJSONRPCTestData(&stubMasterDataJSONRPCRepo{unitActive: true}, workflowJSONRPCAdmin([]string{biz.PurchaseRoleKey}, biz.PermissionMaterialCreate))
	_, okRes, err := j.handleMasterData(workflowJSONRPCAdminContext(), "create_material", "3", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if okRes == nil || okRes.Code != errcode.OK.Code {
		t.Fatalf("expected OK, got %#v", okRes)
	}
}

func TestJsonrpcDispatcher_ListUnitsUsesMaterialReadPermission(t *testing.T) {
	j := newMasterDataJSONRPCTestData(
		&stubMasterDataJSONRPCRepo{},
		workflowJSONRPCAdmin([]string{biz.PurchaseRoleKey}, biz.PermissionSupplierRead),
	)
	_, deniedRes, err := j.handleMasterData(workflowJSONRPCAdminContext(), "list_units", "1", nil)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if deniedRes == nil || deniedRes.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected permission denied, got %#v", deniedRes)
	}

	j = newMasterDataJSONRPCTestData(
		&stubMasterDataJSONRPCRepo{},
		workflowJSONRPCAdmin([]string{biz.PurchaseRoleKey}, biz.PermissionMaterialRead),
	)
	_, okRes, err := j.handleMasterData(workflowJSONRPCAdminContext(), "list_units", "2", nil)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if okRes == nil || okRes.Code != errcode.OK.Code {
		t.Fatalf("expected OK, got %#v", okRes)
	}
	units, ok := okRes.Data.AsMap()["units"].([]any)
	if !ok || len(units) != 1 {
		t.Fatalf("expected one unit, got %#v", okRes.Data.AsMap()["units"])
	}
}

func TestJsonrpcDispatcher_ListWarehousesUsesInventoryReadPermission(t *testing.T) {
	j := newMasterDataJSONRPCTestData(
		&stubMasterDataJSONRPCRepo{},
		workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionMaterialRead),
	)
	_, deniedRes, err := j.handleMasterData(workflowJSONRPCAdminContext(), "list_warehouses", "1", nil)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if deniedRes == nil || deniedRes.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected permission denied, got %#v", deniedRes)
	}

	j = newMasterDataJSONRPCTestData(
		&stubMasterDataJSONRPCRepo{},
		workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionWarehouseInventoryRead),
	)
	_, okRes, err := j.handleMasterData(workflowJSONRPCAdminContext(), "list_warehouses", "2", nil)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if okRes == nil || okRes.Code != errcode.OK.Code {
		t.Fatalf("expected OK, got %#v", okRes)
	}
	warehouses, ok := okRes.Data.AsMap()["warehouses"].([]any)
	if !ok || len(warehouses) != 1 {
		t.Fatalf("expected one warehouse, got %#v", okRes.Data.AsMap()["warehouses"])
	}
}

func TestJsonrpcDispatcher_ProcessAPIRequiresPermissionAndKeepsFlexibleFlags(t *testing.T) {
	params := mustJSONRPCStruct(t, map[string]any{
		"code":                " PROC-SEW ",
		"name":                " 车缝 ",
		"category":            " 委外车缝 ",
		"outsourcing_enabled": true,
		"inhouse_enabled":     false,
		"quality_required":    true,
		"sort_order":          float64(20),
	})

	j := newMasterDataJSONRPCTestData(
		&stubMasterDataJSONRPCRepo{},
		workflowJSONRPCAdmin([]string{biz.ProductionRoleKey}, biz.PermissionProcessRead),
	)
	_, deniedRes, err := j.handleMasterData(workflowJSONRPCAdminContext(), "create_process", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if deniedRes == nil || deniedRes.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected permission denied, got %#v", deniedRes)
	}

	repo := &stubMasterDataJSONRPCRepo{}
	j = newMasterDataJSONRPCTestData(
		repo,
		workflowJSONRPCAdmin([]string{biz.PMCRoleKey}, biz.PermissionProcessCreate),
	)
	_, okRes, err := j.handleMasterData(workflowJSONRPCAdminContext(), "create_process", "2", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if okRes == nil || okRes.Code != errcode.OK.Code {
		t.Fatalf("expected OK, got %#v", okRes)
	}
	if repo.createdProcess == nil ||
		repo.createdProcess.Code != "PROC-SEW" ||
		repo.createdProcess.Name != "车缝" ||
		repo.createdProcess.Category == nil ||
		*repo.createdProcess.Category != "委外车缝" ||
		repo.createdProcess.OutsourcingEnabled != true ||
		repo.createdProcess.InhouseEnabled != false ||
		repo.createdProcess.QualityRequired != true ||
		repo.createdProcess.SortOrder != 20 {
		t.Fatalf("unexpected process mutation %#v", repo.createdProcess)
	}
}

func TestJsonrpcDispatcher_ProductAPIRequiresPermissionAndValidUnit(t *testing.T) {
	params := mustJSONRPCStruct(t, map[string]any{
		"code":            " P001 ",
		"name":            "毛绒熊",
		"style_no":        "BEAR",
		"default_unit_id": float64(1),
	})

	j := newMasterDataJSONRPCTestData(
		&stubMasterDataJSONRPCRepo{unitActive: true},
		workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionProductRead),
	)
	_, deniedRes, err := j.handleMasterData(workflowJSONRPCAdminContext(), "create_product", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if deniedRes == nil || deniedRes.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected permission denied, got %#v", deniedRes)
	}

	repo := &stubMasterDataJSONRPCRepo{unitActive: false}
	j = newMasterDataJSONRPCTestData(repo, workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionProductCreate))
	_, invalidUnitRes, err := j.handleMasterData(workflowJSONRPCAdminContext(), "create_product", "2", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if invalidUnitRes == nil || invalidUnitRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected invalid param for missing unit, got %#v", invalidUnitRes)
	}
	if repo.createdProduct != nil {
		t.Fatalf("product API must not bypass usecase unit guard")
	}

	repo = &stubMasterDataJSONRPCRepo{unitActive: true}
	j = newMasterDataJSONRPCTestData(repo, workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionProductCreate, biz.PermissionProductRead))
	_, okRes, err := j.handleMasterData(workflowJSONRPCAdminContext(), "create_product", "3", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if okRes == nil || okRes.Code != errcode.OK.Code {
		t.Fatalf("expected OK, got %#v", okRes)
	}
	if repo.createdProduct == nil || repo.createdProduct.Code != "P001" {
		t.Fatalf("expected normalized product mutation, got %#v", repo.createdProduct)
	}

	_, listRes, err := j.handleMasterData(workflowJSONRPCAdminContext(), "list_products", "4", mustJSONRPCStruct(t, map[string]any{}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if listRes == nil || listRes.Code != errcode.OK.Code {
		t.Fatalf("expected OK list, got %#v", listRes)
	}
	data := listRes.Data.AsMap()
	if _, ok := data["products"].([]any); !ok {
		t.Fatalf("expected products list in response, got %#v", data)
	}
}

func TestJsonrpcDispatcher_ProductSKUAPIRequiresPermissionAndValidRefs(t *testing.T) {
	params := mustJSONRPCStruct(t, map[string]any{
		"product_id":      float64(1),
		"sku_code":        " SKU-001 ",
		"sku_name":        "红色小号",
		"default_unit_id": float64(1),
	})

	j := newMasterDataJSONRPCTestData(
		&stubMasterDataJSONRPCRepo{productActive: true, unitActive: true},
		workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionProductSKURead),
	)
	_, deniedRes, err := j.handleMasterData(workflowJSONRPCAdminContext(), "create_product_sku", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if deniedRes == nil || deniedRes.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected permission denied, got %#v", deniedRes)
	}

	repo := &stubMasterDataJSONRPCRepo{productActive: false, unitActive: true}
	j = newMasterDataJSONRPCTestData(repo, workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionProductSKUCreate))
	_, invalidProductRes, err := j.handleMasterData(workflowJSONRPCAdminContext(), "create_product_sku", "2", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if invalidProductRes == nil || invalidProductRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected invalid param for missing product, got %#v", invalidProductRes)
	}
	if repo.createdSKU != nil {
		t.Fatalf("sku API must not bypass usecase product guard")
	}

	repo = &stubMasterDataJSONRPCRepo{productActive: true, unitActive: true}
	j = newMasterDataJSONRPCTestData(repo, workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionProductSKUCreate, biz.PermissionProductSKURead))
	_, okRes, err := j.handleMasterData(workflowJSONRPCAdminContext(), "create_product_sku", "3", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if okRes == nil || okRes.Code != errcode.OK.Code {
		t.Fatalf("expected OK, got %#v", okRes)
	}
	if repo.createdSKU == nil || repo.createdSKU.SKUCode != "SKU-001" {
		t.Fatalf("expected normalized sku mutation, got %#v", repo.createdSKU)
	}

	_, listRes, err := j.handleMasterData(workflowJSONRPCAdminContext(), "list_product_skus", "4", mustJSONRPCStruct(t, map[string]any{}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if listRes == nil || listRes.Code != errcode.OK.Code {
		t.Fatalf("expected OK list, got %#v", listRes)
	}
	data := listRes.Data.AsMap()
	if _, ok := data["product_skus"].([]any); !ok {
		t.Fatalf("expected product_skus list in response, got %#v", data)
	}
}

func TestJsonrpcDispatcher_SalesOrderAPIRequiresPermissionAndRejectsShipmentVerb(t *testing.T) {
	repo := &stubSalesOrderJSONRPCRepo{customerActive: true, productActive: true, unitActive: true}
	j := newSalesOrderJSONRPCTestData(repo, workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionSalesOrderCreate))
	params := mustJSONRPCStruct(t, map[string]any{
		"order_no":    "SO001",
		"customer_id": float64(1),
		"order_date":  "2026-05-31",
	})

	_, okRes, err := j.handleSalesOrder(workflowJSONRPCAdminContext(), "create_sales_order", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if okRes == nil || okRes.Code != errcode.OK.Code {
		t.Fatalf("expected OK, got %#v", okRes)
	}

	_, unknownRes, err := j.handleSalesOrder(workflowJSONRPCAdminContext(), "ship"+"SalesOrder", "2", mustJSONRPCStruct(t, map[string]any{"id": float64(1)}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if unknownRes == nil || unknownRes.Code != errcode.UnknownMethod.Code {
		t.Fatalf("shipment verb must not be exposed by sales order API, got %#v", unknownRes)
	}
}

func TestJsonrpcDispatcher_SalesOrderListAcceptsDateAndSortFilters(t *testing.T) {
	repo := &stubSalesOrderJSONRPCRepo{}
	j := newSalesOrderJSONRPCTestData(repo, workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionSalesOrderRead))
	params := mustJSONRPCStruct(t, map[string]any{
		"date_field":     "order_date",
		"date_from":      "2026-06-01",
		"date_to":        "2026-06-30",
		"sort_by":        "order_date",
		"sort_direction": "asc",
	})

	_, res, err := j.handleSalesOrder(workflowJSONRPCAdminContext(), "list_sales_orders", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK, got %#v", res)
	}
	if repo.lastSalesOrderFilter.DateField != "order_date" ||
		repo.lastSalesOrderFilter.DateFrom == nil ||
		repo.lastSalesOrderFilter.DateTo == nil ||
		repo.lastSalesOrderFilter.SortBy != "order_date" ||
		repo.lastSalesOrderFilter.SortDirection != "asc" {
		t.Fatalf("expected date and sort filters forwarded, got %#v", repo.lastSalesOrderFilter)
	}

	_, invalidRes, err := j.handleSalesOrder(
		workflowJSONRPCAdminContext(),
		"list_sales_orders",
		"2",
		mustJSONRPCStruct(t, map[string]any{"date_from": "not-a-date"}),
	)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if invalidRes == nil || invalidRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected invalid param for bad date filter, got %#v", invalidRes)
	}
}

func TestJsonrpcDispatcher_SaveSalesOrderWithItemsUsesSingleUsecase(t *testing.T) {
	repo := &stubSalesOrderJSONRPCRepo{customerActive: true, productActive: true, unitActive: true}
	j := newSalesOrderJSONRPCTestData(repo, workflowJSONRPCAdmin(
		[]string{biz.SalesRoleKey},
		biz.PermissionSalesOrderCreate,
		biz.PermissionSalesOrderItemCreate,
	))
	params := mustJSONRPCStruct(t, map[string]any{
		"order_no":    "SO-TX-JSONRPC",
		"customer_id": float64(1),
		"order_date":  "2026-06-15",
		"items": []any{
			map[string]any{
				"line_no":          float64(1),
				"product_id":       float64(1),
				"product_sku_id":   float64(10),
				"unit_id":          float64(1),
				"ordered_quantity": "12.5",
			},
		},
	})

	_, res, err := j.handleSalesOrder(workflowJSONRPCAdminContext(), "save_sales_order_with_items", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK, got %#v", res)
	}
	if len(repo.savedItems) != 1 || repo.savedItems[0].SalesOrderID != 0 {
		t.Fatalf("expected save usecase to receive one new item before order id binding, got %#v", repo.savedItems)
	}
	if repo.savedItems[0].ProductSkuID == nil || *repo.savedItems[0].ProductSkuID != 10 {
		t.Fatalf("expected product_sku_id forwarded to save usecase, got %#v", repo.savedItems[0])
	}
	data := res.Data.AsMap()
	items := data["sales_order_items"].([]any)
	if data["sales_order"] == nil || len(items) != 1 {
		t.Fatalf("expected order and items in response, got %#v", data)
	}
	item := items[0].(map[string]any)
	if fmt.Sprint(item["product_sku_id"]) != "10" {
		t.Fatalf("expected product_sku_id in response, got %#v", item)
	}
}

func TestJsonrpcDispatcher_SalesOrderItemAPIUsesUsecaseProductUnitGuard(t *testing.T) {
	repo := &stubSalesOrderJSONRPCRepo{customerActive: true, productActive: false, unitActive: true}
	j := newSalesOrderJSONRPCTestData(repo, workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionSalesOrderItemCreate))
	params := mustJSONRPCStruct(t, map[string]any{
		"sales_order_id":   float64(1),
		"line_no":          float64(1),
		"product_id":       float64(404),
		"unit_id":          float64(1),
		"ordered_quantity": "12.5",
	})

	_, res, err := j.handleSalesOrder(workflowJSONRPCAdminContext(), "add_sales_order_item", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected invalid param for missing product, got %#v", res)
	}
	if repo.addedItem != nil {
		t.Fatalf("sales order item API must not bypass product/unit guard")
	}
}

func TestJsonrpcDispatcher_RBACIncludesV1MasterDataAndOrderPermissions(t *testing.T) {
	salesPermissions := jsonrpcBuiltinRolePermissionSet(t, biz.SalesRoleKey)
	jsonrpcAssertPermissionSetContains(t, salesPermissions,
		biz.PermissionCustomerRead,
		biz.PermissionCustomerCreate,
		biz.PermissionContactSetPrimary,
		biz.PermissionSalesOrderRead,
		biz.PermissionSalesOrderSubmit,
		biz.PermissionSalesOrderItemCancel,
	)
	jsonrpcAssertPermissionSetOmits(t, salesPermissions, biz.PermissionSupplierCreate)

	purchasePermissions := jsonrpcBuiltinRolePermissionSet(t, biz.PurchaseRoleKey)
	jsonrpcAssertPermissionSetContains(t, purchasePermissions,
		biz.PermissionSupplierRead,
		biz.PermissionSupplierCreate,
		biz.PermissionContactSetPrimary,
	)
	jsonrpcAssertPermissionSetOmits(t, purchasePermissions, biz.PermissionSalesOrderCreate)
}

func jsonrpcBuiltinRolePermissionSet(t *testing.T, roleKey string) map[string]struct{} {
	t.Helper()
	for _, role := range biz.BuiltinRoles() {
		if role.Key == roleKey {
			return biz.PermissionKeySet(role.Permissions)
		}
	}
	t.Fatalf("builtin role %s not found", roleKey)
	return nil
}

func jsonrpcAssertPermissionSetContains(t *testing.T, permissionSet map[string]struct{}, keys ...string) {
	t.Helper()
	for _, key := range keys {
		if !biz.PermissionSetHasAll(permissionSet, key) {
			t.Fatalf("expected permission %s", key)
		}
	}
}

func jsonrpcAssertPermissionSetOmits(t *testing.T, permissionSet map[string]struct{}, keys ...string) {
	t.Helper()
	for _, key := range keys {
		if biz.PermissionSetHasAny(permissionSet, key) {
			t.Fatalf("unexpected permission %s", key)
		}
	}
}

func mustJSONRPCStruct(t *testing.T, value map[string]any) *structpb.Struct {
	t.Helper()
	out, err := structpb.NewStruct(value)
	if err != nil {
		t.Fatalf("build params failed: %v", err)
	}
	return out
}
