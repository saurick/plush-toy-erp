package data

import (
	"context"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/contact"
	"server/internal/data/model/ent/customer"
	"server/internal/data/model/ent/material"
	"server/internal/data/model/ent/process"
	"server/internal/data/model/ent/product"
	"server/internal/data/model/ent/productsku"
	"server/internal/data/model/ent/supplier"
	"server/internal/data/model/ent/unit"
	"server/internal/data/model/ent/warehouse"

	"github.com/go-kratos/kratos/v2/log"
)

type masterDataRepo struct {
	data *Data
	log  *log.Helper
}

func NewMasterDataRepo(d *Data, logger log.Logger) *masterDataRepo {
	return &masterDataRepo{
		data: d,
		log:  log.NewHelper(log.With(logger, "module", "data.masterdata_repo")),
	}
}

var _ biz.MasterDataRepo = (*masterDataRepo)(nil)
var _ biz.WarehouseAccessRepo = (*masterDataRepo)(nil)

func (r *masterDataRepo) CreateCustomer(ctx context.Context, in *biz.CustomerMutation) (*biz.Customer, error) {
	row, err := r.data.postgres.Customer.Create().
		SetCode(in.Code).
		SetName(in.Name).
		SetNillableShortName(in.ShortName).
		SetNillableDefaultPaymentMethod(in.DefaultPaymentMethod).
		SetNillableDefaultPaymentTermDays(in.DefaultPaymentTermDays).
		SetNillableTaxNo(in.TaxNo).
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	return entCustomerToBiz(row), nil
}

func (r *masterDataRepo) UpdateCustomer(ctx context.Context, id int, in *biz.CustomerMutation) (*biz.Customer, error) {
	update := r.data.postgres.Customer.UpdateOneID(id).
		SetCode(in.Code).
		SetName(in.Name)
	if in.ShortName == nil {
		update.ClearShortName()
	} else {
		update.SetShortName(*in.ShortName)
	}
	if in.DefaultPaymentMethod == nil {
		update.ClearDefaultPaymentMethod()
	} else {
		update.SetDefaultPaymentMethod(*in.DefaultPaymentMethod)
	}
	if in.DefaultPaymentTermDays == nil {
		update.ClearDefaultPaymentTermDays()
	} else {
		update.SetDefaultPaymentTermDays(*in.DefaultPaymentTermDays)
	}
	if in.TaxNo == nil {
		update.ClearTaxNo()
	} else {
		update.SetTaxNo(*in.TaxNo)
	}
	if in.Note == nil {
		update.ClearNote()
	} else {
		update.SetNote(*in.Note)
	}
	row, err := update.Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrCustomerNotFound
		}
		return nil, err
	}
	return entCustomerToBiz(row), nil
}

func (r *masterDataRepo) SaveCustomerWithContacts(ctx context.Context, id int, in *biz.CustomerMutation, contacts []*biz.ContactSaveMutation) (*biz.CustomerWithContacts, error) {
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackMasterDataEntTx(ctx, tx, r.log)

	var customerRow *ent.Customer
	if id > 0 {
		customerRow, err = updateCustomerWithClient(ctx, tx.Client(), id, in)
	} else {
		customerRow, err = createCustomerWithClient(ctx, tx.Client(), in)
	}
	if err != nil {
		return nil, err
	}
	savedContacts, err := saveContactsForOwner(ctx, tx.Client(), biz.ContactOwnerCustomer, customerRow.ID, contacts)
	if err != nil {
		return nil, err
	}
	out := &biz.CustomerWithContacts{
		Customer: entCustomerToBiz(customerRow),
		Contacts: savedContacts,
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return out, nil
}

func (r *masterDataRepo) GetCustomer(ctx context.Context, id int) (*biz.Customer, error) {
	row, err := r.data.postgres.Customer.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrCustomerNotFound
		}
		return nil, err
	}
	return entCustomerToBiz(row), nil
}

func (r *masterDataRepo) ListCustomers(ctx context.Context, filter biz.MasterDataFilter) ([]*biz.Customer, int, error) {
	query := r.data.postgres.Customer.Query()
	if filter.Keyword != "" {
		query = query.Where(customer.Or(
			customer.CodeContains(filter.Keyword),
			customer.NameContains(filter.Keyword),
			customer.ShortNameContains(filter.Keyword),
		))
	}
	if filter.ActiveOnly {
		query = query.Where(customer.IsActive(true))
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.Order(ent.Desc(customer.FieldID)).Limit(filter.Limit).Offset(filter.Offset).All(ctx)
	if err != nil {
		return nil, 0, err
	}
	return entCustomersToBiz(rows), total, nil
}

func (r *masterDataRepo) SetCustomerActive(ctx context.Context, id int, active bool) (*biz.Customer, error) {
	row, err := r.data.postgres.Customer.UpdateOneID(id).SetIsActive(active).Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrCustomerNotFound
		}
		return nil, err
	}
	return entCustomerToBiz(row), nil
}

func (r *masterDataRepo) CustomerExists(ctx context.Context, id int) (bool, error) {
	return r.data.postgres.Customer.Query().Where(customer.ID(id)).Exist(ctx)
}

func (r *masterDataRepo) CreateSupplier(ctx context.Context, in *biz.SupplierMutation) (*biz.Supplier, error) {
	create := r.data.postgres.Supplier.Create().
		SetCode(in.Code).
		SetName(in.Name).
		SetNillableShortName(in.ShortName).
		SetNillableSupplierType(in.SupplierType).
		SetNillableAddress(in.Address).
		SetNillableTaxNo(in.TaxNo).
		SetNillableNote(in.Note)
	if len(in.ProcessIDs) > 0 {
		create.AddProcessCapabilityIDs(in.ProcessIDs...)
	}
	row, err := create.Save(ctx)
	if err != nil {
		return nil, err
	}
	row, err = r.data.postgres.Supplier.Query().Where(supplier.ID(row.ID)).WithProcessCapabilities().Only(ctx)
	if err != nil {
		return nil, err
	}
	return entSupplierToBiz(row), nil
}

