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
	customerExists      bool
	supplierExists      bool
	productActive       bool
	unitActive          bool
	contactOwnerType    string
	createdCustomer     *biz.CustomerMutation
	updatedCustomer     *biz.CustomerMutation
	customerActiveCalls int
	createdSupplier     *biz.SupplierMutation
	updatedSupplier     *biz.SupplierMutation
	supplierActiveCalls int
	createdMaterial     *biz.MaterialMutation
	updatedMaterial     *biz.MaterialMutation
	materialActiveCalls int
	createdProcess      *biz.ProcessMutation
	updatedProcess      *biz.ProcessMutation
	processActiveCalls  int
	createdProduct      *biz.ProductMutation
	updatedProduct      *biz.ProductMutation
	productActiveCalls  int
	createdSKU          *biz.ProductSKUMutation
	updatedSKU          *biz.ProductSKUMutation
	skuActiveCalls      int
	createdContact      *biz.ContactMutation
	updatedContact      *biz.ContactMutation
	setPrimaryCalls     int
	disableContactCalls int
	savedCustomer       *biz.CustomerMutation
	savedSupplier       *biz.SupplierMutation
	savedContacts       []*biz.ContactSaveMutation
}

func (s *stubMasterDataJSONRPCRepo) CreateCustomer(_ context.Context, in *biz.CustomerMutation) (*biz.Customer, error) {
	s.createdCustomer = in
	return &biz.Customer{ID: 1, Code: in.Code, Name: in.Name, DefaultPaymentMethod: in.DefaultPaymentMethod, DefaultPaymentTermDays: in.DefaultPaymentTermDays, IsActive: true, CreatedAt: time.Unix(1, 0), UpdatedAt: time.Unix(1, 0)}, nil
}

func (s *stubMasterDataJSONRPCRepo) UpdateCustomer(_ context.Context, id int, in *biz.CustomerMutation) (*biz.Customer, error) {
	s.updatedCustomer = in
	return &biz.Customer{ID: id, Code: in.Code, Name: in.Name, DefaultPaymentMethod: in.DefaultPaymentMethod, DefaultPaymentTermDays: in.DefaultPaymentTermDays, IsActive: true}, nil
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
		Customer: &biz.Customer{ID: id, Code: in.Code, Name: in.Name, DefaultPaymentMethod: in.DefaultPaymentMethod, DefaultPaymentTermDays: in.DefaultPaymentTermDays, IsActive: true},
		Contacts: outContacts,
	}, nil
}

func (s *stubMasterDataJSONRPCRepo) GetCustomer(_ context.Context, id int) (*biz.Customer, error) {
	defaultPaymentMethod := "30天月结"
	defaultPaymentTermDays := 30
	return &biz.Customer{ID: id, Code: "C001", Name: "客户", DefaultPaymentMethod: &defaultPaymentMethod, DefaultPaymentTermDays: &defaultPaymentTermDays, IsActive: true}, nil
}

func (s *stubMasterDataJSONRPCRepo) ListCustomers(context.Context, biz.MasterDataFilter) ([]*biz.Customer, int, error) {
	defaultPaymentMethod := "现结"
	defaultPaymentTermDays := 0
	return []*biz.Customer{{ID: 1, Code: "C001", Name: "客户", DefaultPaymentMethod: &defaultPaymentMethod, DefaultPaymentTermDays: &defaultPaymentTermDays, IsActive: true}}, 1, nil
}

func (s *stubMasterDataJSONRPCRepo) SetCustomerActive(_ context.Context, id int, active bool) (*biz.Customer, error) {
	s.customerActiveCalls++
	return &biz.Customer{ID: id, Code: "C001", Name: "客户", IsActive: active}, nil
}

func (s *stubMasterDataJSONRPCRepo) CustomerExists(context.Context, int) (bool, error) {
	return s.customerExists, nil
}

func (s *stubMasterDataJSONRPCRepo) CreateSupplier(_ context.Context, in *biz.SupplierMutation) (*biz.Supplier, error) {
	s.createdSupplier = in
	return &biz.Supplier{ID: 1, Code: in.Code, Name: in.Name, IsActive: true}, nil
}

func (s *stubMasterDataJSONRPCRepo) UpdateSupplier(_ context.Context, id int, in *biz.SupplierMutation) (*biz.Supplier, error) {
	s.updatedSupplier = in
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
	s.supplierActiveCalls++
	return &biz.Supplier{ID: id, Code: "S001", Name: "供应商", IsActive: active}, nil
}

func (s *stubMasterDataJSONRPCRepo) SupplierExists(context.Context, int) (bool, error) {
	return s.supplierExists, nil
}

func (s *stubMasterDataJSONRPCRepo) CreateMaterial(_ context.Context, in *biz.MaterialMutation) (*biz.Material, error) {
	s.createdMaterial = in
	return &biz.Material{ID: 1, Code: in.Code, Name: in.Name, DefaultUnitID: in.DefaultUnitID, IsActive: true}, nil
}

func (s *stubMasterDataJSONRPCRepo) UpdateMaterial(_ context.Context, id int, in *biz.MaterialMutation) (*biz.Material, error) {
	s.updatedMaterial = in
	return &biz.Material{ID: id, Code: in.Code, Name: in.Name, DefaultUnitID: in.DefaultUnitID, IsActive: true}, nil
}

func (s *stubMasterDataJSONRPCRepo) GetMaterial(_ context.Context, id int) (*biz.Material, error) {
	return &biz.Material{ID: id, Code: "M001", Name: "材料", DefaultUnitID: 1, IsActive: true}, nil
}

func (s *stubMasterDataJSONRPCRepo) ListMaterials(context.Context, biz.MasterDataFilter) ([]*biz.Material, int, error) {
	return []*biz.Material{{ID: 1, Code: "M001", Name: "材料", DefaultUnitID: 1, IsActive: true}}, 1, nil
}

func (s *stubMasterDataJSONRPCRepo) SetMaterialActive(_ context.Context, id int, active bool) (*biz.Material, error) {
	s.materialActiveCalls++
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
	s.updatedProcess = in
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
	s.processActiveCalls++
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
	return &biz.Product{ID: 1, Code: in.Code, Name: in.Name, DefaultUnitID: in.DefaultUnitID, UnitNetWeightG: in.UnitNetWeightG, IsActive: true, CreatedAt: time.Unix(1, 0), UpdatedAt: time.Unix(1, 0)}, nil
}
func (s *stubMasterDataJSONRPCRepo) UpdateProduct(_ context.Context, id int, in *biz.ProductMutation) (*biz.Product, error) {
	s.updatedProduct = in
	return &biz.Product{ID: id, Code: in.Code, Name: in.Name, DefaultUnitID: in.DefaultUnitID, UnitNetWeightG: in.UnitNetWeightG, IsActive: true, CreatedAt: time.Unix(1, 0), UpdatedAt: time.Unix(1, 0)}, nil
}
func (s *stubMasterDataJSONRPCRepo) GetProduct(_ context.Context, id int) (*biz.Product, error) {
	return &biz.Product{ID: id, Code: "P001", Name: "产品", DefaultUnitID: 1, IsActive: true, CreatedAt: time.Unix(1, 0), UpdatedAt: time.Unix(1, 0)}, nil
}
func (s *stubMasterDataJSONRPCRepo) ListProducts(context.Context, biz.MasterDataFilter) ([]*biz.Product, int, error) {
	return []*biz.Product{{ID: 1, Code: "P001", Name: "产品", DefaultUnitID: 1, IsActive: true, CreatedAt: time.Unix(1, 0), UpdatedAt: time.Unix(1, 0)}}, 1, nil
}
func (s *stubMasterDataJSONRPCRepo) SetProductActive(_ context.Context, id int, active bool) (*biz.Product, error) {
	s.productActiveCalls++
	return &biz.Product{ID: id, Code: "P001", Name: "产品", DefaultUnitID: 1, IsActive: active, CreatedAt: time.Unix(1, 0), UpdatedAt: time.Unix(1, 0)}, nil
}
func (s *stubMasterDataJSONRPCRepo) CreateProductSKU(_ context.Context, in *biz.ProductSKUMutation) (*biz.ProductSKU, error) {
	s.createdSKU = in
	return &biz.ProductSKU{ID: 1, ProductID: in.ProductID, SKUCode: in.SKUCode, SKUName: in.SKUName, DefaultUnitID: in.DefaultUnitID, UnitNetWeightG: in.UnitNetWeightG, IsActive: true, CreatedAt: time.Unix(1, 0), UpdatedAt: time.Unix(1, 0)}, nil
}
func (s *stubMasterDataJSONRPCRepo) UpdateProductSKU(_ context.Context, id int, in *biz.ProductSKUMutation) (*biz.ProductSKU, error) {
	s.updatedSKU = in
	return &biz.ProductSKU{ID: id, ProductID: in.ProductID, SKUCode: in.SKUCode, DefaultUnitID: in.DefaultUnitID, UnitNetWeightG: in.UnitNetWeightG, IsActive: true, CreatedAt: time.Unix(1, 0), UpdatedAt: time.Unix(1, 0)}, nil
}
func (s *stubMasterDataJSONRPCRepo) GetProductSKU(_ context.Context, id int) (*biz.ProductSKU, error) {
	return &biz.ProductSKU{ID: id, ProductID: 1, SKUCode: "SKU-001", IsActive: true, CreatedAt: time.Unix(1, 0), UpdatedAt: time.Unix(1, 0)}, nil
}
func (s *stubMasterDataJSONRPCRepo) ListProductSKUs(context.Context, biz.ProductSKUFilter) ([]*biz.ProductSKU, int, error) {
	return []*biz.ProductSKU{{ID: 1, ProductID: 1, SKUCode: "SKU-001", IsActive: true, CreatedAt: time.Unix(1, 0), UpdatedAt: time.Unix(1, 0)}}, 1, nil
}
func (s *stubMasterDataJSONRPCRepo) SetProductSKUActive(_ context.Context, id int, active bool) (*biz.ProductSKU, error) {
	s.skuActiveCalls++
	return &biz.ProductSKU{ID: id, ProductID: 1, SKUCode: "SKU-001", IsActive: active, CreatedAt: time.Unix(1, 0), UpdatedAt: time.Unix(1, 0)}, nil
}

