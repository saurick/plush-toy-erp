package biz

import (
	"context"
	"errors"
	"strings"
	"time"
)

const (
	ContactOwnerCustomer = "CUSTOMER"
	ContactOwnerSupplier = "SUPPLIER"
)

var (
	ErrCustomerNotFound   = errors.New("customer not found")
	ErrSupplierNotFound   = errors.New("supplier not found")
	ErrMaterialNotFound   = errors.New("material not found")
	ErrProcessNotFound    = errors.New("process not found")
	ErrProductSKUNotFound = errors.New("product sku not found")
	ErrContactNotFound    = errors.New("contact not found")
)

var contactOwnerTypes = map[string]struct{}{
	ContactOwnerCustomer: {},
	ContactOwnerSupplier: {},
}

type Customer struct {
	ID                     int
	Code                   string
	Name                   string
	ShortName              *string
	DefaultPaymentMethod   *string
	DefaultPaymentTermDays *int
	TaxNo                  *string
	IsActive               bool
	Note                   *string
	CreatedAt              time.Time
	UpdatedAt              time.Time
}

type Supplier struct {
	ID           int
	Code         string
	Name         string
	ShortName    *string
	SupplierType *string
	TaxNo        *string
	IsActive     bool
	Note         *string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type Unit struct {
	ID        int
	Code      string
	Name      string
	Precision int
	IsActive  bool
	CreatedAt time.Time
	UpdatedAt time.Time
}

type Warehouse struct {
	ID        int
	Code      string
	Name      string
	Type      string
	IsActive  bool
	CreatedAt time.Time
	UpdatedAt time.Time
}

type Material struct {
	ID            int
	Code          string
	Name          string
	Category      *string
	Spec          *string
	Color         *string
	DefaultUnitID int
	IsActive      bool
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

type Process struct {
	ID                 int
	Code               string
	Name               string
	Category           *string
	OutsourcingEnabled bool
	InhouseEnabled     bool
	QualityRequired    bool
	SortOrder          int
	Note               *string
	IsActive           bool
	CreatedAt          time.Time
	UpdatedAt          time.Time
}

type Product struct {
	ID              int
	Code            string
	Name            string
	StyleNo         *string
	CustomerStyleNo *string
	DefaultUnitID   int
	IsActive        bool
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

type ProductSKU struct {
	ID               int
	ProductID        int
	SKUCode          string
	SKUName          *string
	Barcode          *string
	CustomerSKU      *string
	Color            *string
	ColorNo          *string
	Size             *string
	PackagingVersion *string
	DefaultUnitID    *int
	IsActive         bool
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

type Contact struct {
	ID        int
	OwnerType string
	OwnerID   int
	Name      string
	Phone     *string
	Mobile    *string
	Email     *string
	Title     *string
	IsPrimary bool
	IsActive  bool
	Note      *string
	CreatedAt time.Time
	UpdatedAt time.Time
}

type CustomerMutation struct {
	Code                   string
	Name                   string
	ShortName              *string
	DefaultPaymentMethod   *string
	DefaultPaymentTermDays *int
	TaxNo                  *string
	Note                   *string
}

type SupplierMutation struct {
	Code         string
	Name         string
	ShortName    *string
	SupplierType *string
	TaxNo        *string
	Note         *string
}

type MaterialMutation struct {
	Code          string
	Name          string
	Category      *string
	Spec          *string
	Color         *string
	DefaultUnitID int
}

type ProcessMutation struct {
	Code               string
	Name               string
	Category           *string
	OutsourcingEnabled bool
	InhouseEnabled     bool
	QualityRequired    bool
	SortOrder          int
	Note               *string
}

type ProductMutation struct {
	Code            string
	Name            string
	StyleNo         *string
	CustomerStyleNo *string
	DefaultUnitID   int
}

type ProductSKUMutation struct {
	ProductID        int
	SKUCode          string
	SKUName          *string
	Barcode          *string
	CustomerSKU      *string
	Color            *string
	ColorNo          *string
	Size             *string
	PackagingVersion *string
	DefaultUnitID    *int
}

type ContactMutation struct {
	OwnerType string
	OwnerID   int
	Name      string
	Phone     *string
	Mobile    *string
	Email     *string
	Title     *string
	IsPrimary bool
	Note      *string
}

type ContactSaveMutation struct {
	ID int
	ContactMutation
}

type CustomerWithContacts struct {
	Customer *Customer
	Contacts []*Contact
}

type SupplierWithContacts struct {
	Supplier *Supplier
	Contacts []*Contact
}

type MasterDataFilter struct {
	Keyword    string
	ActiveOnly bool
	Limit      int
	Offset     int
}

type ContactFilter struct {
	OwnerType  string
	OwnerID    int
	ActiveOnly bool
	Limit      int
	Offset     int
}

type ProductSKUFilter struct {
	ProductID  int
	Keyword    string
	ActiveOnly bool
	Limit      int
	Offset     int
}

type MasterDataRepo interface {
	CreateCustomer(ctx context.Context, in *CustomerMutation) (*Customer, error)
	UpdateCustomer(ctx context.Context, id int, in *CustomerMutation) (*Customer, error)
	SaveCustomerWithContacts(ctx context.Context, id int, in *CustomerMutation, contacts []*ContactSaveMutation) (*CustomerWithContacts, error)
	GetCustomer(ctx context.Context, id int) (*Customer, error)
	ListCustomers(ctx context.Context, filter MasterDataFilter) ([]*Customer, int, error)
	SetCustomerActive(ctx context.Context, id int, active bool) (*Customer, error)
	CustomerExists(ctx context.Context, id int) (bool, error)

	CreateSupplier(ctx context.Context, in *SupplierMutation) (*Supplier, error)
	UpdateSupplier(ctx context.Context, id int, in *SupplierMutation) (*Supplier, error)
	SaveSupplierWithContacts(ctx context.Context, id int, in *SupplierMutation, contacts []*ContactSaveMutation) (*SupplierWithContacts, error)
	GetSupplier(ctx context.Context, id int) (*Supplier, error)
	ListSuppliers(ctx context.Context, filter MasterDataFilter) ([]*Supplier, int, error)
	SetSupplierActive(ctx context.Context, id int, active bool) (*Supplier, error)
	SupplierExists(ctx context.Context, id int) (bool, error)

	CreateMaterial(ctx context.Context, in *MaterialMutation) (*Material, error)
	UpdateMaterial(ctx context.Context, id int, in *MaterialMutation) (*Material, error)
	GetMaterial(ctx context.Context, id int) (*Material, error)
	ListMaterials(ctx context.Context, filter MasterDataFilter) ([]*Material, int, error)
	SetMaterialActive(ctx context.Context, id int, active bool) (*Material, error)
	ListUnits(ctx context.Context, filter MasterDataFilter) ([]*Unit, int, error)
	ListWarehouses(ctx context.Context, filter MasterDataFilter) ([]*Warehouse, int, error)
	UnitIsActive(ctx context.Context, id int) (bool, error)

	CreateProcess(ctx context.Context, in *ProcessMutation) (*Process, error)
	UpdateProcess(ctx context.Context, id int, in *ProcessMutation) (*Process, error)
	GetProcess(ctx context.Context, id int) (*Process, error)
	ListProcesses(ctx context.Context, filter MasterDataFilter) ([]*Process, int, error)
	SetProcessActive(ctx context.Context, id int, active bool) (*Process, error)

	CreateProduct(ctx context.Context, in *ProductMutation) (*Product, error)
	UpdateProduct(ctx context.Context, id int, in *ProductMutation) (*Product, error)
	GetProduct(ctx context.Context, id int) (*Product, error)
	ListProducts(ctx context.Context, filter MasterDataFilter) ([]*Product, int, error)
	SetProductActive(ctx context.Context, id int, active bool) (*Product, error)
	CreateProductSKU(ctx context.Context, in *ProductSKUMutation) (*ProductSKU, error)
	UpdateProductSKU(ctx context.Context, id int, in *ProductSKUMutation) (*ProductSKU, error)
	GetProductSKU(ctx context.Context, id int) (*ProductSKU, error)
	ListProductSKUs(ctx context.Context, filter ProductSKUFilter) ([]*ProductSKU, int, error)
	SetProductSKUActive(ctx context.Context, id int, active bool) (*ProductSKU, error)
	ProductIsActive(ctx context.Context, id int) (bool, error)

	CreateContact(ctx context.Context, in *ContactMutation) (*Contact, error)
	UpdateContact(ctx context.Context, id int, in *ContactMutation) (*Contact, error)
	GetContact(ctx context.Context, id int) (*Contact, error)
	ListContactsByOwner(ctx context.Context, filter ContactFilter) ([]*Contact, int, error)
	SetPrimaryContact(ctx context.Context, id int) (*Contact, error)
	DisableContact(ctx context.Context, id int) (*Contact, error)
}

type MasterDataUsecase struct {
	repo MasterDataRepo
}

func NewMasterDataUsecase(repo MasterDataRepo) *MasterDataUsecase {
	return &MasterDataUsecase{repo: repo}
}

func (uc *MasterDataUsecase) CreateCustomer(ctx context.Context, in *CustomerMutation) (*Customer, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeCustomerMutation(*in)
	if err != nil {
		return nil, err
	}
	return uc.repo.CreateCustomer(ctx, &normalized)
}

func (uc *MasterDataUsecase) UpdateCustomer(ctx context.Context, id int, in *CustomerMutation) (*Customer, error) {
	if uc == nil || uc.repo == nil || id <= 0 || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeCustomerMutation(*in)
	if err != nil {
		return nil, err
	}
	return uc.repo.UpdateCustomer(ctx, id, &normalized)
}

func (uc *MasterDataUsecase) SaveCustomerWithContacts(ctx context.Context, id int, in *CustomerMutation, contacts []*ContactSaveMutation) (*CustomerWithContacts, error) {
	if uc == nil || uc.repo == nil || id < 0 || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeCustomerMutation(*in)
	if err != nil {
		return nil, err
	}
	normalizedContacts, err := normalizeContactSaveMutations(contacts)
	if err != nil {
		return nil, err
	}
	return uc.repo.SaveCustomerWithContacts(ctx, id, &normalized, normalizedContacts)
}

func (uc *MasterDataUsecase) GetCustomer(ctx context.Context, id int) (*Customer, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.GetCustomer(ctx, id)
}

func (uc *MasterDataUsecase) ListCustomers(ctx context.Context, filter MasterDataFilter) ([]*Customer, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	return uc.repo.ListCustomers(ctx, normalizeMasterDataFilter(filter))
}

func (uc *MasterDataUsecase) SetCustomerActive(ctx context.Context, id int, active bool) (*Customer, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.SetCustomerActive(ctx, id, active)
}

func (uc *MasterDataUsecase) CreateSupplier(ctx context.Context, in *SupplierMutation) (*Supplier, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeSupplierMutation(*in)
	if err != nil {
		return nil, err
	}
	return uc.repo.CreateSupplier(ctx, &normalized)
}

func (uc *MasterDataUsecase) UpdateSupplier(ctx context.Context, id int, in *SupplierMutation) (*Supplier, error) {
	if uc == nil || uc.repo == nil || id <= 0 || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeSupplierMutation(*in)
	if err != nil {
		return nil, err
	}
	return uc.repo.UpdateSupplier(ctx, id, &normalized)
}

func (uc *MasterDataUsecase) SaveSupplierWithContacts(ctx context.Context, id int, in *SupplierMutation, contacts []*ContactSaveMutation) (*SupplierWithContacts, error) {
	if uc == nil || uc.repo == nil || id < 0 || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeSupplierMutation(*in)
	if err != nil {
		return nil, err
	}
	normalizedContacts, err := normalizeContactSaveMutations(contacts)
	if err != nil {
		return nil, err
	}
	return uc.repo.SaveSupplierWithContacts(ctx, id, &normalized, normalizedContacts)
}

func (uc *MasterDataUsecase) GetSupplier(ctx context.Context, id int) (*Supplier, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.GetSupplier(ctx, id)
}

func (uc *MasterDataUsecase) ListSuppliers(ctx context.Context, filter MasterDataFilter) ([]*Supplier, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	return uc.repo.ListSuppliers(ctx, normalizeMasterDataFilter(filter))
}

func (uc *MasterDataUsecase) SetSupplierActive(ctx context.Context, id int, active bool) (*Supplier, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.SetSupplierActive(ctx, id, active)
}

func (uc *MasterDataUsecase) CreateMaterial(ctx context.Context, in *MaterialMutation) (*Material, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeMaterialMutation(*in)
	if err != nil {
		return nil, err
	}
	if err := uc.validateMaterialDefaultUnit(ctx, normalized.DefaultUnitID); err != nil {
		return nil, err
	}
	return uc.repo.CreateMaterial(ctx, &normalized)
}

func (uc *MasterDataUsecase) UpdateMaterial(ctx context.Context, id int, in *MaterialMutation) (*Material, error) {
	if uc == nil || uc.repo == nil || id <= 0 || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeMaterialMutation(*in)
	if err != nil {
		return nil, err
	}
	if err := uc.validateMaterialDefaultUnit(ctx, normalized.DefaultUnitID); err != nil {
		return nil, err
	}
	return uc.repo.UpdateMaterial(ctx, id, &normalized)
}

func (uc *MasterDataUsecase) GetMaterial(ctx context.Context, id int) (*Material, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.GetMaterial(ctx, id)
}

func (uc *MasterDataUsecase) ListMaterials(ctx context.Context, filter MasterDataFilter) ([]*Material, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	return uc.repo.ListMaterials(ctx, normalizeMasterDataFilter(filter))
}

func (uc *MasterDataUsecase) SetMaterialActive(ctx context.Context, id int, active bool) (*Material, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.SetMaterialActive(ctx, id, active)
}

func (uc *MasterDataUsecase) ListUnits(ctx context.Context, filter MasterDataFilter) ([]*Unit, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	return uc.repo.ListUnits(ctx, normalizeMasterDataFilter(filter))
}

func (uc *MasterDataUsecase) ListWarehouses(ctx context.Context, filter MasterDataFilter) ([]*Warehouse, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	return uc.repo.ListWarehouses(ctx, normalizeMasterDataFilter(filter))
}

func (uc *MasterDataUsecase) CreateProcess(ctx context.Context, in *ProcessMutation) (*Process, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeProcessMutation(*in)
	if err != nil {
		return nil, err
	}
	return uc.repo.CreateProcess(ctx, &normalized)
}

func (uc *MasterDataUsecase) UpdateProcess(ctx context.Context, id int, in *ProcessMutation) (*Process, error) {
	if uc == nil || uc.repo == nil || id <= 0 || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeProcessMutation(*in)
	if err != nil {
		return nil, err
	}
	return uc.repo.UpdateProcess(ctx, id, &normalized)
}

func (uc *MasterDataUsecase) GetProcess(ctx context.Context, id int) (*Process, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.GetProcess(ctx, id)
}

func (uc *MasterDataUsecase) ListProcesses(ctx context.Context, filter MasterDataFilter) ([]*Process, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	return uc.repo.ListProcesses(ctx, normalizeMasterDataFilter(filter))
}

func (uc *MasterDataUsecase) SetProcessActive(ctx context.Context, id int, active bool) (*Process, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.SetProcessActive(ctx, id, active)
}

func (uc *MasterDataUsecase) CreateProduct(ctx context.Context, in *ProductMutation) (*Product, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeProductMutation(*in)
	if err != nil {
		return nil, err
	}
	if err := uc.validateProductDefaultUnit(ctx, normalized.DefaultUnitID); err != nil {
		return nil, err
	}
	return uc.repo.CreateProduct(ctx, &normalized)
}

func (uc *MasterDataUsecase) UpdateProduct(ctx context.Context, id int, in *ProductMutation) (*Product, error) {
	if uc == nil || uc.repo == nil || id <= 0 || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeProductMutation(*in)
	if err != nil {
		return nil, err
	}
	if err := uc.validateProductDefaultUnit(ctx, normalized.DefaultUnitID); err != nil {
		return nil, err
	}
	return uc.repo.UpdateProduct(ctx, id, &normalized)
}

func (uc *MasterDataUsecase) GetProduct(ctx context.Context, id int) (*Product, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.GetProduct(ctx, id)
}

func (uc *MasterDataUsecase) ListProducts(ctx context.Context, filter MasterDataFilter) ([]*Product, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	return uc.repo.ListProducts(ctx, normalizeMasterDataFilter(filter))
}

func (uc *MasterDataUsecase) SetProductActive(ctx context.Context, id int, active bool) (*Product, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.SetProductActive(ctx, id, active)
}

func (uc *MasterDataUsecase) CreateProductSKU(ctx context.Context, in *ProductSKUMutation) (*ProductSKU, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeProductSKUMutation(*in)
	if err != nil {
		return nil, err
	}
	if err := uc.validateProductSKURefs(ctx, normalized); err != nil {
		return nil, err
	}
	return uc.repo.CreateProductSKU(ctx, &normalized)
}

func (uc *MasterDataUsecase) UpdateProductSKU(ctx context.Context, id int, in *ProductSKUMutation) (*ProductSKU, error) {
	if uc == nil || uc.repo == nil || id <= 0 || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeProductSKUMutation(*in)
	if err != nil {
		return nil, err
	}
	current, err := uc.repo.GetProductSKU(ctx, id)
	if err != nil {
		return nil, err
	}
	if current.ProductID != normalized.ProductID {
		return nil, ErrBadParam
	}
	if err := uc.validateProductSKURefs(ctx, normalized); err != nil {
		return nil, err
	}
	return uc.repo.UpdateProductSKU(ctx, id, &normalized)
}

func (uc *MasterDataUsecase) GetProductSKU(ctx context.Context, id int) (*ProductSKU, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.GetProductSKU(ctx, id)
}

func (uc *MasterDataUsecase) ListProductSKUs(ctx context.Context, filter ProductSKUFilter) ([]*ProductSKU, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	return uc.repo.ListProductSKUs(ctx, normalizeProductSKUFilter(filter))
}

func (uc *MasterDataUsecase) SetProductSKUActive(ctx context.Context, id int, active bool) (*ProductSKU, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.SetProductSKUActive(ctx, id, active)
}

func (uc *MasterDataUsecase) CreateContact(ctx context.Context, in *ContactMutation) (*Contact, error) {
	if uc == nil || uc.repo == nil || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeContactMutation(*in)
	if err != nil {
		return nil, err
	}
	if err := uc.validateContactOwner(ctx, normalized.OwnerType, normalized.OwnerID); err != nil {
		return nil, err
	}
	return uc.repo.CreateContact(ctx, &normalized)
}

func (uc *MasterDataUsecase) UpdateContact(ctx context.Context, id int, in *ContactMutation) (*Contact, error) {
	if uc == nil || uc.repo == nil || id <= 0 || in == nil {
		return nil, ErrBadParam
	}
	normalized, err := normalizeContactMutation(*in)
	if err != nil {
		return nil, err
	}
	if err := uc.validateContactOwner(ctx, normalized.OwnerType, normalized.OwnerID); err != nil {
		return nil, err
	}
	return uc.repo.UpdateContact(ctx, id, &normalized)
}

func (uc *MasterDataUsecase) GetContact(ctx context.Context, id int) (*Contact, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.GetContact(ctx, id)
}

func (uc *MasterDataUsecase) ListContactsByOwner(ctx context.Context, filter ContactFilter) ([]*Contact, int, error) {
	if uc == nil || uc.repo == nil {
		return nil, 0, ErrBadParam
	}
	normalized, err := normalizeContactFilter(filter)
	if err != nil {
		return nil, 0, err
	}
	return uc.repo.ListContactsByOwner(ctx, normalized)
}

func (uc *MasterDataUsecase) SetPrimaryContact(ctx context.Context, id int) (*Contact, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.SetPrimaryContact(ctx, id)
}

func (uc *MasterDataUsecase) DisableContact(ctx context.Context, id int) (*Contact, error) {
	if uc == nil || uc.repo == nil || id <= 0 {
		return nil, ErrBadParam
	}
	return uc.repo.DisableContact(ctx, id)
}

func (uc *MasterDataUsecase) validateContactOwner(ctx context.Context, ownerType string, ownerID int) error {
	switch ownerType {
	case ContactOwnerCustomer:
		exists, err := uc.repo.CustomerExists(ctx, ownerID)
		if err != nil {
			return err
		}
		if !exists {
			return ErrCustomerNotFound
		}
	case ContactOwnerSupplier:
		exists, err := uc.repo.SupplierExists(ctx, ownerID)
		if err != nil {
			return err
		}
		if !exists {
			return ErrSupplierNotFound
		}
	default:
		return ErrBadParam
	}
	return nil
}

func (uc *MasterDataUsecase) validateMaterialDefaultUnit(ctx context.Context, unitID int) error {
	return uc.validateProductDefaultUnit(ctx, unitID)
}

func (uc *MasterDataUsecase) validateProductDefaultUnit(ctx context.Context, unitID int) error {
	if unitID <= 0 {
		return ErrBadParam
	}
	active, err := uc.repo.UnitIsActive(ctx, unitID)
	if err != nil {
		return err
	}
	if !active {
		return ErrUnitInactive
	}
	return nil
}

func (uc *MasterDataUsecase) validateProductSKURefs(ctx context.Context, in ProductSKUMutation) error {
	productActive, err := uc.repo.ProductIsActive(ctx, in.ProductID)
	if err != nil {
		return err
	}
	if !productActive {
		return ErrProductInactive
	}
	if in.DefaultUnitID == nil {
		return nil
	}
	active, err := uc.repo.UnitIsActive(ctx, *in.DefaultUnitID)
	if err != nil {
		return err
	}
	if !active {
		return ErrUnitInactive
	}
	return nil
}

func normalizeCustomerMutation(in CustomerMutation) (CustomerMutation, error) {
	in.Code = strings.TrimSpace(in.Code)
	in.Name = strings.TrimSpace(in.Name)
	in.ShortName = normalizeOptionalString(in.ShortName)
	in.DefaultPaymentMethod = normalizeOptionalString(in.DefaultPaymentMethod)
	in.TaxNo = normalizeOptionalString(in.TaxNo)
	in.Note = normalizeOptionalString(in.Note)
	if in.Code == "" || in.Name == "" || (in.DefaultPaymentTermDays != nil && *in.DefaultPaymentTermDays < 0) {
		return CustomerMutation{}, ErrBadParam
	}
	return in, nil
}

func normalizeSupplierMutation(in SupplierMutation) (SupplierMutation, error) {
	in.Code = strings.TrimSpace(in.Code)
	in.Name = strings.TrimSpace(in.Name)
	in.ShortName = normalizeOptionalString(in.ShortName)
	in.SupplierType = normalizeOptionalString(in.SupplierType)
	in.TaxNo = normalizeOptionalString(in.TaxNo)
	in.Note = normalizeOptionalString(in.Note)
	if in.Code == "" || in.Name == "" {
		return SupplierMutation{}, ErrBadParam
	}
	return in, nil
}

func normalizeMaterialMutation(in MaterialMutation) (MaterialMutation, error) {
	in.Code = strings.TrimSpace(in.Code)
	in.Name = strings.TrimSpace(in.Name)
	in.Category = normalizeOptionalString(in.Category)
	in.Spec = normalizeOptionalString(in.Spec)
	in.Color = normalizeOptionalString(in.Color)
	if in.Code == "" || in.Name == "" || in.DefaultUnitID <= 0 {
		return MaterialMutation{}, ErrBadParam
	}
	return in, nil
}

func normalizeProcessMutation(in ProcessMutation) (ProcessMutation, error) {
	in.Code = strings.TrimSpace(in.Code)
	in.Name = strings.TrimSpace(in.Name)
	in.Category = normalizeOptionalString(in.Category)
	in.Note = normalizeOptionalString(in.Note)
	if in.SortOrder < 0 {
		in.SortOrder = 0
	}
	if in.Code == "" || in.Name == "" {
		return ProcessMutation{}, ErrBadParam
	}
	return in, nil
}

func normalizeProductMutation(in ProductMutation) (ProductMutation, error) {
	in.Code = strings.TrimSpace(in.Code)
	in.Name = strings.TrimSpace(in.Name)
	in.StyleNo = normalizeOptionalString(in.StyleNo)
	in.CustomerStyleNo = normalizeOptionalString(in.CustomerStyleNo)
	if in.Code == "" || in.Name == "" || in.DefaultUnitID <= 0 {
		return ProductMutation{}, ErrBadParam
	}
	return in, nil
}

func normalizeProductSKUMutation(in ProductSKUMutation) (ProductSKUMutation, error) {
	in.SKUCode = strings.TrimSpace(in.SKUCode)
	in.SKUName = normalizeOptionalString(in.SKUName)
	in.Barcode = normalizeOptionalString(in.Barcode)
	in.CustomerSKU = normalizeOptionalString(in.CustomerSKU)
	in.Color = normalizeOptionalString(in.Color)
	in.ColorNo = normalizeOptionalString(in.ColorNo)
	in.Size = normalizeOptionalString(in.Size)
	in.PackagingVersion = normalizeOptionalString(in.PackagingVersion)
	if in.DefaultUnitID != nil && *in.DefaultUnitID <= 0 {
		in.DefaultUnitID = nil
	}
	if in.ProductID <= 0 || in.SKUCode == "" {
		return ProductSKUMutation{}, ErrBadParam
	}
	return in, nil
}

func normalizeContactMutation(in ContactMutation) (ContactMutation, error) {
	var err error
	in.OwnerType = strings.ToUpper(strings.TrimSpace(in.OwnerType))
	in.Name = strings.TrimSpace(in.Name)
	in.Phone, err = normalizeContactPhone(in.Phone)
	if err != nil {
		return ContactMutation{}, err
	}
	in.Mobile, err = normalizeContactPhone(in.Mobile)
	if err != nil {
		return ContactMutation{}, err
	}
	in.Email, err = normalizeContactEmail(in.Email)
	if err != nil {
		return ContactMutation{}, err
	}
	in.Title = normalizeOptionalString(in.Title)
	in.Note = normalizeOptionalString(in.Note)
	if !IsValidContactOwnerType(in.OwnerType) || in.OwnerID <= 0 || in.Name == "" {
		return ContactMutation{}, ErrBadParam
	}
	return in, nil
}

func normalizeContactSaveMutations(in []*ContactSaveMutation) ([]*ContactSaveMutation, error) {
	out := make([]*ContactSaveMutation, 0, len(in))
	for _, item := range in {
		if item == nil || item.ID < 0 {
			return nil, ErrBadParam
		}
		mutation := item.ContactMutation
		var err error
		mutation.OwnerType = ""
		mutation.OwnerID = 0
		mutation.Name = strings.TrimSpace(mutation.Name)
		mutation.Phone, err = normalizeContactPhone(mutation.Phone)
		if err != nil {
			return nil, err
		}
		mutation.Mobile, err = normalizeContactPhone(mutation.Mobile)
		if err != nil {
			return nil, err
		}
		mutation.Email, err = normalizeContactEmail(mutation.Email)
		if err != nil {
			return nil, err
		}
		mutation.Title = normalizeOptionalString(mutation.Title)
		mutation.Note = normalizeOptionalString(mutation.Note)
		if mutation.Name == "" {
			return nil, ErrBadParam
		}
		out = append(out, &ContactSaveMutation{
			ID:              item.ID,
			ContactMutation: mutation,
		})
	}
	return out, nil
}

func normalizeMasterDataFilter(in MasterDataFilter) MasterDataFilter {
	in.Keyword = strings.TrimSpace(in.Keyword)
	if in.Limit <= 0 || in.Limit > 200 {
		in.Limit = 50
	}
	if in.Offset < 0 {
		in.Offset = 0
	}
	return in
}

func normalizeProductSKUFilter(in ProductSKUFilter) ProductSKUFilter {
	in.Keyword = strings.TrimSpace(in.Keyword)
	if in.ProductID < 0 {
		in.ProductID = 0
	}
	if in.Limit <= 0 || in.Limit > 200 {
		in.Limit = 50
	}
	if in.Offset < 0 {
		in.Offset = 0
	}
	return in
}

func normalizeContactFilter(in ContactFilter) (ContactFilter, error) {
	in.OwnerType = strings.ToUpper(strings.TrimSpace(in.OwnerType))
	if in.Limit <= 0 || in.Limit > 200 {
		in.Limit = 50
	}
	if in.Offset < 0 {
		in.Offset = 0
	}
	if !IsValidContactOwnerType(in.OwnerType) || in.OwnerID <= 0 {
		return ContactFilter{}, ErrBadParam
	}
	return in, nil
}

func IsValidContactOwnerType(value string) bool {
	_, ok := contactOwnerTypes[strings.ToUpper(strings.TrimSpace(value))]
	return ok
}