func (r *masterDataRepo) UpdateSupplier(ctx context.Context, id int, in *biz.SupplierMutation) (*biz.Supplier, error) {
	update := r.data.postgres.Supplier.UpdateOneID(id).
		SetCode(in.Code).
		SetName(in.Name)
	if in.ShortName == nil {
		update.ClearShortName()
	} else {
		update.SetShortName(*in.ShortName)
	}
	if in.SupplierType == nil {
		update.ClearSupplierType()
	} else {
		update.SetSupplierType(*in.SupplierType)
	}
	if in.Address == nil {
		update.ClearAddress()
	} else {
		update.SetAddress(*in.Address)
	}
	if in.TaxNo == nil {
		update.ClearTaxNo()
	} else {
		update.SetTaxNo(*in.TaxNo)
	}
	if in.Note == nil {
		update.ClearNote()
	} else {
		update.SetNote(*in.Note)
	}
	if in.ProcessIDs != nil {
		update.ClearProcessCapabilities()
		if len(in.ProcessIDs) > 0 {
			update.AddProcessCapabilityIDs(in.ProcessIDs...)
		}
	}
	row, err := update.Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrSupplierNotFound
		}
		return nil, err
	}
	row, err = r.data.postgres.Supplier.Query().Where(supplier.ID(row.ID)).WithProcessCapabilities().Only(ctx)
	if err != nil {
		return nil, err
	}
	return entSupplierToBiz(row), nil
}

func (r *masterDataRepo) SaveSupplierWithContacts(ctx context.Context, id int, in *biz.SupplierMutation, contacts []*biz.ContactSaveMutation) (*biz.SupplierWithContacts, error) {
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackMasterDataEntTx(ctx, tx, r.log)

	var supplierRow *ent.Supplier
	if id > 0 {
		supplierRow, err = updateSupplierWithClient(ctx, tx.Client(), id, in)
	} else {
		supplierRow, err = createSupplierWithClient(ctx, tx.Client(), in)
	}
	if err != nil {
		return nil, err
	}
	savedContacts, err := saveContactsForOwner(ctx, tx.Client(), biz.ContactOwnerSupplier, supplierRow.ID, contacts)
	if err != nil {
		return nil, err
	}
	supplierRow, err = tx.Supplier.Query().Where(supplier.ID(supplierRow.ID)).WithProcessCapabilities().Only(ctx)
	if err != nil {
		return nil, err
	}
	out := &biz.SupplierWithContacts{
		Supplier: entSupplierToBiz(supplierRow),
		Contacts: savedContacts,
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return out, nil
}

func (r *masterDataRepo) GetSupplier(ctx context.Context, id int) (*biz.Supplier, error) {
	row, err := r.data.postgres.Supplier.Query().Where(supplier.ID(id)).WithProcessCapabilities().Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrSupplierNotFound
		}
		return nil, err
	}
	return entSupplierToBiz(row), nil
}

func (r *masterDataRepo) ListSuppliers(ctx context.Context, filter biz.MasterDataFilter) ([]*biz.Supplier, int, error) {
	query := r.data.postgres.Supplier.Query()
	if filter.Keyword != "" {
		query = query.Where(supplier.Or(
			supplier.CodeContains(filter.Keyword),
			supplier.NameContains(filter.Keyword),
			supplier.ShortNameContains(filter.Keyword),
			supplier.AddressContains(filter.Keyword),
		))
	}
	if filter.ActiveOnly {
		query = query.Where(supplier.IsActive(true))
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.WithProcessCapabilities().Order(ent.Desc(supplier.FieldID)).Limit(filter.Limit).Offset(filter.Offset).All(ctx)
	if err != nil {
		return nil, 0, err
	}
	return entSuppliersToBiz(rows), total, nil
}

func (r *masterDataRepo) SetSupplierActive(ctx context.Context, id int, active bool) (*biz.Supplier, error) {
	row, err := r.data.postgres.Supplier.UpdateOneID(id).SetIsActive(active).Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrSupplierNotFound
		}
		return nil, err
	}
	row, err = r.data.postgres.Supplier.Query().Where(supplier.ID(row.ID)).WithProcessCapabilities().Only(ctx)
	if err != nil {
		return nil, err
	}
	return entSupplierToBiz(row), nil
}

func (r *masterDataRepo) SupplierExists(ctx context.Context, id int) (bool, error) {
	return r.data.postgres.Supplier.Query().Where(supplier.ID(id)).Exist(ctx)
}

func (r *masterDataRepo) CreateMaterial(ctx context.Context, in *biz.MaterialMutation) (*biz.Material, error) {
	row, err := r.data.postgres.Material.Create().
		SetCode(in.Code).
		SetName(in.Name).
		SetNillableCategory(in.Category).
		SetNillableSpec(in.Spec).
		SetNillableColor(in.Color).
		SetDefaultUnitID(in.DefaultUnitID).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	return entMaterialToBiz(row), nil
}

func (r *masterDataRepo) UpdateMaterial(ctx context.Context, id int, in *biz.MaterialMutation) (*biz.Material, error) {
	update := r.data.postgres.Material.UpdateOneID(id).
		SetCode(in.Code).
		SetName(in.Name).
		SetDefaultUnitID(in.DefaultUnitID)
	if in.Category == nil {
		update.ClearCategory()
	} else {
		update.SetCategory(*in.Category)
	}
	if in.Spec == nil {
		update.ClearSpec()
	} else {
		update.SetSpec(*in.Spec)
	}
	if in.Color == nil {
		update.ClearColor()
	} else {
		update.SetColor(*in.Color)
	}
	row, err := update.Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrMaterialNotFound
		}
		return nil, err
	}
	return entMaterialToBiz(row), nil
}

func (r *masterDataRepo) GetMaterial(ctx context.Context, id int) (*biz.Material, error) {
	row, err := r.data.postgres.Material.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrMaterialNotFound
		}
		return nil, err
	}
	return entMaterialToBiz(row), nil
}