func (s *stubMasterDataJSONRPCRepo) CreateContact(_ context.Context, in *biz.ContactMutation) (*biz.Contact, error) {
	s.createdContact = in
	return &biz.Contact{ID: 1, OwnerType: in.OwnerType, OwnerID: in.OwnerID, Name: in.Name, IsActive: true, IsPrimary: in.IsPrimary}, nil
}

func (s *stubMasterDataJSONRPCRepo) UpdateContact(_ context.Context, id int, in *biz.ContactMutation) (*biz.Contact, error) {
	s.updatedContact = in
	return &biz.Contact{ID: id, OwnerType: in.OwnerType, OwnerID: in.OwnerID, Name: in.Name, IsActive: true, IsPrimary: in.IsPrimary}, nil
}

func (s *stubMasterDataJSONRPCRepo) GetContact(_ context.Context, id int) (*biz.Contact, error) {
	ownerType := s.contactOwnerType
	if ownerType == "" {
		ownerType = biz.ContactOwnerCustomer
	}
	return &biz.Contact{ID: id, OwnerType: ownerType, OwnerID: 1, Name: "联系人", IsActive: true}, nil
}

func (s *stubMasterDataJSONRPCRepo) ListContactsByOwner(context.Context, biz.ContactFilter) ([]*biz.Contact, int, error) {
	return []*biz.Contact{{ID: 1, OwnerType: biz.ContactOwnerCustomer, OwnerID: 1, Name: "联系人", IsActive: true}}, 1, nil
}

func (s *stubMasterDataJSONRPCRepo) SetPrimaryContact(_ context.Context, id int) (*biz.Contact, error) {
	s.setPrimaryCalls++
	return &biz.Contact{ID: id, OwnerType: biz.ContactOwnerCustomer, OwnerID: 1, Name: "联系人", IsActive: true, IsPrimary: true}, nil
}

func (s *stubMasterDataJSONRPCRepo) DisableContact(_ context.Context, id int) (*biz.Contact, error) {
	s.disableContactCalls++
	return &biz.Contact{ID: id, OwnerType: biz.ContactOwnerCustomer, OwnerID: 1, Name: "联系人", IsActive: false}, nil
}

type stubSalesOrderJSONRPCRepo struct {
	customerActive       bool
	productActive        bool
	unitActive           bool
	addedItem            *biz.SalesOrderItemMutation
	savedOrder           *biz.SalesOrderMutation
	savedItems           []*biz.SalesOrderItemSaveMutation
	lifecycleStatus      string
	cancelActorID        int
	lastSalesOrderFilter biz.SalesOrderFilter
	saveErr              error
}

func (s *stubSalesOrderJSONRPCRepo) CreateSalesOrder(_ context.Context, in *biz.SalesOrderMutation) (*biz.SalesOrder, error) {
	s.savedOrder = in
	return &biz.SalesOrder{ID: 1, OrderNo: in.OrderNo, CustomerID: in.CustomerID, SalesOwner: in.SalesOwner, ContactSnapshot: in.ContactSnapshot, PaymentMethod: in.PaymentMethod, PaymentTermDays: in.PaymentTermDays, PriceConditionNote: in.PriceConditionNote, OrderDate: in.OrderDate, LifecycleStatus: biz.SalesOrderStatusDraft}, nil
}

func (s *stubSalesOrderJSONRPCRepo) UpdateSalesOrder(_ context.Context, id int, in *biz.SalesOrderMutation) (*biz.SalesOrder, error) {
	s.savedOrder = in
	return &biz.SalesOrder{ID: id, OrderNo: in.OrderNo, CustomerID: in.CustomerID, SalesOwner: in.SalesOwner, ContactSnapshot: in.ContactSnapshot, PaymentMethod: in.PaymentMethod, PaymentTermDays: in.PaymentTermDays, PriceConditionNote: in.PriceConditionNote, OrderDate: in.OrderDate, LifecycleStatus: biz.SalesOrderStatusDraft}, nil
}

func (s *stubSalesOrderJSONRPCRepo) GetSalesOrder(_ context.Context, id int) (*biz.SalesOrder, error) {
	return &biz.SalesOrder{ID: id, OrderNo: "SO001", CustomerID: 1, OrderDate: time.Unix(1, 0), LifecycleStatus: biz.SalesOrderStatusDraft, Version: 1}, nil
}

func (s *stubSalesOrderJSONRPCRepo) ListSalesOrders(_ context.Context, filter biz.SalesOrderFilter) ([]*biz.SalesOrder, int, error) {
	s.lastSalesOrderFilter = filter
	paymentMethod := "30天月结"
	paymentTermDays := 30
	salesOwner := "张三"
	itemCount := 3
	return []*biz.SalesOrder{{ID: 1, OrderNo: "SO001", CustomerID: 1, SalesOwner: &salesOwner, ContactSnapshot: map[string]any{"name": "李四"}, PaymentMethod: &paymentMethod, PaymentTermDays: &paymentTermDays, OrderDate: time.Unix(1, 0), LifecycleStatus: biz.SalesOrderStatusDraft, ItemCount: &itemCount}}, 1, nil
}

func (s *stubSalesOrderJSONRPCRepo) UpdateSalesOrderLifecycle(_ context.Context, id int, lifecycleStatus string) (*biz.SalesOrder, error) {
	s.lifecycleStatus = lifecycleStatus
	return &biz.SalesOrder{ID: id, OrderNo: "SO001", CustomerID: 1, OrderDate: time.Unix(1, 0), LifecycleStatus: lifecycleStatus}, nil
}