func (r *masterDataRepo) ListMaterials(ctx context.Context, filter biz.MasterDataFilter) ([]*biz.Material, int, error) {
	query := r.data.postgres.Material.Query()
	if filter.Keyword != "" {
		query = query.Where(material.Or(
			material.CodeContains(filter.Keyword),
			material.NameContains(filter.Keyword),
			material.CategoryContains(filter.Keyword),
			material.SpecContains(filter.Keyword),
			material.ColorContains(filter.Keyword),
		))
	}
	if filter.ActiveOnly {
		query = query.Where(material.IsActive(true))
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.Order(ent.Desc(material.FieldID)).Limit(filter.Limit).Offset(filter.Offset).All(ctx)
	if err != nil {
		return nil, 0, err
	}
	return entMaterialsToBiz(rows), total, nil
}

func (r *masterDataRepo) SetMaterialActive(ctx context.Context, id int, active bool) (*biz.Material, error) {
	row, err := r.data.postgres.Material.UpdateOneID(id).SetIsActive(active).Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrMaterialNotFound
		}
		return nil, err
	}
	return entMaterialToBiz(row), nil
}

func (r *masterDataRepo) ListUnits(ctx context.Context, filter biz.MasterDataFilter) ([]*biz.Unit, int, error) {
	query := r.data.postgres.Unit.Query()
	if filter.Keyword != "" {
		query = query.Where(unit.Or(
			unit.CodeContains(filter.Keyword),
			unit.NameContains(filter.Keyword),
		))
	}
	if filter.ActiveOnly {
		query = query.Where(unit.IsActive(true))
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.Order(ent.Desc(unit.FieldID)).Limit(filter.Limit).Offset(filter.Offset).All(ctx)
	if err != nil {
		return nil, 0, err
	}
	return entUnitsToBiz(rows), total, nil
}

func (r *masterDataRepo) ListWarehouses(ctx context.Context, filter biz.MasterDataFilter) ([]*biz.Warehouse, int, error) {
	return r.listWarehouses(ctx, filter, biz.WarehouseDataScope{Mode: biz.DataScopeModeAll})
}

func (r *masterDataRepo) ListWarehousesForAccess(ctx context.Context, filter biz.MasterDataFilter, scope biz.WarehouseDataScope) ([]*biz.Warehouse, int, error) {
	return r.listWarehouses(ctx, filter, biz.NormalizeWarehouseDataScope(scope))
}

func (r *masterDataRepo) listWarehouses(ctx context.Context, filter biz.MasterDataFilter, scope biz.WarehouseDataScope) ([]*biz.Warehouse, int, error) {
	query := r.data.postgres.Warehouse.Query()
	switch scope.Mode {
	case biz.DataScopeModeAssigned:
		query = query.Where(warehouse.IDIn(scope.WarehouseIDs...))
	case biz.DataScopeModeAll:
	default:
		return []*biz.Warehouse{}, 0, nil
	}
	if filter.Keyword != "" {
		query = query.Where(warehouse.Or(
			warehouse.CodeContains(filter.Keyword),
			warehouse.NameContains(filter.Keyword),
			warehouse.TypeContains(filter.Keyword),
		))
	}
	if filter.ActiveOnly {
		query = query.Where(warehouse.IsActive(true))
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.Order(ent.Desc(warehouse.FieldID)).Limit(filter.Limit).Offset(filter.Offset).All(ctx)
	if err != nil {
		return nil, 0, err
	}
	return entWarehousesToBiz(rows), total, nil
}

func (r *masterDataRepo) CreateProcess(ctx context.Context, in *biz.ProcessMutation) (*biz.Process, error) {
	row, err := r.data.postgres.Process.Create().
		SetCode(in.Code).
		SetName(in.Name).
		SetNillableCategory(in.Category).
		SetNillableProductionRouteOperationCode(in.ProductionRouteOperationCode).
		SetOutsourcingEnabled(in.OutsourcingEnabled).
		SetInhouseEnabled(in.InhouseEnabled).
		SetQualityRequired(in.QualityRequired).
		SetSortOrder(in.SortOrder).
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	return entProcessToBiz(row), nil
}

func (r *masterDataRepo) UpdateProcess(ctx context.Context, id int, in *biz.ProcessMutation) (*biz.Process, error) {
	update := r.data.postgres.Process.UpdateOneID(id).
		SetCode(in.Code).
		SetName(in.Name).
		SetOutsourcingEnabled(in.OutsourcingEnabled).
		SetInhouseEnabled(in.InhouseEnabled).
		SetQualityRequired(in.QualityRequired).
		SetSortOrder(in.SortOrder)
	if in.ProductionRouteOperationCode == nil {
		update.ClearProductionRouteOperationCode()
	} else {
		update.SetProductionRouteOperationCode(*in.ProductionRouteOperationCode)
	}
	if in.Category == nil {
		update.ClearCategory()
	} else {
		update.SetCategory(*in.Category)
	}
	if in.Note == nil {
		update.ClearNote()
	} else {
		update.SetNote(*in.Note)
	}
	row, err := update.Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProcessNotFound
		}
		return nil, err
	}
	return entProcessToBiz(row), nil
}

func (r *masterDataRepo) GetProcess(ctx context.Context, id int) (*biz.Process, error) {
	row, err := r.data.postgres.Process.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProcessNotFound
		}
		return nil, err
	}
	return entProcessToBiz(row), nil
}

func (r *masterDataRepo) ListProcesses(ctx context.Context, filter biz.MasterDataFilter) ([]*biz.Process, int, error) {
	query := r.data.postgres.Process.Query()
	if filter.Keyword != "" {
		query = query.Where(process.Or(
			process.CodeContains(filter.Keyword),
			process.NameContains(filter.Keyword),
			process.CategoryContains(filter.Keyword),
			process.ProductionRouteOperationCodeContains(filter.Keyword),
			process.NoteContains(filter.Keyword),
		))
	}
	if filter.ActiveOnly {
		query = query.Where(process.IsActive(true))
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.Order(ent.Asc(process.FieldSortOrder), ent.Asc(process.FieldID)).
		Limit(filter.Limit).
		Offset(filter.Offset).
		All(ctx)
	if err != nil {
		return nil, 0, err
	}
	return entProcessesToBiz(rows), total, nil
}

func (r *masterDataRepo) SetProcessActive(ctx context.Context, id int, active bool) (*biz.Process, error) {
	row, err := r.data.postgres.Process.UpdateOneID(id).SetIsActive(active).Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProcessNotFound
		}
		return nil, err
	}
	return entProcessToBiz(row), nil
}

func (r *masterDataRepo) UnitIsActive(ctx context.Context, id int) (bool, error) {
	row, err := r.data.postgres.Unit.Query().Where(unit.ID(id)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return false, biz.ErrUnitNotFound
		}
		return false, err
	}
	return row.IsActive, nil
}

func (r *masterDataRepo) CreateProduct(ctx context.Context, in *biz.ProductMutation) (*biz.Product, error) {
	row, err := r.data.postgres.Product.Create().
		SetCode(in.Code).
		SetName(in.Name).
		SetNillableStyleNo(in.StyleNo).
		SetNillableCustomerStyleNo(in.CustomerStyleNo).
		SetNillableUnitNetWeightG(in.UnitNetWeightG).
		SetDefaultUnitID(in.DefaultUnitID).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	return entProductToBiz(row), nil
}

func (r *masterDataRepo) UpdateProduct(ctx context.Context, id int, in *biz.ProductMutation) (*biz.Product, error) {
	update := r.data.postgres.Product.UpdateOneID(id).
		SetCode(in.Code).
		SetName(in.Name).
		SetDefaultUnitID(in.DefaultUnitID)
	if in.StyleNo == nil {
		update.ClearStyleNo()
	} else {
		update.SetStyleNo(*in.StyleNo)
	}
	if in.CustomerStyleNo == nil {
		update.ClearCustomerStyleNo()
	} else {
		update.SetCustomerStyleNo(*in.CustomerStyleNo)
	}
	if in.UnitNetWeightG == nil {
		update.ClearUnitNetWeightG()
	} else {
		update.SetUnitNetWeightG(*in.UnitNetWeightG)
	}
	row, err := update.Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductNotFound
		}
		return nil, err
	}
	return entProductToBiz(row), nil
}

func (r *masterDataRepo) GetProduct(ctx context.Context, id int) (*biz.Product, error) {
	row, err := r.data.postgres.Product.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductNotFound
		}
		return nil, err
	}
	return entProductToBiz(row), nil
}

func (r *masterDataRepo) ListProducts(ctx context.Context, filter biz.MasterDataFilter) ([]*biz.Product, int, error) {
	query := r.data.postgres.Product.Query()
	if filter.Keyword != "" {
		query = query.Where(product.Or(
			product.CodeContains(filter.Keyword),
			product.NameContains(filter.Keyword),
			product.StyleNoContains(filter.Keyword),
			product.CustomerStyleNoContains(filter.Keyword),
		))
	}
	if filter.ActiveOnly {
		query = query.Where(product.IsActive(true))
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.Order(ent.Desc(product.FieldID)).Limit(filter.Limit).Offset(filter.Offset).All(ctx)
	if err != nil {
		return nil, 0, err
	}
	return entProductsToBiz(rows), total, nil
}

func (r *masterDataRepo) SetProductActive(ctx context.Context, id int, active bool) (*biz.Product, error) {
	row, err := r.data.postgres.Product.UpdateOneID(id).SetIsActive(active).Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductNotFound
		}
		return nil, err
	}
	return entProductToBiz(row), nil
}

func (r *masterDataRepo) ProductIsActive(ctx context.Context, id int) (bool, error) {
	row, err := r.data.postgres.Product.Query().Where(product.ID(id)).Only(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return false, biz.ErrProductNotFound
		}
		return false, err
	}
	return row.IsActive, nil
}

func (r *masterDataRepo) CreateProductSKU(ctx context.Context, in *biz.ProductSKUMutation) (*biz.ProductSKU, error) {
	create := r.data.postgres.ProductSKU.Create().
		SetProductID(in.ProductID).
		SetSkuCode(in.SKUCode).
		SetNillableSkuName(in.SKUName).
		SetNillableBarcode(in.Barcode).
		SetNillableCustomerSku(in.CustomerSKU).
		SetNillableColor(in.Color).
		SetNillableColorNo(in.ColorNo).
		SetNillableSize(in.Size).
		SetNillablePackagingVersion(in.PackagingVersion).
		SetNillableDefaultUnitID(in.DefaultUnitID).
		SetNillableUnitNetWeightG(in.UnitNetWeightG)
	row, err := create.Save(ctx)
	if err != nil {
		return nil, err
	}
	return entProductSKUToBiz(row), nil
}

func (r *masterDataRepo) UpdateProductSKU(ctx context.Context, id int, in *biz.ProductSKUMutation) (*biz.ProductSKU, error) {
	update := r.data.postgres.ProductSKU.UpdateOneID(id).
		SetSkuCode(in.SKUCode)
	if in.SKUName == nil {
		update.ClearSkuName()
	} else {
		update.SetSkuName(*in.SKUName)
	}
	if in.Barcode == nil {
		update.ClearBarcode()
	} else {
		update.SetBarcode(*in.Barcode)
	}
	if in.CustomerSKU == nil {
		update.ClearCustomerSku()
	} else {
		update.SetCustomerSku(*in.CustomerSKU)
	}
	if in.Color == nil {
		update.ClearColor()
	} else {
		update.SetColor(*in.Color)
	}
	if in.ColorNo == nil {
		update.ClearColorNo()
	} else {
		update.SetColorNo(*in.ColorNo)
	}
	if in.Size == nil {
		update.ClearSize()
	} else {
		update.SetSize(*in.Size)
	}
	if in.PackagingVersion == nil {
		update.ClearPackagingVersion()
	} else {
		update.SetPackagingVersion(*in.PackagingVersion)
	}
	if in.DefaultUnitID == nil {
		update.ClearDefaultUnitID()
	} else {
		update.SetDefaultUnitID(*in.DefaultUnitID)
	}
	if in.UnitNetWeightG == nil {
		update.ClearUnitNetWeightG()
	} else {
		update.SetUnitNetWeightG(*in.UnitNetWeightG)
	}
	row, err := update.Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductSKUNotFound
		}
		return nil, err
	}
	return entProductSKUToBiz(row), nil
}