func (s *stubSalesOrderJSONRPCRepo) CancelSalesOrderWithActor(_ context.Context, id int, actorID int) (*biz.SalesOrder, error) {
	s.cancelActorID = actorID
	s.lifecycleStatus = biz.SalesOrderStatusCanceled
	return &biz.SalesOrder{ID: id, OrderNo: "SO001", CustomerID: 1, OrderDate: time.Unix(1, 0), LifecycleStatus: biz.SalesOrderStatusCanceled}, nil
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
	s.savedOrder = in
	s.savedItems = items
	if s.saveErr != nil {
		return nil, s.saveErr
	}
	orderID := id
	if orderID <= 0 {
		orderID = 1
	}
	version := 1
	if id > 0 {
		version = in.ExpectedVersion + 1
	}
	out := &biz.SalesOrderWithItems{
		Order: &biz.SalesOrder{ID: orderID, OrderNo: in.OrderNo, CustomerID: in.CustomerID, SalesOwner: in.SalesOwner, ContactSnapshot: in.ContactSnapshot, PaymentMethod: in.PaymentMethod, PaymentTermDays: in.PaymentTermDays, PriceConditionNote: in.PriceConditionNote, OrderDate: in.OrderDate, LifecycleStatus: biz.SalesOrderStatusDraft, Version: version},
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

func (s *stubSalesOrderJSONRPCRepo) ProductSKUIsActiveForProduct(context.Context, int, int) (bool, error) {
	return true, nil
}

func (s *stubSalesOrderJSONRPCRepo) UnitIsActive(context.Context, int) (bool, error) {
	if !s.unitActive {
		return false, biz.ErrUnitNotFound
	}
	return true, nil
}

func newMasterDataJSONRPCTestData(t *testing.T, repo *stubMasterDataJSONRPCRepo, admin *biz.AdminUser) *jsonrpcDispatcher {
	t.Helper()
	dispatcher := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.masterdata.test")),
		adminReader:      stubAdminAccountReader{admin: admin},
		masterDataUC:     biz.NewMasterDataUsecase(repo),
		customerConfigUC: biz.NewCustomerConfigUsecase(newServiceCustomerConfigRepo()),
	}
	params := customerConfigPublishParams(t)
	for _, moduleKey := range []string{
		masterDataModuleKeyCustomers,
		masterDataModuleKeySuppliers,
		masterDataModuleKeyMaterials,
		masterDataModuleKeyProducts,
		masterDataModuleKeyProcesses,
	} {
		params = customerConfigPublishParamsWithRevisionAndModuleState(
			t,
			params,
			"2026.06.30.masterdata-enabled",
			moduleKey,
			"enabled",
		)
	}
	activateOperationalFactTestCustomerConfig(t, dispatcher, params)
	return dispatcher
}

func activateMasterDataTestModuleState(t *testing.T, dispatcher *jsonrpcDispatcher, revision string, moduleKey string, state string) {
	t.Helper()
	activateOperationalFactTestCustomerConfig(t, dispatcher, customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		revision,
		moduleKey,
		state,
	))
}

func newSalesOrderJSONRPCTestData(t *testing.T, repo *stubSalesOrderJSONRPCRepo, admin *biz.AdminUser) *jsonrpcDispatcher {
	t.Helper()
	dispatcher := &jsonrpcDispatcher{
		log:              log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.sales_order.test")),
		adminReader:      stubAdminAccountReader{admin: admin},
		salesOrderUC:     biz.NewSalesOrderUsecase(repo),
		customerConfigUC: biz.NewCustomerConfigUsecase(newServiceCustomerConfigRepo()),
	}
	activateOperationalFactTestCustomerConfig(t, dispatcher, customerConfigPublishParams(t))
	return dispatcher
}