func (r *masterDataRepo) GetProductSKU(ctx context.Context, id int) (*biz.ProductSKU, error) {
	row, err := r.data.postgres.ProductSKU.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductSKUNotFound
		}
		return nil, err
	}
	return entProductSKUToBiz(row), nil
}

func (r *masterDataRepo) ListProductSKUs(ctx context.Context, filter biz.ProductSKUFilter) ([]*biz.ProductSKU, int, error) {
	query := r.data.postgres.ProductSKU.Query()
	if filter.ProductID > 0 {
		query = query.Where(productsku.ProductID(filter.ProductID))
	}
	if filter.Keyword != "" {
		query = query.Where(productsku.Or(
			productsku.SkuCodeContains(filter.Keyword),
			productsku.SkuNameContains(filter.Keyword),
			productsku.BarcodeContains(filter.Keyword),
			productsku.CustomerSkuContains(filter.Keyword),
			productsku.ColorContains(filter.Keyword),
			productsku.ColorNoContains(filter.Keyword),
			productsku.SizeContains(filter.Keyword),
			productsku.PackagingVersionContains(filter.Keyword),
		))
	}
	if filter.ActiveOnly {
		query = query.Where(productsku.IsActive(true))
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.Order(ent.Desc(productsku.FieldID)).
		Limit(filter.Limit).
		Offset(filter.Offset).
		All(ctx)
	if err != nil {
		return nil, 0, err
	}
	return entProductSKUsToBiz(rows), total, nil
}

func (r *masterDataRepo) SetProductSKUActive(ctx context.Context, id int, active bool) (*biz.ProductSKU, error) {
	row, err := r.data.postgres.ProductSKU.UpdateOneID(id).SetIsActive(active).Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrProductSKUNotFound
		}
		return nil, err
	}
	return entProductSKUToBiz(row), nil
}

func (r *masterDataRepo) CreateContact(ctx context.Context, in *biz.ContactMutation) (*biz.Contact, error) {
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackMasterDataEntTx(ctx, tx, r.log)

	if in.IsPrimary {
		if _, err := tx.Contact.Update().
			Where(contact.OwnerType(in.OwnerType), contact.OwnerID(in.OwnerID), contact.IsPrimary(true)).
			SetIsPrimary(false).
			Save(ctx); err != nil {
			return nil, err
		}
	}
	row, err := tx.Contact.Create().
		SetOwnerType(in.OwnerType).
		SetOwnerID(in.OwnerID).
		SetName(in.Name).
		SetNillablePhone(in.Phone).
		SetNillableMobile(in.Mobile).
		SetNillableEmail(in.Email).
		SetNillableTitle(in.Title).
		SetIsPrimary(in.IsPrimary).
		SetNillableNote(in.Note).
		Save(ctx)
	if err != nil {
		return nil, err
	}
	out := entContactToBiz(row)
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return out, nil
}

func (r *masterDataRepo) UpdateContact(ctx context.Context, id int, in *biz.ContactMutation) (*biz.Contact, error) {
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackMasterDataEntTx(ctx, tx, r.log)

	if exists, err := tx.Contact.Query().Where(contact.ID(id)).Exist(ctx); err != nil {
		return nil, err
	} else if !exists {
		return nil, biz.ErrContactNotFound
	}
	if in.IsPrimary {
		if _, err := tx.Contact.Update().
			Where(contact.OwnerType(in.OwnerType), contact.OwnerID(in.OwnerID), contact.IDNEQ(id), contact.IsPrimary(true)).
			SetIsPrimary(false).
			Save(ctx); err != nil {
			return nil, err
		}
	}
	update := tx.Contact.UpdateOneID(id).
		SetOwnerType(in.OwnerType).
		SetOwnerID(in.OwnerID).
		SetName(in.Name).
		SetIsPrimary(in.IsPrimary)
	if in.Phone == nil {
		update.ClearPhone()
	} else {
		update.SetPhone(*in.Phone)
	}
	if in.Mobile == nil {
		update.ClearMobile()
	} else {
		update.SetMobile(*in.Mobile)
	}
	if in.Email == nil {
		update.ClearEmail()
	} else {
		update.SetEmail(*in.Email)
	}
	if in.Title == nil {
		update.ClearTitle()
	} else {
		update.SetTitle(*in.Title)
	}
	if in.Note == nil {
		update.ClearNote()
	} else {
		update.SetNote(*in.Note)
	}
	row, err := update.Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrContactNotFound
		}
		return nil, err
	}
	out := entContactToBiz(row)
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return out, nil
}

func (r *masterDataRepo) GetContact(ctx context.Context, id int) (*biz.Contact, error) {
	row, err := r.data.postgres.Contact.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrContactNotFound
		}
		return nil, err
	}
	return entContactToBiz(row), nil
}

func (r *masterDataRepo) ListContactsByOwner(ctx context.Context, filter biz.ContactFilter) ([]*biz.Contact, int, error) {
	query := r.data.postgres.Contact.Query().
		Where(contact.OwnerType(filter.OwnerType), contact.OwnerID(filter.OwnerID))
	if filter.ActiveOnly {
		query = query.Where(contact.IsActive(true))
	}
	total, err := query.Clone().Count(ctx)
	if err != nil {
		return nil, 0, err
	}
	rows, err := query.Order(ent.Desc(contact.FieldIsPrimary), ent.Asc(contact.FieldID)).
		Limit(filter.Limit).
		Offset(filter.Offset).
		All(ctx)
	if err != nil {
		return nil, 0, err
	}
	return entContactsToBiz(rows), total, nil
}

func (r *masterDataRepo) SetPrimaryContact(ctx context.Context, id int) (*biz.Contact, error) {
	tx, err := r.data.postgres.Tx(ctx)
	if err != nil {
		return nil, err
	}
	defer rollbackMasterDataEntTx(ctx, tx, r.log)

	row, err := tx.Contact.Get(ctx, id)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrContactNotFound
		}
		return nil, err
	}
	if _, err := tx.Contact.Update().
		Where(contact.OwnerType(row.OwnerType), contact.OwnerID(row.OwnerID), contact.IDNEQ(row.ID), contact.IsPrimary(true)).
		SetIsPrimary(false).
		Save(ctx); err != nil {
		return nil, err
	}
	row, err = tx.Contact.UpdateOneID(row.ID).SetIsPrimary(true).SetIsActive(true).Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrContactNotFound
		}
		return nil, err
	}
	out := entContactToBiz(row)
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	tx = nil
	return out, nil
}

func (r *masterDataRepo) DisableContact(ctx context.Context, id int) (*biz.Contact, error) {
	row, err := r.data.postgres.Contact.UpdateOneID(id).
		SetIsActive(false).
		SetIsPrimary(false).
		Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrContactNotFound
		}
		return nil, err
	}
	return entContactToBiz(row), nil
}

func createCustomerWithClient(ctx context.Context, client *ent.Client, in *biz.CustomerMutation) (*ent.Customer, error) {
	return client.Customer.Create().
		SetCode(in.Code).
		SetName(in.Name).
		SetNillableShortName(in.ShortName).
		SetNillableDefaultPaymentMethod(in.DefaultPaymentMethod).
		SetNillableDefaultPaymentTermDays(in.DefaultPaymentTermDays).
		SetNillableTaxNo(in.TaxNo).
		SetNillableNote(in.Note).
		Save(ctx)
}

func updateCustomerWithClient(ctx context.Context, client *ent.Client, id int, in *biz.CustomerMutation) (*ent.Customer, error) {
	update := client.Customer.UpdateOneID(id).
		SetCode(in.Code).
		SetName(in.Name)
	if in.ShortName == nil {
		update.ClearShortName()
	} else {
		update.SetShortName(*in.ShortName)
	}
	if in.DefaultPaymentMethod == nil {
		update.ClearDefaultPaymentMethod()
	} else {
		update.SetDefaultPaymentMethod(*in.DefaultPaymentMethod)
	}
	if in.DefaultPaymentTermDays == nil {
		update.ClearDefaultPaymentTermDays()
	} else {
		update.SetDefaultPaymentTermDays(*in.DefaultPaymentTermDays)
	}
	if in.TaxNo == nil {
		update.ClearTaxNo()
	} else {
		update.SetTaxNo(*in.TaxNo)
	}
	if in.Note == nil {
		update.ClearNote()
	} else {
		update.SetNote(*in.Note)
	}
	row, err := update.Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrCustomerNotFound
		}
		return nil, err
	}
	return row, nil
}

func createSupplierWithClient(ctx context.Context, client *ent.Client, in *biz.SupplierMutation) (*ent.Supplier, error) {
	create := client.Supplier.Create().
		SetCode(in.Code).
		SetName(in.Name).
		SetNillableShortName(in.ShortName).
		SetNillableSupplierType(in.SupplierType).
		SetNillableAddress(in.Address).
		SetNillableTaxNo(in.TaxNo).
		SetNillableNote(in.Note)
	if len(in.ProcessIDs) > 0 {
		create.AddProcessCapabilityIDs(in.ProcessIDs...)
	}
	return create.Save(ctx)
}

func updateSupplierWithClient(ctx context.Context, client *ent.Client, id int, in *biz.SupplierMutation) (*ent.Supplier, error) {
	update := client.Supplier.UpdateOneID(id).
		SetCode(in.Code).
		SetName(in.Name)
	if in.ShortName == nil {
		update.ClearShortName()
	} else {
		update.SetShortName(*in.ShortName)
	}
	if in.SupplierType == nil {
		update.ClearSupplierType()
	} else {
		update.SetSupplierType(*in.SupplierType)
	}
	if in.Address == nil {
		update.ClearAddress()
	} else {
		update.SetAddress(*in.Address)
	}
	if in.TaxNo == nil {
		update.ClearTaxNo()
	} else {
		update.SetTaxNo(*in.TaxNo)
	}
	if in.Note == nil {
		update.ClearNote()
	} else {
		update.SetNote(*in.Note)
	}
	if in.ProcessIDs != nil {
		update.ClearProcessCapabilities()
		if len(in.ProcessIDs) > 0 {
			update.AddProcessCapabilityIDs(in.ProcessIDs...)
		}
	}
	row, err := update.Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrSupplierNotFound
		}
		return nil, err
	}
	return row, nil
}

func saveContactsForOwner(ctx context.Context, client *ent.Client, ownerType string, ownerID int, items []*biz.ContactSaveMutation) ([]*biz.Contact, error) {
	retainedIDs := make([]int, 0, len(items))
	for _, item := range items {
		item.OwnerType = ownerType
		item.OwnerID = ownerID
		if item.ID > 0 {
			if err := ensureContactOwner(ctx, client, item.ID, ownerType, ownerID); err != nil {
				return nil, err
			}
			if item.IsPrimary {
				if err := clearOtherPrimaryContacts(ctx, client, ownerType, ownerID, item.ID); err != nil {
					return nil, err
				}
			}
			row, err := updateContactWithClient(ctx, client, item.ID, &item.ContactMutation)
			if err != nil {
				return nil, err
			}
			retainedIDs = append(retainedIDs, row.ID)
			continue
		}
		if item.IsPrimary {
			if err := clearOtherPrimaryContacts(ctx, client, ownerType, ownerID, 0); err != nil {
				return nil, err
			}
		}
		row, err := createContactWithClient(ctx, client, &item.ContactMutation)
		if err != nil {
			return nil, err
		}
		retainedIDs = append(retainedIDs, row.ID)
	}

	disableQuery := client.Contact.Update().
		Where(contact.OwnerType(ownerType), contact.OwnerID(ownerID), contact.IsActive(true))
	if len(retainedIDs) > 0 {
		disableQuery = disableQuery.Where(contact.IDNotIn(retainedIDs...))
	}
	if _, err := disableQuery.SetIsActive(false).SetIsPrimary(false).Save(ctx); err != nil {
		return nil, err
	}
	return listActiveContactsForOwner(ctx, client, ownerType, ownerID)
}