func TestJsonrpcDispatcher_MasterDataCreateCustomerRequiresAdminAndPermission(t *testing.T) {
	params := mustJSONRPCStruct(t, map[string]any{"code": "C001", "name": "客户"})

	j := newMasterDataJSONRPCTestData(t, &stubMasterDataJSONRPCRepo{}, workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionCustomerCreate))
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
	j = newMasterDataJSONRPCTestData(t, &stubMasterDataJSONRPCRepo{}, disabledAdmin)
	_, disabledRes, err := j.handleMasterData(workflowJSONRPCAdminContext(), "create_customer", "3", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if disabledRes == nil || disabledRes.Code != errcode.AdminDisabled.Code {
		t.Fatalf("expected admin disabled, got %#v", disabledRes)
	}

	j = newMasterDataJSONRPCTestData(t, &stubMasterDataJSONRPCRepo{}, workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionCustomerRead))
	_, deniedRes, err := j.handleMasterData(workflowJSONRPCAdminContext(), "create_customer", "4", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if deniedRes == nil || deniedRes.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected permission denied, got %#v", deniedRes)
	}

	j = newMasterDataJSONRPCTestData(t, &stubMasterDataJSONRPCRepo{}, workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionCustomerCreate))
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
	j := newMasterDataJSONRPCTestData(t, repo, workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionContactCreate))
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
		"code":                      "C-AGG",
		"name":                      "聚合客户",
		"default_payment_method":    "现结",
		"default_payment_term_days": float64(0),
		"contacts": []any{
			map[string]any{
				"name":       "主联系人",
				"mobile":     "13800000000",
				"is_primary": true,
			},
		},
	})

	j := newMasterDataJSONRPCTestData(t,
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
	j = newMasterDataJSONRPCTestData(t,
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
	if repo.savedCustomer.DefaultPaymentMethod == nil || *repo.savedCustomer.DefaultPaymentMethod != "现结" || repo.savedCustomer.DefaultPaymentTermDays == nil || *repo.savedCustomer.DefaultPaymentTermDays != 0 {
		t.Fatalf("expected customer payment defaults forwarded, got %#v", repo.savedCustomer)
	}
}

func TestJsonrpcDispatcher_MaterialAPIRequiresPermissionAndValidUnit(t *testing.T) {
	params := mustJSONRPCStruct(t, map[string]any{
		"code":            "M001",
		"name":            "PP 棉",
		"default_unit_id": float64(1),
	})

	j := newMasterDataJSONRPCTestData(t, &stubMasterDataJSONRPCRepo{unitActive: true}, workflowJSONRPCAdmin([]string{biz.PurchaseRoleKey}, biz.PermissionMaterialRead))
	_, deniedRes, err := j.handleMasterData(workflowJSONRPCAdminContext(), "create_material", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if deniedRes == nil || deniedRes.Code != errcode.PermissionDenied.Code {
		t.Fatalf("expected permission denied, got %#v", deniedRes)
	}

	j = newMasterDataJSONRPCTestData(t, &stubMasterDataJSONRPCRepo{unitActive: false}, workflowJSONRPCAdmin([]string{biz.PurchaseRoleKey}, biz.PermissionMaterialCreate))
	_, invalidUnitRes, err := j.handleMasterData(workflowJSONRPCAdminContext(), "create_material", "2", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if invalidUnitRes == nil || invalidUnitRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected invalid param for missing unit, got %#v", invalidUnitRes)
	}

	j = newMasterDataJSONRPCTestData(t, &stubMasterDataJSONRPCRepo{unitActive: true}, workflowJSONRPCAdmin([]string{biz.PurchaseRoleKey}, biz.PermissionMaterialCreate))
	_, okRes, err := j.handleMasterData(workflowJSONRPCAdminContext(), "create_material", "3", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if okRes == nil || okRes.Code != errcode.OK.Code {
		t.Fatalf("expected OK, got %#v", okRes)
	}
}

func TestJsonrpcDispatcher_ListUnitsUsesMaterialReadPermission(t *testing.T) {
	j := newMasterDataJSONRPCTestData(t,
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

	j = newMasterDataJSONRPCTestData(t,
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
	j := newMasterDataJSONRPCTestData(t,
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

	j = newMasterDataJSONRPCTestData(t,
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

	j := newMasterDataJSONRPCTestData(t,
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
	j = newMasterDataJSONRPCTestData(t,
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

func TestJsonrpcDispatcher_ProcessAPIRequiresEnabledModule(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	params := mustJSONRPCStruct(t, map[string]any{
		"code":                "PROC-MODULE-GATE",
		"name":                "门禁工序",
		"outsourcing_enabled": true,
		"inhouse_enabled":     false,
	})
	admin := workflowJSONRPCAdmin(
		[]string{biz.EngineeringRoleKey},
		biz.PermissionProcessCreate,
		biz.PermissionProcessUpdate,
		biz.PermissionProcessDisable,
		biz.PermissionProcessRead,
	)
	repo := &stubMasterDataJSONRPCRepo{}
	j := newMasterDataJSONRPCTestData(t, repo, admin)

	readOnlyConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.30.processes-read-only",
		masterDataModuleKeyProcesses,
		"read_only",
	)
	activateOperationalFactTestCustomerConfig(t, j, readOnlyConfig)
	_, createRes, err := j.handleMasterData(ctx, "create_process", "read-only-create", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if createRes == nil || createRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected read_only processes create rejected, got %#v", createRes)
	}
	if repo.createdProcess != nil {
		t.Fatalf("read_only processes must not create process, got %#v", repo.createdProcess)
	}
	_, listRes, err := j.handleMasterData(ctx, "list_processes", "read-after-read-only", mustJSONRPCStruct(t, map[string]any{"limit": 20}))
	if err != nil {
		t.Fatalf("expected nil err listing historical processes, got %v", err)
	}
	if listRes == nil || listRes.Code != errcode.OK.Code {
		t.Fatalf("expected list_processes to remain available for historical read, got %#v", listRes)
	}

	enabledConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.30.processes-enabled",
		masterDataModuleKeyProcesses,
		"enabled",
	)
	activateOperationalFactTestCustomerConfig(t, j, enabledConfig)
	_, createRes, err = j.handleMasterData(ctx, "create_process", "enabled-create", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if createRes == nil || createRes.Code != errcode.OK.Code {
		t.Fatalf("expected enabled processes create OK, got %#v", createRes)
	}
	if repo.createdProcess == nil || repo.createdProcess.Code != "PROC-MODULE-GATE" {
		t.Fatalf("enabled processes must reach create usecase, got %#v", repo.createdProcess)
	}
	_, updateRes, err := j.handleMasterData(ctx, "update_process", "enabled-update", mustJSONRPCStruct(t, map[string]any{
		"id":                  float64(1),
		"code":                "PROC-MODULE-GATE-2",
		"name":                "门禁工序更新",
		"outsourcing_enabled": true,
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if updateRes == nil || updateRes.Code != errcode.OK.Code {
		t.Fatalf("expected enabled processes update OK, got %#v", updateRes)
	}
	if repo.updatedProcess == nil || repo.updatedProcess.Code != "PROC-MODULE-GATE-2" {
		t.Fatalf("enabled processes must reach update usecase, got %#v", repo.updatedProcess)
	}

	disabledConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.30.processes-disabled",
		masterDataModuleKeyProcesses,
		"disabled",
	)
	activateOperationalFactTestCustomerConfig(t, j, disabledConfig)
	repo.processActiveCalls = 0
	_, activeRes, err := j.handleMasterData(ctx, "set_process_active", "disabled-active", mustJSONRPCStruct(t, map[string]any{
		"id":     float64(1),
		"active": false,
	}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if activeRes == nil || activeRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected disabled processes active toggle rejected, got %#v", activeRes)
	}
	if repo.processActiveCalls != 0 {
		t.Fatalf("disabled processes must not toggle active state, calls=%d", repo.processActiveCalls)
	}
	_, getRes, err := j.handleMasterData(ctx, "get_process", "read-after-disabled", mustJSONRPCStruct(t, map[string]any{"id": float64(1)}))
	if err != nil {
		t.Fatalf("expected nil err reading historical process, got %v", err)
	}
	if getRes == nil || getRes.Code != errcode.OK.Code {
		t.Fatalf("expected get_process to remain available for historical read, got %#v", getRes)
	}
}

func TestJsonrpcDispatcher_MasterDataCoreAPIRequiresEnabledModules(t *testing.T) {
	ctx := workflowJSONRPCAdminContext()
	admin := workflowJSONRPCAdmin(
		[]string{biz.SalesRoleKey, biz.PurchaseRoleKey, biz.EngineeringRoleKey},
		biz.PermissionCustomerCreate,
		biz.PermissionCustomerUpdate,
		biz.PermissionCustomerDisable,
		biz.PermissionCustomerRead,
		biz.PermissionSupplierCreate,
		biz.PermissionSupplierUpdate,
		biz.PermissionSupplierDisable,
		biz.PermissionSupplierRead,
		biz.PermissionContactCreate,
		biz.PermissionContactUpdate,
		biz.PermissionContactSetPrimary,
		biz.PermissionContactDisable,
		biz.PermissionContactRead,
		biz.PermissionMaterialCreate,
		biz.PermissionMaterialUpdate,
		biz.PermissionMaterialDisable,
		biz.PermissionMaterialRead,
		biz.PermissionProductCreate,
		biz.PermissionProductUpdate,
		biz.PermissionProductDisable,
		biz.PermissionProductRead,
		biz.PermissionProductSKUCreate,
		biz.PermissionProductSKUUpdate,
		biz.PermissionProductSKUDisable,
		biz.PermissionProductSKURead,
	)
	customerParams := mustJSONRPCStruct(t, map[string]any{"code": "C-MODULE", "name": "门禁客户"})
	supplierParams := mustJSONRPCStruct(t, map[string]any{
		"code": "S-MODULE",
		"name": "门禁供应商",
		"contacts": []any{
			map[string]any{"name": "供应商联系人", "owner_type": biz.ContactOwnerSupplier, "owner_id": float64(1)},
		},
	})
	materialParams := mustJSONRPCStruct(t, map[string]any{"code": "M-MODULE", "name": "门禁材料", "default_unit_id": float64(1)})
	productParams := mustJSONRPCStruct(t, map[string]any{"code": "P-MODULE", "name": "门禁产品", "default_unit_id": float64(1)})
	skuParams := mustJSONRPCStruct(t, map[string]any{"product_id": float64(1), "sku_code": "SKU-MODULE", "default_unit_id": float64(1)})
	supplierContactParams := mustJSONRPCStruct(t, map[string]any{"owner_type": biz.ContactOwnerSupplier, "owner_id": float64(1), "name": "供应商联系人"})

	repo := &stubMasterDataJSONRPCRepo{customerExists: true, supplierExists: true, productActive: true, unitActive: true}
	j := newMasterDataJSONRPCTestData(t, repo, admin)

	activateMasterDataTestModuleState(t, j, "2026.06.30.masterdata-customers-read-only", masterDataModuleKeyCustomers, "read_only")
	_, customerCreateRes, err := j.handleMasterData(ctx, "create_customer", "customers-read-only-create", customerParams)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if customerCreateRes == nil || customerCreateRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected read_only customers create rejected, got %#v", customerCreateRes)
	}
	if repo.createdCustomer != nil {
		t.Fatalf("read_only customers must not call create, got %#v", repo.createdCustomer)
	}
	_, customerListRes, err := j.handleMasterData(ctx, "list_customers", "customers-read-only-list", mustJSONRPCStruct(t, map[string]any{}))
	if err != nil {
		t.Fatalf("expected nil err listing historical customers, got %v", err)
	}
	if customerListRes == nil || customerListRes.Code != errcode.OK.Code {
		t.Fatalf("expected list_customers to remain available, got %#v", customerListRes)
	}

	activateMasterDataTestModuleState(t, j, "2026.06.30.masterdata-customers-enabled", masterDataModuleKeyCustomers, "enabled")
	_, customerUpdateRes, err := j.handleMasterData(ctx, "update_customer", "customers-enabled-update", mustJSONRPCStruct(t, map[string]any{"id": float64(1), "code": "C-MODULE-2", "name": "门禁客户更新"}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if customerUpdateRes == nil || customerUpdateRes.Code != errcode.OK.Code {
		t.Fatalf("expected enabled customers update OK, got %#v", customerUpdateRes)
	}
	if repo.updatedCustomer == nil || repo.updatedCustomer.Code != "C-MODULE-2" {
		t.Fatalf("enabled customers must reach update usecase, got %#v", repo.updatedCustomer)
	}

	activateMasterDataTestModuleState(t, j, "2026.06.30.masterdata-suppliers-disabled", masterDataModuleKeySuppliers, "disabled")
	_, supplierSaveRes, err := j.handleMasterData(ctx, "save_supplier_with_contacts", "suppliers-disabled-save", supplierParams)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if supplierSaveRes == nil || supplierSaveRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected disabled suppliers aggregate save rejected, got %#v", supplierSaveRes)
	}
	if repo.savedSupplier != nil {
		t.Fatalf("disabled suppliers must not call aggregate save, got %#v", repo.savedSupplier)
	}
	_, supplierListRes, err := j.handleMasterData(ctx, "list_suppliers", "suppliers-disabled-list", mustJSONRPCStruct(t, map[string]any{}))
	if err != nil {
		t.Fatalf("expected nil err listing historical suppliers, got %v", err)
	}
	if supplierListRes == nil || supplierListRes.Code != errcode.OK.Code {
		t.Fatalf("expected list_suppliers to remain available, got %#v", supplierListRes)
	}

	activateMasterDataTestModuleState(t, j, "2026.06.30.masterdata-materials-read-only", masterDataModuleKeyMaterials, "read_only")
	_, materialCreateRes, err := j.handleMasterData(ctx, "create_material", "materials-read-only-create", materialParams)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if materialCreateRes == nil || materialCreateRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected read_only materials create rejected, got %#v", materialCreateRes)
	}
	if repo.createdMaterial != nil {
		t.Fatalf("read_only materials must not call create, got %#v", repo.createdMaterial)
	}
	_, materialListRes, err := j.handleMasterData(ctx, "list_materials", "materials-read-only-list", mustJSONRPCStruct(t, map[string]any{}))
	if err != nil {
		t.Fatalf("expected nil err listing historical materials, got %v", err)
	}
	if materialListRes == nil || materialListRes.Code != errcode.OK.Code {
		t.Fatalf("expected list_materials to remain available, got %#v", materialListRes)
	}

	activateMasterDataTestModuleState(t, j, "2026.06.30.masterdata-products-disabled", masterDataModuleKeyProducts, "disabled")
	_, productCreateRes, err := j.handleMasterData(ctx, "create_product", "products-disabled-create", productParams)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if productCreateRes == nil || productCreateRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected disabled products create rejected, got %#v", productCreateRes)
	}
	if repo.createdProduct != nil {
		t.Fatalf("disabled products must not call create, got %#v", repo.createdProduct)
	}
	_, skuCreateRes, err := j.handleMasterData(ctx, "create_product_sku", "products-disabled-sku-create", skuParams)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if skuCreateRes == nil || skuCreateRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected disabled products SKU create rejected, got %#v", skuCreateRes)
	}
	if repo.createdSKU != nil {
		t.Fatalf("disabled products must not call SKU create, got %#v", repo.createdSKU)
	}
	_, skuListRes, err := j.handleMasterData(ctx, "list_product_skus", "products-disabled-sku-list", mustJSONRPCStruct(t, map[string]any{}))
	if err != nil {
		t.Fatalf("expected nil err listing historical SKUs, got %v", err)
	}
	if skuListRes == nil || skuListRes.Code != errcode.OK.Code {
		t.Fatalf("expected list_product_skus to remain available, got %#v", skuListRes)
	}

	activateMasterDataTestModuleState(t, j, "2026.06.30.masterdata-suppliers-read-only", masterDataModuleKeySuppliers, "read_only")
	_, contactCreateRes, err := j.handleMasterData(ctx, "create_contact", "supplier-contact-read-only-create", supplierContactParams)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if contactCreateRes == nil || contactCreateRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected supplier contact create rejected when suppliers read_only, got %#v", contactCreateRes)
	}
	if repo.createdContact != nil {
		t.Fatalf("read_only supplier contacts must not call create, got %#v", repo.createdContact)
	}
	repo.contactOwnerType = biz.ContactOwnerSupplier
	_, contactDisableRes, err := j.handleMasterData(ctx, "disable_contact", "supplier-contact-read-only-disable", mustJSONRPCStruct(t, map[string]any{"id": float64(1)}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if contactDisableRes == nil || contactDisableRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected supplier contact disable rejected after owner lookup, got %#v", contactDisableRes)
	}
	if repo.disableContactCalls != 0 {
		t.Fatalf("read_only supplier contacts must not call disable, calls=%d", repo.disableContactCalls)
	}
	_, contactListRes, err := j.handleMasterData(ctx, "list_contacts_by_owner", "supplier-contact-read-only-list", mustJSONRPCStruct(t, map[string]any{"owner_type": biz.ContactOwnerSupplier, "owner_id": float64(1)}))
	if err != nil {
		t.Fatalf("expected nil err listing historical contacts, got %v", err)
	}
	if contactListRes == nil || contactListRes.Code != errcode.OK.Code {
		t.Fatalf("expected list_contacts_by_owner to remain available, got %#v", contactListRes)
	}
}

func TestJsonrpcDispatcher_ProductAPIRequiresPermissionAndValidUnit(t *testing.T) {
	params := mustJSONRPCStruct(t, map[string]any{
		"code":              " P001 ",
		"name":              "毛绒熊",
		"style_no":          "BEAR",
		"default_unit_id":   float64(1),
		"unit_net_weight_g": "0.425000",
	})

	j := newMasterDataJSONRPCTestData(t,
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
	j = newMasterDataJSONRPCTestData(t, repo, workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionProductCreate))
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
	j = newMasterDataJSONRPCTestData(t, repo, workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionProductCreate, biz.PermissionProductRead))
	_, okRes, err := j.handleMasterData(workflowJSONRPCAdminContext(), "create_product", "3", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if okRes == nil || okRes.Code != errcode.OK.Code {
		t.Fatalf("expected OK, got %#v", okRes)
	}
	if repo.createdProduct == nil || repo.createdProduct.Code != "P001" || repo.createdProduct.UnitNetWeightG == nil || !repo.createdProduct.UnitNetWeightG.Equal(decimal.RequireFromString("0.425")) {
		t.Fatalf("expected normalized product mutation, got %#v", repo.createdProduct)
	}
	productData, ok := okRes.Data.AsMap()["product"].(map[string]any)
	if !ok || productData["unit_net_weight_g"] != "0.425" {
		t.Fatalf("expected product unit net weight decimal string, got %#v", okRes.Data.AsMap()["product"])
	}

	repo.createdProduct = nil
	invalidWeightParams := mustJSONRPCStruct(t, map[string]any{
		"code":              "P002",
		"name":              "无效单重产品",
		"default_unit_id":   float64(1),
		"unit_net_weight_g": "not-a-number",
	})
	_, invalidWeightRes, err := j.handleMasterData(workflowJSONRPCAdminContext(), "create_product", "invalid-weight", invalidWeightParams)
	if err != nil {
		t.Fatalf("expected nil err for invalid weight, got %v", err)
	}
	if invalidWeightRes == nil || invalidWeightRes.Code != errcode.InvalidParam.Code || repo.createdProduct != nil {
		t.Fatalf("expected invalid product unit net weight rejected before repo, result=%#v mutation=%#v", invalidWeightRes, repo.createdProduct)
	}

	zeroWeightParams := mustJSONRPCStruct(t, map[string]any{
		"code":              "P003",
		"name":              "零单重产品",
		"default_unit_id":   float64(1),
		"unit_net_weight_g": "0",
	})
	_, zeroWeightRes, err := j.handleMasterData(workflowJSONRPCAdminContext(), "create_product", "zero-weight", zeroWeightParams)
	if err != nil {
		t.Fatalf("expected nil err for zero weight, got %v", err)
	}
	if zeroWeightRes == nil || zeroWeightRes.Code != errcode.InvalidParam.Code || repo.createdProduct != nil {
		t.Fatalf("expected zero product unit net weight rejected, result=%#v mutation=%#v", zeroWeightRes, repo.createdProduct)
	}

	for _, tc := range []struct {
		name   string
		weight any
	}{
		{name: "over-precision", weight: "0.0000001"},
		{name: "overflow", weight: "100000000000000"},
		{name: "json-number", weight: float64(0.425)},
		{name: "large-json-number", weight: float64(99999999999999.99)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo.createdProduct = nil
			invalidParams := mustJSONRPCStruct(t, map[string]any{
				"code":              "P-" + tc.name,
				"name":              "不可存储单重产品",
				"default_unit_id":   float64(1),
				"unit_net_weight_g": tc.weight,
			})
			_, res, handleErr := j.handleMasterData(workflowJSONRPCAdminContext(), "create_product", tc.name, invalidParams)
			if handleErr != nil {
				t.Fatalf("expected nil err for %s weight, got %v", tc.name, handleErr)
			}
			if res == nil || res.Code != errcode.InvalidParam.Code || repo.createdProduct != nil {
				t.Fatalf("expected %s product unit net weight rejected before repo, result=%#v mutation=%#v", tc.name, res, repo.createdProduct)
			}
		})
	}

	updateRepo := &stubMasterDataJSONRPCRepo{unitActive: true}
	updateDispatcher := newMasterDataJSONRPCTestData(t, updateRepo, workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionProductUpdate))
	_, updateRes, err := updateDispatcher.handleMasterData(workflowJSONRPCAdminContext(), "update_product", "clear-weight", mustJSONRPCStruct(t, map[string]any{
		"id":                float64(1),
		"code":              "P001",
		"name":              "毛绒熊",
		"default_unit_id":   float64(1),
		"unit_net_weight_g": nil,
	}))
	if err != nil {
		t.Fatalf("expected nil err clearing product unit net weight, got %v", err)
	}
	if updateRes == nil || updateRes.Code != errcode.OK.Code || updateRepo.updatedProduct == nil || updateRepo.updatedProduct.UnitNetWeightG != nil {
		t.Fatalf("expected explicit null to clear product unit net weight, result=%#v mutation=%#v", updateRes, updateRepo.updatedProduct)
	}
	updatedData, ok := updateRes.Data.AsMap()["product"].(map[string]any)
	if !ok || updatedData["unit_net_weight_g"] != nil {
		t.Fatalf("expected cleared product unit net weight to serialize as null, got %#v", updateRes.Data.AsMap()["product"])
	}

	updateRepo.updatedProduct = nil
	_, omittedRes, err := updateDispatcher.handleMasterData(workflowJSONRPCAdminContext(), "update_product", "omit-weight", mustJSONRPCStruct(t, map[string]any{
		"id":              float64(1),
		"code":            "P001",
		"name":            "毛绒熊",
		"default_unit_id": float64(1),
	}))
	if err != nil {
		t.Fatalf("expected nil err omitting product unit net weight, got %v", err)
	}
	if omittedRes == nil || omittedRes.Code != errcode.OK.Code || updateRepo.updatedProduct == nil || updateRepo.updatedProduct.UnitNetWeightG != nil {
		t.Fatalf("expected omitted unit net weight to follow replacement clear semantics, result=%#v mutation=%#v", omittedRes, updateRepo.updatedProduct)
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
	products := data["products"].([]any)
	if len(products) != 1 || products[0].(map[string]any)["unit_net_weight_g"] != nil {
		t.Fatalf("expected unknown list product unit net weight to serialize as null, got %#v", products)
	}
}

func TestJsonrpcDispatcher_ProductSKUAPIRequiresPermissionAndValidRefs(t *testing.T) {
	params := mustJSONRPCStruct(t, map[string]any{
		"product_id":        float64(1),
		"sku_code":          " SKU-001 ",
		"sku_name":          "红色小号",
		"default_unit_id":   float64(1),
		"unit_net_weight_g": "0.425000",
	})

	j := newMasterDataJSONRPCTestData(t,
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
	j = newMasterDataJSONRPCTestData(t, repo, workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionProductSKUCreate))
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
	j = newMasterDataJSONRPCTestData(t, repo, workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionProductSKUCreate, biz.PermissionProductSKURead))
	_, okRes, err := j.handleMasterData(workflowJSONRPCAdminContext(), "create_product_sku", "3", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if okRes == nil || okRes.Code != errcode.OK.Code {
		t.Fatalf("expected OK, got %#v", okRes)
	}
	if repo.createdSKU == nil || repo.createdSKU.SKUCode != "SKU-001" || repo.createdSKU.UnitNetWeightG == nil || !repo.createdSKU.UnitNetWeightG.Equal(decimal.RequireFromString("0.425")) {
		t.Fatalf("expected normalized sku mutation, got %#v", repo.createdSKU)
	}
	skuData, ok := okRes.Data.AsMap()["product_sku"].(map[string]any)
	if !ok || skuData["unit_net_weight_g"] != "0.425" {
		t.Fatalf("expected SKU unit net weight decimal string, got %#v", okRes.Data.AsMap()["product_sku"])
	}

	for _, tc := range []struct {
		name   string
		weight any
		unit   any
	}{
		{name: "invalid", weight: "not-a-number", unit: float64(1)},
		{name: "zero", weight: "0", unit: float64(1)},
		{name: "over-precision", weight: "0.0000001", unit: float64(1)},
		{name: "overflow", weight: "100000000000000", unit: float64(1)},
		{name: "json-number", weight: float64(0.425), unit: float64(1)},
		{name: "large-json-number", weight: float64(99999999999999.99), unit: float64(1)},
		{name: "missing-basis-unit", weight: "0.425", unit: nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			repo.createdSKU = nil
			invalidParams := map[string]any{
				"product_id":        float64(1),
				"sku_code":          "SKU-" + tc.name,
				"unit_net_weight_g": tc.weight,
			}
			if tc.unit != nil {
				invalidParams["default_unit_id"] = tc.unit
			}
			_, res, handleErr := j.handleMasterData(workflowJSONRPCAdminContext(), "create_product_sku", "weight-"+tc.name, mustJSONRPCStruct(t, invalidParams))
			if handleErr != nil {
				t.Fatalf("handle invalid SKU weight: %v", handleErr)
			}
			if res == nil || res.Code != errcode.InvalidParam.Code || repo.createdSKU != nil {
				t.Fatalf("expected invalid SKU weight rejected before repo, result=%#v mutation=%#v", res, repo.createdSKU)
			}
		})
	}

	updateRepo := &stubMasterDataJSONRPCRepo{productActive: true, unitActive: true}
	updateDispatcher := newMasterDataJSONRPCTestData(t, updateRepo, workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionProductSKUUpdate))
	_, updateRes, err := updateDispatcher.handleMasterData(workflowJSONRPCAdminContext(), "update_product_sku", "clear-sku-weight", mustJSONRPCStruct(t, map[string]any{
		"id":                float64(1),
		"product_id":        float64(1),
		"sku_code":          "SKU-001",
		"default_unit_id":   nil,
		"unit_net_weight_g": nil,
	}))
	if err != nil {
		t.Fatalf("clear SKU unit net weight: %v", err)
	}
	if updateRes == nil || updateRes.Code != errcode.OK.Code || updateRepo.updatedSKU == nil || updateRepo.updatedSKU.UnitNetWeightG != nil {
		t.Fatalf("expected explicit null to clear SKU unit net weight, result=%#v mutation=%#v", updateRes, updateRepo.updatedSKU)
	}
	updatedSKUData, ok := updateRes.Data.AsMap()["product_sku"].(map[string]any)
	if !ok || updatedSKUData["unit_net_weight_g"] != nil {
		t.Fatalf("expected cleared SKU unit net weight to serialize as null, got %#v", updateRes.Data.AsMap()["product_sku"])
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
	productSKUs := data["product_skus"].([]any)
	if len(productSKUs) != 1 || productSKUs[0].(map[string]any)["unit_net_weight_g"] != nil {
		t.Fatalf("expected unknown list SKU unit net weight to serialize as null, got %#v", productSKUs)
	}
}

func TestJsonrpcDispatcher_SalesOrderAPIRequiresPermissionAndRejectsShipmentVerb(t *testing.T) {
	repo := &stubSalesOrderJSONRPCRepo{customerActive: true, productActive: true, unitActive: true}
	j := newSalesOrderJSONRPCTestData(t, repo, workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionSalesOrderCreate))
	params := mustJSONRPCStruct(t, map[string]any{
		"order_no":             "SO001",
		"customer_id":          float64(1),
		"sales_owner":          "张三",
		"contact_snapshot":     map[string]any{"name": "李四", "phone": "0574-123456"},
		"payment_method":       "30天月结",
		"payment_term_days":    float64(30),
		"price_condition_note": "已按30天重新报价",
		"order_date":           "2026-05-31",
	})

	_, okRes, err := j.handleSalesOrder(workflowJSONRPCAdminContext(), "save_sales_order_with_items", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if okRes == nil || okRes.Code != errcode.OK.Code {
		t.Fatalf("expected OK, got %#v", okRes)
	}
	if repo.savedOrder == nil || repo.savedOrder.PaymentMethod == nil || *repo.savedOrder.PaymentMethod != "30天月结" || repo.savedOrder.PaymentTermDays == nil || *repo.savedOrder.PaymentTermDays != 30 {
		t.Fatalf("expected payment condition forwarded, got %#v", repo.savedOrder)
	}
	if repo.savedOrder.SalesOwner == nil || *repo.savedOrder.SalesOwner != "张三" || repo.savedOrder.ContactSnapshot["name"] != "李四" {
		t.Fatalf("expected owner and contact snapshot forwarded, got %#v", repo.savedOrder)
	}
	orderData := okRes.Data.AsMap()["sales_order"].(map[string]any)
	if fmt.Sprint(orderData["payment_term_days"]) != "30" || orderData["payment_method"] != "30天月结" {
		t.Fatalf("expected payment condition in response, got %#v", orderData)
	}
	if orderData["sales_owner"] != "张三" || orderData["contact_snapshot"] == nil {
		t.Fatalf("expected owner and contact snapshot in response, got %#v", orderData)
	}
	if _, exists := orderData["item_count"]; exists {
		t.Fatalf("save response must not claim an unloaded sales order item count, got %#v", orderData)
	}

	for _, removedMethod := range []string{
		"create_sales_order",
		"update_sales_order",
		"add_sales_order_item",
		"update_sales_order_item",
		"remove_sales_order_item",
	} {
		_, removedRes, removedErr := j.handleSalesOrder(workflowJSONRPCAdminContext(), removedMethod, "removed", params)
		if removedErr != nil {
			t.Fatalf("%s expected nil err, got %v", removedMethod, removedErr)
		}
		if removedRes == nil || removedRes.Code != errcode.UnknownMethod.Code {
			t.Fatalf("legacy split write method %s must stay removed, got %#v", removedMethod, removedRes)
		}
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
	j := newSalesOrderJSONRPCTestData(t, repo, workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionSalesOrderRead))
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
	orders, ok := res.Data.AsMap()["sales_orders"].([]any)
	if !ok || len(orders) != 1 {
		t.Fatalf("expected one sales order, got %#v", res.Data.AsMap()["sales_orders"])
	}
	if _, leaked := orders[0].(map[string]any)["item_count"]; leaked {
		t.Fatalf("sales order list must omit detail count without sales item read permission, got %#v", orders[0])
	}
	if repo.lastSalesOrderFilter.DateField != "order_date" ||
		repo.lastSalesOrderFilter.DateFrom == nil ||
		repo.lastSalesOrderFilter.DateTo == nil ||
		repo.lastSalesOrderFilter.SortBy != "order_date" ||
		repo.lastSalesOrderFilter.SortDirection != "asc" {
		t.Fatalf("expected date and sort filters forwarded, got %#v", repo.lastSalesOrderFilter)
	}

	itemReadDispatcher := newSalesOrderJSONRPCTestData(t, repo, workflowJSONRPCAdmin(
		[]string{biz.SalesRoleKey},
		biz.PermissionSalesOrderRead,
		biz.PermissionSalesOrderItemRead,
	))
	_, itemReadRes, err := itemReadDispatcher.handleSalesOrder(workflowJSONRPCAdminContext(), "list_sales_orders", "item-count", params)
	if err != nil {
		t.Fatalf("expected nil err with detail read permission, got %v", err)
	}
	if itemReadRes == nil || itemReadRes.Code != errcode.OK.Code {
		t.Fatalf("expected OK with detail read permission, got %#v", itemReadRes)
	}
	itemReadOrders := itemReadRes.Data.AsMap()["sales_orders"].([]any)
	if itemCount := jsonRPCInt(t, itemReadOrders[0].(map[string]any), "item_count"); itemCount != 3 {
		t.Fatalf("expected sales order item_count 3, got %d", itemCount)
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
	_, reversedRes, err := j.handleSalesOrder(
		workflowJSONRPCAdminContext(),
		"list_sales_orders",
		"3",
		mustJSONRPCStruct(t, map[string]any{
			"date_from": "2026-06-30",
			"date_to":   "2026-06-01",
		}),
	)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if reversedRes == nil || reversedRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected invalid param for reversed date filter, got %#v", reversedRes)
	}
}

func TestJsonrpcDispatcher_SalesOrderAPIRequiresEnabledModule(t *testing.T) {
	repo := &stubSalesOrderJSONRPCRepo{customerActive: true, productActive: true, unitActive: true}
	j := newSalesOrderJSONRPCTestData(t, repo, workflowJSONRPCAdmin(
		[]string{biz.SalesRoleKey},
		biz.PermissionSalesOrderRead,
		biz.PermissionSalesOrderCreate,
		biz.PermissionSalesOrderSubmit,
		biz.PermissionSalesOrderCancel,
		biz.PermissionSalesOrderItemRead,
	))
	ctx := workflowJSONRPCAdminContext()
	saveParams := mustJSONRPCStruct(t, map[string]any{
		"order_no":    "SO-MODULE-GATE-SAVE",
		"customer_id": float64(1),
		"order_date":  "2026-06-15",
		"items": []any{
			map[string]any{
				"line_no":          float64(1),
				"product_id":       float64(1),
				"unit_id":          float64(1),
				"ordered_quantity": "12.5",
			},
		},
	})

	readOnlyConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.30.sales-orders-read-only",
		"sales_orders",
		"read_only",
	)
	activateOperationalFactTestCustomerConfig(t, j, readOnlyConfig)

	_, saveRes, err := j.handleSalesOrder(ctx, "save_sales_order_with_items", "read-only-save", saveParams)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if saveRes == nil || saveRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected read_only sales_orders save rejected, got %#v", saveRes)
	}
	if len(repo.savedItems) != 0 {
		t.Fatalf("read_only sales_orders must not save items, got %#v", repo.savedItems)
	}
	_, listRes, err := j.handleSalesOrder(ctx, "list_sales_orders", "read-after-read-only", mustJSONRPCStruct(t, map[string]any{"limit": 20}))
	if err != nil {
		t.Fatalf("expected nil err listing historical sales orders, got %v", err)
	}
	if listRes == nil || listRes.Code != errcode.OK.Code {
		t.Fatalf("expected list_sales_orders to remain available for historical read, got %#v", listRes)
	}

	enabledConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.30.sales-orders-enabled",
		"sales_orders",
		"enabled",
	)
	activateOperationalFactTestCustomerConfig(t, j, enabledConfig)
	_, saveRes, err = j.handleSalesOrder(ctx, "save_sales_order_with_items", "enabled-save", saveParams)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if saveRes == nil || saveRes.Code != errcode.OK.Code {
		t.Fatalf("expected enabled sales_orders save OK, got %#v", saveRes)
	}
	if repo.savedOrder == nil || repo.savedOrder.OrderNo != "SO-MODULE-GATE-SAVE" || len(repo.savedItems) != 1 {
		t.Fatalf("enabled sales_orders must reach aggregate save usecase, order=%#v items=%#v", repo.savedOrder, repo.savedItems)
	}
	_, submitRes, err := j.handleSalesOrder(ctx, "submit_sales_order", "enabled-submit", mustJSONRPCStruct(t, map[string]any{"id": float64(1)}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if submitRes == nil || submitRes.Code != errcode.OK.Code || repo.lifecycleStatus != biz.SalesOrderStatusSubmitted {
		t.Fatalf("expected enabled sales_orders submit OK, res=%#v lifecycle=%s", submitRes, repo.lifecycleStatus)
	}
	_, enabledCancelRes, err := j.handleSalesOrder(ctx, "cancel_sales_order", "enabled-cancel", mustJSONRPCStruct(t, map[string]any{"id": float64(1)}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if enabledCancelRes == nil || enabledCancelRes.Code != errcode.OK.Code || repo.cancelActorID != 7 {
		t.Fatalf("expected authenticated sales cancellation actor 7, res=%#v actor=%d", enabledCancelRes, repo.cancelActorID)
	}
	repo.lifecycleStatus = biz.SalesOrderStatusSubmitted

	disabledConfig := customerConfigPublishParamsWithRevisionAndModuleState(
		t,
		customerConfigPublishParams(t),
		"2026.06.30.sales-orders-disabled",
		"sales_orders",
		"disabled",
	)
	activateOperationalFactTestCustomerConfig(t, j, disabledConfig)
	repo.savedOrder = nil
	repo.savedItems = nil
	_, saveRes, err = j.handleSalesOrder(ctx, "save_sales_order_with_items", "disabled-save", saveParams)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if saveRes == nil || saveRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected disabled sales_orders aggregate save rejected, got %#v", saveRes)
	}
	if repo.savedOrder != nil || len(repo.savedItems) != 0 {
		t.Fatalf("disabled sales_orders must not reach aggregate save, order=%#v items=%#v", repo.savedOrder, repo.savedItems)
	}
	_, itemListRes, err := j.handleSalesOrder(ctx, "list_sales_order_items", "read-items-after-disabled", mustJSONRPCStruct(t, map[string]any{"sales_order_id": float64(1)}))
	if err != nil {
		t.Fatalf("expected nil err listing historical sales order items, got %v", err)
	}
	if itemListRes == nil || itemListRes.Code != errcode.OK.Code {
		t.Fatalf("expected list_sales_order_items to remain available for historical read, got %#v", itemListRes)
	}
	_, cancelRes, err := j.handleSalesOrder(ctx, "cancel_sales_order", "disabled-cancel", mustJSONRPCStruct(t, map[string]any{"id": float64(1)}))
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if cancelRes == nil || cancelRes.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected disabled sales_orders cancel rejected, got %#v", cancelRes)
	}
	if repo.lifecycleStatus != biz.SalesOrderStatusSubmitted {
		t.Fatalf("disabled sales_orders must not update lifecycle, got %s", repo.lifecycleStatus)
	}
}

func TestJsonrpcDispatcher_SaveSalesOrderWithItemsUsesSingleUsecase(t *testing.T) {
	repo := &stubSalesOrderJSONRPCRepo{customerActive: true, productActive: true, unitActive: true}
	j := newSalesOrderJSONRPCTestData(t, repo, workflowJSONRPCAdmin(
		[]string{biz.SalesRoleKey},
		biz.PermissionSalesOrderCreate,
	))
	params := mustJSONRPCStruct(t, map[string]any{
		"order_no":             "SO-TX-JSONRPC",
		"customer_id":          float64(1),
		"sales_owner":          "张三",
		"contact_snapshot":     map[string]any{"name": "李四", "email": "buyer@example.com"},
		"payment_method":       "60天月结",
		"payment_term_days":    float64(60),
		"price_condition_note": "本单价格按60天账期",
		"order_date":           "2026-06-15",
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
	if repo.savedOrder == nil || repo.savedOrder.PaymentMethod == nil || *repo.savedOrder.PaymentMethod != "60天月结" || repo.savedOrder.PaymentTermDays == nil || *repo.savedOrder.PaymentTermDays != 60 {
		t.Fatalf("expected order payment condition forwarded, got %#v", repo.savedOrder)
	}
	if repo.savedOrder.SalesOwner == nil || *repo.savedOrder.SalesOwner != "张三" || repo.savedOrder.ContactSnapshot["email"] != "buyer@example.com" {
		t.Fatalf("expected owner and contact snapshot forwarded, got %#v", repo.savedOrder)
	}
	data := res.Data.AsMap()
	items := data["sales_order_items"].([]any)
	if data["sales_order"] == nil || len(items) != 1 {
		t.Fatalf("expected order and items in response, got %#v", data)
	}
	order := data["sales_order"].(map[string]any)
	if order["payment_method"] != "60天月结" || fmt.Sprint(order["payment_term_days"]) != "60" {
		t.Fatalf("expected payment condition in save response, got %#v", order)
	}
	if order["sales_owner"] != "张三" || order["contact_snapshot"] == nil {
		t.Fatalf("expected owner and contact snapshot in save response, got %#v", order)
	}
	item := items[0].(map[string]any)
	if fmt.Sprint(item["product_sku_id"]) != "10" {
		t.Fatalf("expected product_sku_id in response, got %#v", item)
	}
}

func TestJsonrpcDispatcher_SaveExistingSalesOrderDoesNotRequireRemovedItemWritePermissions(t *testing.T) {
	repo := &stubSalesOrderJSONRPCRepo{customerActive: true, productActive: true, unitActive: true}
	j := newSalesOrderJSONRPCTestData(t, repo, workflowJSONRPCAdmin(
		[]string{biz.SalesRoleKey},
		biz.PermissionSalesOrderUpdate,
	))
	params := mustJSONRPCStruct(t, map[string]any{
		"id":               float64(1),
		"expected_version": float64(1),
		"order_no":         "SO-TX-JSONRPC-UPDATE",
		"customer_id":      float64(1),
		"order_date":       "2026-06-15",
		"items": []any{map[string]any{
			"id":               float64(1),
			"line_no":          float64(1),
			"product_id":       float64(1),
			"unit_id":          float64(1),
			"ordered_quantity": "12.5",
		}},
	})

	_, res, err := j.handleSalesOrder(workflowJSONRPCAdminContext(), "save_sales_order_with_items", "update", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected aggregate update OK with sales_order.update only, got %#v", res)
	}
	if repo.savedOrder == nil || repo.savedOrder.OrderNo != "SO-TX-JSONRPC-UPDATE" || len(repo.savedItems) != 1 {
		t.Fatalf("expected aggregate update usecase call, order=%#v items=%#v", repo.savedOrder, repo.savedItems)
	}
}

func TestJsonrpcDispatcher_SalesOrderDraftVersionContract(t *testing.T) {
	repo := &stubSalesOrderJSONRPCRepo{customerActive: true, productActive: true, unitActive: true}
	j := newSalesOrderJSONRPCTestData(t, repo, workflowJSONRPCAdmin(
		[]string{biz.SalesRoleKey},
		biz.PermissionSalesOrderCreate,
		biz.PermissionSalesOrderUpdate,
	))
	ctx := workflowJSONRPCAdminContext()
	paramsForAttempt := func() map[string]any {
		return map[string]any{
			"order_no":    "SO-VERSION-CONTRACT",
			"customer_id": float64(1),
			"order_date":  "2026-07-14",
			"items": []any{map[string]any{
				"id":               float64(1),
				"line_no":          float64(1),
				"product_id":       float64(1),
				"unit_id":          float64(1),
				"ordered_quantity": "1",
			}},
		}
	}

	create := paramsForAttempt()
	delete(create["items"].([]any)[0].(map[string]any), "id")
	_, createRes, err := j.handleSalesOrder(ctx, "save_sales_order_with_items", "create", mustJSONRPCStruct(t, create))
	if err != nil || createRes == nil || createRes.Code != errcode.OK.Code {
		t.Fatalf("create without expected_version must succeed: res=%#v err=%v", createRes, err)
	}
	if version := jsonRPCInt(t, jsonRPCNestedMap(t, createRes, "sales_order"), "version"); version != 1 {
		t.Fatalf("created sales order version = %d, want 1", version)
	}

	for name, value := range map[string]any{"missing": nil, "zero": float64(0), "fraction": float64(1.5), "string": "1"} {
		params := paramsForAttempt()
		params["id"] = float64(1)
		if value != nil {
			params["expected_version"] = value
		}
		repo.savedOrder = nil
		_, res, callErr := j.handleSalesOrder(ctx, "save_sales_order_with_items", name, mustJSONRPCStruct(t, params))
		if callErr != nil || res == nil || res.Code != errcode.InvalidParam.Code || repo.savedOrder != nil {
			t.Fatalf("%s expected_version must fail before save: res=%#v err=%v saved=%#v", name, res, callErr, repo.savedOrder)
		}
	}

	update := paramsForAttempt()
	update["id"] = float64(1)
	update["expected_version"] = float64(1)
	_, updateRes, err := j.handleSalesOrder(ctx, "save_sales_order_with_items", "update", mustJSONRPCStruct(t, update))
	if err != nil || updateRes == nil || updateRes.Code != errcode.OK.Code || repo.savedOrder == nil || repo.savedOrder.ExpectedVersion != 1 {
		t.Fatalf("positive expected_version must reach save: res=%#v err=%v saved=%#v", updateRes, err, repo.savedOrder)
	}
	if version := jsonRPCInt(t, jsonRPCNestedMap(t, updateRes, "sales_order"), "version"); version != 2 {
		t.Fatalf("updated sales order version = %d, want 2", version)
	}

	repo.saveErr = biz.ErrSalesOrderConflict
	_, conflictRes, err := j.handleSalesOrder(ctx, "save_sales_order_with_items", "conflict", mustJSONRPCStruct(t, update))
	if err != nil || conflictRes == nil || conflictRes.Code != errcode.ResourceVersionConflict.Code {
		t.Fatalf("sales version conflict must map to 40922: res=%#v err=%v", conflictRes, err)
	}
}

func TestJsonrpcDispatcher_SaveSalesOrderWithItemsUsesUsecaseProductUnitGuard(t *testing.T) {
	repo := &stubSalesOrderJSONRPCRepo{customerActive: true, productActive: false, unitActive: true}
	j := newSalesOrderJSONRPCTestData(t, repo, workflowJSONRPCAdmin([]string{biz.SalesRoleKey}, biz.PermissionSalesOrderCreate))
	params := mustJSONRPCStruct(t, map[string]any{
		"order_no":    "SO-MISSING-PRODUCT",
		"customer_id": float64(1),
		"order_date":  "2026-06-15",
		"items": []any{map[string]any{
			"line_no":          float64(1),
			"product_id":       float64(404),
			"unit_id":          float64(1),
			"ordered_quantity": "12.5",
		}},
	})

	_, res, err := j.handleSalesOrder(workflowJSONRPCAdminContext(), "save_sales_order_with_items", "1", params)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.InvalidParam.Code {
		t.Fatalf("expected invalid param for missing product, got %#v", res)
	}
	if repo.savedOrder != nil || len(repo.savedItems) != 0 {
		t.Fatalf("aggregate sales order save must not bypass product/unit guard")
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