func ensureContactOwner(ctx context.Context, client *ent.Client, id int, ownerType string, ownerID int) error {
	exists, err := client.Contact.Query().
		Where(contact.ID(id), contact.OwnerType(ownerType), contact.OwnerID(ownerID)).
		Exist(ctx)
	if err != nil {
		return err
	}
	if !exists {
		return biz.ErrContactNotFound
	}
	return nil
}

func clearOtherPrimaryContacts(ctx context.Context, client *ent.Client, ownerType string, ownerID int, keepID int) error {
	query := client.Contact.Update().
		Where(contact.OwnerType(ownerType), contact.OwnerID(ownerID), contact.IsPrimary(true))
	if keepID > 0 {
		query = query.Where(contact.IDNEQ(keepID))
	}
	_, err := query.SetIsPrimary(false).Save(ctx)
	return err
}

func createContactWithClient(ctx context.Context, client *ent.Client, in *biz.ContactMutation) (*ent.Contact, error) {
	return client.Contact.Create().
		SetOwnerType(in.OwnerType).
		SetOwnerID(in.OwnerID).
		SetName(in.Name).
		SetNillablePhone(in.Phone).
		SetNillableMobile(in.Mobile).
		SetNillableEmail(in.Email).
		SetNillableTitle(in.Title).
		SetIsPrimary(in.IsPrimary).
		SetNillableNote(in.Note).
		Save(ctx)
}

func updateContactWithClient(ctx context.Context, client *ent.Client, id int, in *biz.ContactMutation) (*ent.Contact, error) {
	update := client.Contact.UpdateOneID(id).
		SetOwnerType(in.OwnerType).
		SetOwnerID(in.OwnerID).
		SetName(in.Name).
		SetIsPrimary(in.IsPrimary).
		SetIsActive(true)
	if in.Phone == nil {
		update.ClearPhone()
	} else {
		update.SetPhone(*in.Phone)
	}
	if in.Mobile == nil {
		update.ClearMobile()
	} else {
		update.SetMobile(*in.Mobile)
	}
	if in.Email == nil {
		update.ClearEmail()
	} else {
		update.SetEmail(*in.Email)
	}
	if in.Title == nil {
		update.ClearTitle()
	} else {
		update.SetTitle(*in.Title)
	}
	if in.Note == nil {
		update.ClearNote()
	} else {
		update.SetNote(*in.Note)
	}
	row, err := update.Save(ctx)
	if err != nil {
		if ent.IsNotFound(err) {
			return nil, biz.ErrContactNotFound
		}
		return nil, err
	}
	return row, nil
}

func listActiveContactsForOwner(ctx context.Context, client *ent.Client, ownerType string, ownerID int) ([]*biz.Contact, error) {
	rows, err := client.Contact.Query().
		Where(contact.OwnerType(ownerType), contact.OwnerID(ownerID), contact.IsActive(true)).
		Order(ent.Desc(contact.FieldIsPrimary), ent.Asc(contact.FieldID)).
		All(ctx)
	if err != nil {
		return nil, err
	}
	return entContactsToBiz(rows), nil
}

func rollbackMasterDataEntTx(ctx context.Context, tx *ent.Tx, logger *log.Helper) {
	if tx == nil {
		return
	}
	if err := tx.Rollback(); err != nil && logger != nil {
		logger.WithContext(ctx).Warnf("rollback ent tx failed err=%v", err)
	}
}

func entCustomerToBiz(row *ent.Customer) *biz.Customer {
	if row == nil {
		return nil
	}
	return &biz.Customer{
		ID:                     row.ID,
		Code:                   row.Code,
		Name:                   row.Name,
		ShortName:              row.ShortName,
		DefaultPaymentMethod:   row.DefaultPaymentMethod,
		DefaultPaymentTermDays: row.DefaultPaymentTermDays,
		TaxNo:                  row.TaxNo,
		IsActive:               row.IsActive,
		Note:                   row.Note,
		CreatedAt:              row.CreatedAt,
		UpdatedAt:              row.UpdatedAt,
	}
}

func entCustomersToBiz(rows []*ent.Customer) []*biz.Customer {
	out := make([]*biz.Customer, 0, len(rows))
	for _, row := range rows {
		out = append(out, entCustomerToBiz(row))
	}
	return out
}

func entSupplierToBiz(row *ent.Supplier) *biz.Supplier {
	if row == nil {
		return nil
	}
	processIDs := make([]int, 0, len(row.Edges.ProcessCapabilities))
	for _, processItem := range row.Edges.ProcessCapabilities {
		if processItem != nil {
			processIDs = append(processIDs, processItem.ID)
		}
	}
	return &biz.Supplier{
		ID:           row.ID,
		Code:         row.Code,
		Name:         row.Name,
		ShortName:    row.ShortName,
		SupplierType: row.SupplierType,
		Address:      row.Address,
		TaxNo:        row.TaxNo,
		ProcessIDs:   processIDs,
		IsActive:     row.IsActive,
		Note:         row.Note,
		CreatedAt:    row.CreatedAt,
		UpdatedAt:    row.UpdatedAt,
	}
}

func entSuppliersToBiz(rows []*ent.Supplier) []*biz.Supplier {
	out := make([]*biz.Supplier, 0, len(rows))
	for _, row := range rows {
		out = append(out, entSupplierToBiz(row))
	}
	return out
}

func entMaterialToBiz(row *ent.Material) *biz.Material {
	if row == nil {
		return nil
	}
	return &biz.Material{
		ID:            row.ID,
		Code:          row.Code,
		Name:          row.Name,
		Category:      row.Category,
		Spec:          row.Spec,
		Color:         row.Color,
		DefaultUnitID: row.DefaultUnitID,
		IsActive:      row.IsActive,
		CreatedAt:     row.CreatedAt,
		UpdatedAt:     row.UpdatedAt,
	}
}

func entMaterialsToBiz(rows []*ent.Material) []*biz.Material {
	out := make([]*biz.Material, 0, len(rows))
	for _, row := range rows {
		out = append(out, entMaterialToBiz(row))
	}
	return out
}

func entUnitToBiz(row *ent.Unit) *biz.Unit {
	if row == nil {
		return nil
	}
	return &biz.Unit{
		ID:        row.ID,
		Code:      row.Code,
		Name:      row.Name,
		Precision: row.Precision,
		IsActive:  row.IsActive,
		CreatedAt: row.CreatedAt,
		UpdatedAt: row.UpdatedAt,
	}
}

func entUnitsToBiz(rows []*ent.Unit) []*biz.Unit {
	out := make([]*biz.Unit, 0, len(rows))
	for _, row := range rows {
		out = append(out, entUnitToBiz(row))
	}
	return out
}

func entWarehouseToBiz(row *ent.Warehouse) *biz.Warehouse {
	if row == nil {
		return nil
	}
	return &biz.Warehouse{
		ID:        row.ID,
		Code:      row.Code,
		Name:      row.Name,
		Type:      row.Type,
		IsActive:  row.IsActive,
		CreatedAt: row.CreatedAt,
		UpdatedAt: row.UpdatedAt,
	}
}

func entWarehousesToBiz(rows []*ent.Warehouse) []*biz.Warehouse {
	out := make([]*biz.Warehouse, 0, len(rows))
	for _, row := range rows {
		out = append(out, entWarehouseToBiz(row))
	}
	return out
}

func entProcessToBiz(row *ent.Process) *biz.Process {
	if row == nil {
		return nil
	}
	return &biz.Process{
		ID:                           row.ID,
		Code:                         row.Code,
		Name:                         row.Name,
		Category:                     row.Category,
		ProductionRouteOperationCode: row.ProductionRouteOperationCode,
		OutsourcingEnabled:           row.OutsourcingEnabled,
		InhouseEnabled:               row.InhouseEnabled,
		QualityRequired:              row.QualityRequired,
		SortOrder:                    row.SortOrder,
		Note:                         row.Note,
		IsActive:                     row.IsActive,
		CreatedAt:                    row.CreatedAt,
		UpdatedAt:                    row.UpdatedAt,
	}
}

func entProcessesToBiz(rows []*ent.Process) []*biz.Process {
	out := make([]*biz.Process, 0, len(rows))
	for _, row := range rows {
		out = append(out, entProcessToBiz(row))
	}
	return out
}

func entProductToBiz(row *ent.Product) *biz.Product {
	if row == nil {
		return nil
	}
	return &biz.Product{
		ID:              row.ID,
		Code:            row.Code,
		Name:            row.Name,
		StyleNo:         row.StyleNo,
		CustomerStyleNo: row.CustomerStyleNo,
		DefaultUnitID:   row.DefaultUnitID,
		UnitNetWeightG:  row.UnitNetWeightG,
		IsActive:        row.IsActive,
		CreatedAt:       row.CreatedAt,
		UpdatedAt:       row.UpdatedAt,
	}
}

func entProductsToBiz(rows []*ent.Product) []*biz.Product {
	out := make([]*biz.Product, 0, len(rows))
	for _, row := range rows {
		out = append(out, entProductToBiz(row))
	}
	return out
}

func entProductSKUToBiz(row *ent.ProductSKU) *biz.ProductSKU {
	if row == nil {
		return nil
	}
	return &biz.ProductSKU{
		ID:               row.ID,
		ProductID:        row.ProductID,
		SKUCode:          row.SkuCode,
		SKUName:          row.SkuName,
		Barcode:          row.Barcode,
		CustomerSKU:      row.CustomerSku,
		Color:            row.Color,
		ColorNo:          row.ColorNo,
		Size:             row.Size,
		PackagingVersion: row.PackagingVersion,
		DefaultUnitID:    row.DefaultUnitID,
		UnitNetWeightG:   row.UnitNetWeightG,
		IsActive:         row.IsActive,
		CreatedAt:        row.CreatedAt,
		UpdatedAt:        row.UpdatedAt,
	}
}

func entProductSKUsToBiz(rows []*ent.ProductSKU) []*biz.ProductSKU {
	out := make([]*biz.ProductSKU, 0, len(rows))
	for _, row := range rows {
		out = append(out, entProductSKUToBiz(row))
	}
	return out
}

func entContactToBiz(row *ent.Contact) *biz.Contact {
	if row == nil {
		return nil
	}
	return &biz.Contact{
		ID:        row.ID,
		OwnerType: row.OwnerType,
		OwnerID:   row.OwnerID,
		Name:      row.Name,
		Phone:     row.Phone,
		Mobile:    row.Mobile,
		Email:     row.Email,
		Title:     row.Title,
		IsPrimary: row.IsPrimary,
		IsActive:  row.IsActive,
		Note:      row.Note,
		CreatedAt: row.CreatedAt,
		UpdatedAt: row.UpdatedAt,
	}
}

func entContactsToBiz(rows []*ent.Contact) []*biz.Contact {
	out := make([]*biz.Contact, 0, len(rows))
	for _, row := range rows {
		out = append(out, entContactToBiz(row))
	}
	return out
}
