package service

import (
	"context"
	"errors"
	"fmt"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"

	"google.golang.org/protobuf/types/known/structpb"
)

func (d *jsonrpcDispatcher) handleMasterData(
	ctx context.Context,
	method, id string,
	params *structpb.Struct,
) (string, *v1.JsonrpcResult, error) {
	pm := map[string]any{}
	if params != nil {
		pm = params.AsMap()
	}
	if _, res := d.requireAdmin(ctx); res != nil {
		return id, res, nil
	}
	if d.masterDataUC == nil {
		return id, &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}, nil
	}

	switch method {
	case "save_customer_with_contacts", "saveCustomerWithContacts":
		ownerID := getInt(pm, "id", 0)
		if ownerID > 0 {
			if res := d.RequireAdminPermission(ctx, biz.PermissionCustomerUpdate); res != nil {
				return id, res, nil
			}
		} else if res := d.RequireAdminPermission(ctx, biz.PermissionCustomerCreate); res != nil {
			return id, res, nil
		}
		if res := d.requireContactAggregatePermissions(ctx); res != nil {
			return id, res, nil
		}
		contacts, ok := contactSaveMutationsFromParams(pm)
		if !ok {
			return id, d.mapMasterDataError(ctx, biz.ErrBadParam), nil
		}
		item, err := d.masterDataUC.SaveCustomerWithContacts(ctx, ownerID, customerMutationFromParams(pm), contacts)
		return id, customerWithContactsMutationResult(ctx, d, item, err), nil
	case "create_customer", "createCustomer":
		if res := d.RequireAdminPermission(ctx, biz.PermissionCustomerCreate); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.CreateCustomer(ctx, customerMutationFromParams(pm))
		return id, masterDataMutationResult(ctx, d, "customer", item, err), nil
	case "update_customer", "updateCustomer":
		if res := d.RequireAdminPermission(ctx, biz.PermissionCustomerUpdate); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.UpdateCustomer(ctx, getInt(pm, "id", 0), customerMutationFromParams(pm))
		return id, masterDataMutationResult(ctx, d, "customer", item, err), nil
	case "get_customer", "getCustomer":
		if res := d.RequireAdminPermission(ctx, biz.PermissionCustomerRead); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.GetCustomer(ctx, getInt(pm, "id", 0))
		return id, masterDataMutationResult(ctx, d, "customer", item, err), nil
	case "list_customers", "listCustomers":
		if res := d.RequireAdminPermission(ctx, biz.PermissionCustomerRead); res != nil {
			return id, res, nil
		}
		items, total, err := d.masterDataUC.ListCustomers(ctx, masterDataFilterFromParams(pm))
		if err != nil {
			return id, d.mapMasterDataError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"customers": customersToAny(items),
			"total":     total,
			"limit":     normalizedLimit(pm),
			"offset":    normalizedOffset(pm),
		})}, nil
	case "set_customer_active", "setCustomerActive":
		if res := d.RequireAdminPermission(ctx, biz.PermissionCustomerDisable); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.SetCustomerActive(ctx, getInt(pm, "id", 0), getBool(pm, "active", true))
		return id, masterDataMutationResult(ctx, d, "customer", item, err), nil

	case "save_supplier_with_contacts", "saveSupplierWithContacts":
		ownerID := getInt(pm, "id", 0)
		if ownerID > 0 {
			if res := d.RequireAdminPermission(ctx, biz.PermissionSupplierUpdate); res != nil {
				return id, res, nil
			}
		} else if res := d.RequireAdminPermission(ctx, biz.PermissionSupplierCreate); res != nil {
			return id, res, nil
		}
		if res := d.requireContactAggregatePermissions(ctx); res != nil {
			return id, res, nil
		}
		contacts, ok := contactSaveMutationsFromParams(pm)
		if !ok {
			return id, d.mapMasterDataError(ctx, biz.ErrBadParam), nil
		}
		item, err := d.masterDataUC.SaveSupplierWithContacts(ctx, ownerID, supplierMutationFromParams(pm), contacts)
		return id, supplierWithContactsMutationResult(ctx, d, item, err), nil
	case "create_supplier", "createSupplier":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSupplierCreate); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.CreateSupplier(ctx, supplierMutationFromParams(pm))
		return id, supplierMutationResult(ctx, d, item, err), nil
	case "update_supplier", "updateSupplier":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSupplierUpdate); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.UpdateSupplier(ctx, getInt(pm, "id", 0), supplierMutationFromParams(pm))
		return id, supplierMutationResult(ctx, d, item, err), nil
	case "get_supplier", "getSupplier":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSupplierRead); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.GetSupplier(ctx, getInt(pm, "id", 0))
		return id, supplierMutationResult(ctx, d, item, err), nil
	case "list_suppliers", "listSuppliers":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSupplierRead); res != nil {
			return id, res, nil
		}
		items, total, err := d.masterDataUC.ListSuppliers(ctx, masterDataFilterFromParams(pm))
		if err != nil {
			return id, d.mapMasterDataError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"suppliers": suppliersToAny(items),
			"total":     total,
			"limit":     normalizedLimit(pm),
			"offset":    normalizedOffset(pm),
		})}, nil
	case "set_supplier_active", "setSupplierActive":
		if res := d.RequireAdminPermission(ctx, biz.PermissionSupplierDisable); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.SetSupplierActive(ctx, getInt(pm, "id", 0), getBool(pm, "active", true))
		return id, supplierMutationResult(ctx, d, item, err), nil

	case "create_material", "createMaterial":
		if res := d.RequireAdminPermission(ctx, biz.PermissionMaterialCreate); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.CreateMaterial(ctx, materialMutationFromParams(pm))
		return id, materialMutationResult(ctx, d, item, err), nil
	case "update_material", "updateMaterial":
		if res := d.RequireAdminPermission(ctx, biz.PermissionMaterialUpdate); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.UpdateMaterial(ctx, getInt(pm, "id", 0), materialMutationFromParams(pm))
		return id, materialMutationResult(ctx, d, item, err), nil
	case "get_material", "getMaterial":
		if res := d.RequireAdminPermission(ctx, biz.PermissionMaterialRead); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.GetMaterial(ctx, getInt(pm, "id", 0))
		return id, materialMutationResult(ctx, d, item, err), nil
	case "list_materials", "listMaterials":
		if res := d.RequireAdminPermission(ctx, biz.PermissionMaterialRead); res != nil {
			return id, res, nil
		}
		items, total, err := d.masterDataUC.ListMaterials(ctx, masterDataFilterFromParams(pm))
		if err != nil {
			return id, d.mapMasterDataError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"materials": materialsToAny(items),
			"total":     total,
			"limit":     normalizedLimit(pm),
			"offset":    normalizedOffset(pm),
		})}, nil
	case "set_material_active", "setMaterialActive":
		if res := d.RequireAdminPermission(ctx, biz.PermissionMaterialDisable); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.SetMaterialActive(ctx, getInt(pm, "id", 0), getBool(pm, "active", true))
		return id, materialMutationResult(ctx, d, item, err), nil
	case "list_units", "listUnits":
		if res := d.RequireAdminPermission(ctx, biz.PermissionMaterialRead); res != nil {
			return id, res, nil
		}
		items, total, err := d.masterDataUC.ListUnits(ctx, masterDataFilterFromParams(pm))
		if err != nil {
			return id, d.mapMasterDataError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"units":  unitsToAny(items),
			"total":  total,
			"limit":  normalizedLimit(pm),
			"offset": normalizedOffset(pm),
		})}, nil
	case "list_warehouses", "listWarehouses":
		if res := d.RequireAdminPermission(ctx, biz.PermissionWarehouseInventoryRead); res != nil {
			return id, res, nil
		}
		items, total, err := d.masterDataUC.ListWarehouses(ctx, masterDataFilterFromParams(pm))
		if err != nil {
			return id, d.mapMasterDataError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"warehouses": warehousesToAny(items),
			"total":      total,
			"limit":      normalizedLimit(pm),
			"offset":     normalizedOffset(pm),
		})}, nil

	case "create_process", "createProcess":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProcessCreate); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.CreateProcess(ctx, processMutationFromParams(pm))
		return id, processMutationResult(ctx, d, item, err), nil
	case "update_process", "updateProcess":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProcessUpdate); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.UpdateProcess(ctx, getInt(pm, "id", 0), processMutationFromParams(pm))
		return id, processMutationResult(ctx, d, item, err), nil
	case "get_process", "getProcess":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProcessRead); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.GetProcess(ctx, getInt(pm, "id", 0))
		return id, processMutationResult(ctx, d, item, err), nil
	case "list_processes", "listProcesses":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProcessRead); res != nil {
			return id, res, nil
		}
		items, total, err := d.masterDataUC.ListProcesses(ctx, masterDataFilterFromParams(pm))
		if err != nil {
			return id, d.mapMasterDataError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"processes": processesToAny(items),
			"total":     total,
			"limit":     normalizedLimit(pm),
			"offset":    normalizedOffset(pm),
		})}, nil
	case "set_process_active", "setProcessActive":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProcessDisable); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.SetProcessActive(ctx, getInt(pm, "id", 0), getBool(pm, "active", true))
		return id, processMutationResult(ctx, d, item, err), nil

	case "create_product", "createProduct":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProductCreate); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.CreateProduct(ctx, productMutationFromParams(pm))
		return id, productMutationResult(ctx, d, item, err), nil
	case "update_product", "updateProduct":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProductUpdate); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.UpdateProduct(ctx, getInt(pm, "id", 0), productMutationFromParams(pm))
		return id, productMutationResult(ctx, d, item, err), nil
	case "get_product", "getProduct":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProductRead); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.GetProduct(ctx, getInt(pm, "id", 0))
		return id, productMutationResult(ctx, d, item, err), nil
	case "list_products", "listProducts":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProductRead); res != nil {
			return id, res, nil
		}
		items, total, err := d.masterDataUC.ListProducts(ctx, masterDataFilterFromParams(pm))
		if err != nil {
			return id, d.mapMasterDataError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"products": productsToAny(items),
			"total":    total,
			"limit":    normalizedLimit(pm),
			"offset":   normalizedOffset(pm),
		})}, nil
	case "set_product_active", "setProductActive":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProductDisable); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.SetProductActive(ctx, getInt(pm, "id", 0), getBool(pm, "active", true))
		return id, productMutationResult(ctx, d, item, err), nil

	case "create_product_sku", "createProductSKU":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProductSKUCreate); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.CreateProductSKU(ctx, productSKUMutationFromParams(pm))
		return id, productSKUMutationResult(ctx, d, item, err), nil
	case "update_product_sku", "updateProductSKU":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProductSKUUpdate); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.UpdateProductSKU(ctx, getInt(pm, "id", 0), productSKUMutationFromParams(pm))
		return id, productSKUMutationResult(ctx, d, item, err), nil
	case "get_product_sku", "getProductSKU":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProductSKURead); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.GetProductSKU(ctx, getInt(pm, "id", 0))
		return id, productSKUMutationResult(ctx, d, item, err), nil
	case "list_product_skus", "listProductSKUs":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProductSKURead); res != nil {
			return id, res, nil
		}
		items, total, err := d.masterDataUC.ListProductSKUs(ctx, productSKUFilterFromParams(pm))
		if err != nil {
			return id, d.mapMasterDataError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"product_skus": productSKUsToAny(items),
			"total":        total,
			"limit":        normalizedLimit(pm),
			"offset":       normalizedOffset(pm),
		})}, nil
	case "set_product_sku_active", "setProductSKUActive":
		if res := d.RequireAdminPermission(ctx, biz.PermissionProductSKUDisable); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.SetProductSKUActive(ctx, getInt(pm, "id", 0), getBool(pm, "active", true))
		return id, productSKUMutationResult(ctx, d, item, err), nil

	case "create_contact", "createContact":
		if res := d.RequireAdminPermission(ctx, biz.PermissionContactCreate); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.CreateContact(ctx, contactMutationFromParams(pm))
		return id, contactMutationResult(ctx, d, item, err), nil
	case "update_contact", "updateContact":
		if res := d.RequireAdminPermission(ctx, biz.PermissionContactUpdate); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.UpdateContact(ctx, getInt(pm, "id", 0), contactMutationFromParams(pm))
		return id, contactMutationResult(ctx, d, item, err), nil
	case "get_contact", "getContact":
		if res := d.RequireAdminPermission(ctx, biz.PermissionContactRead); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.GetContact(ctx, getInt(pm, "id", 0))
		return id, contactMutationResult(ctx, d, item, err), nil
	case "list_contacts_by_owner", "listContactsByOwner":
		if res := d.RequireAdminPermission(ctx, biz.PermissionContactRead); res != nil {
			return id, res, nil
		}
		items, total, err := d.masterDataUC.ListContactsByOwner(ctx, biz.ContactFilter{
			OwnerType:  getString(pm, "owner_type"),
			OwnerID:    getInt(pm, "owner_id", 0),
			ActiveOnly: getBool(pm, "active_only", false),
			Limit:      getInt(pm, "limit", 50),
			Offset:     getInt(pm, "offset", 0),
		})
		if err != nil {
			return id, d.mapMasterDataError(ctx, err), nil
		}
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
			"contacts": contactsToAny(items),
			"total":    total,
			"limit":    normalizedLimit(pm),
			"offset":   normalizedOffset(pm),
		})}, nil
	case "set_primary_contact", "setPrimaryContact":
		if res := d.RequireAdminPermission(ctx, biz.PermissionContactSetPrimary); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.SetPrimaryContact(ctx, getInt(pm, "id", 0))
		return id, contactMutationResult(ctx, d, item, err), nil
	case "disable_contact", "disableContact":
		if res := d.RequireAdminPermission(ctx, biz.PermissionContactDisable); res != nil {
			return id, res, nil
		}
		item, err := d.masterDataUC.DisableContact(ctx, getInt(pm, "id", 0))
		return id, contactMutationResult(ctx, d, item, err), nil
	default:
		return id, &v1.JsonrpcResult{
			Code:    errcode.UnknownMethod.Code,
			Message: fmt.Sprintf("未知 masterdata 接口 method=%s", method),
		}, nil
	}
}

func customerMutationFromParams(pm map[string]any) *biz.CustomerMutation {
	return &biz.CustomerMutation{
		Code:                   getString(pm, "code"),
		Name:                   getString(pm, "name"),
		ShortName:              getWorkflowStringPtr(pm, "short_name"),
		DefaultPaymentMethod:   getWorkflowStringPtr(pm, "default_payment_method"),
		DefaultPaymentTermDays: getOptionalNonNegativeInt(pm, "default_payment_term_days"),
		TaxNo:                  getWorkflowStringPtr(pm, "tax_no"),
		Note:                   getWorkflowStringPtr(pm, "note"),
	}
}

func supplierMutationFromParams(pm map[string]any) *biz.SupplierMutation {
	return &biz.SupplierMutation{
		Code:         getString(pm, "code"),
		Name:         getString(pm, "name"),
		ShortName:    getWorkflowStringPtr(pm, "short_name"),
		SupplierType: getWorkflowStringPtr(pm, "supplier_type"),
		TaxNo:        getWorkflowStringPtr(pm, "tax_no"),
		Note:         getWorkflowStringPtr(pm, "note"),
	}
}

func materialMutationFromParams(pm map[string]any) *biz.MaterialMutation {
	return &biz.MaterialMutation{
		Code:          getString(pm, "code"),
		Name:          getString(pm, "name"),
		Category:      getWorkflowStringPtr(pm, "category"),
		Spec:          getWorkflowStringPtr(pm, "spec"),
		Color:         getWorkflowStringPtr(pm, "color"),
		DefaultUnitID: getInt(pm, "default_unit_id", 0),
	}
}

func processMutationFromParams(pm map[string]any) *biz.ProcessMutation {
	return &biz.ProcessMutation{
		Code:               getString(pm, "code"),
		Name:               getString(pm, "name"),
		Category:           getWorkflowStringPtr(pm, "category"),
		OutsourcingEnabled: getBool(pm, "outsourcing_enabled", false),
		InhouseEnabled:     getBool(pm, "inhouse_enabled", true),
		QualityRequired:    getBool(pm, "quality_required", false),
		SortOrder:          getInt(pm, "sort_order", 0),
		Note:               getWorkflowStringPtr(pm, "note"),
	}
}

func productMutationFromParams(pm map[string]any) *biz.ProductMutation {
	return &biz.ProductMutation{
		Code:            getString(pm, "code"),
		Name:            getString(pm, "name"),
		StyleNo:         getWorkflowStringPtr(pm, "style_no"),
		CustomerStyleNo: getWorkflowStringPtr(pm, "customer_style_no"),
		DefaultUnitID:   getInt(pm, "default_unit_id", 0),
	}
}

func productSKUMutationFromParams(pm map[string]any) *biz.ProductSKUMutation {
	return &biz.ProductSKUMutation{
		ProductID:        getInt(pm, "product_id", 0),
		SKUCode:          getString(pm, "sku_code"),
		SKUName:          getWorkflowStringPtr(pm, "sku_name"),
		Barcode:          getWorkflowStringPtr(pm, "barcode"),
		CustomerSKU:      getWorkflowStringPtr(pm, "customer_sku"),
		Color:            getWorkflowStringPtr(pm, "color"),
		ColorNo:          getWorkflowStringPtr(pm, "color_no"),
		Size:             getWorkflowStringPtr(pm, "size"),
		PackagingVersion: getWorkflowStringPtr(pm, "packaging_version"),
		DefaultUnitID:    getOptionalPositiveIntPtr(pm, "default_unit_id"),
	}
}

func contactMutationFromParams(pm map[string]any) *biz.ContactMutation {
	return &biz.ContactMutation{
		OwnerType: getString(pm, "owner_type"),
		OwnerID:   getInt(pm, "owner_id", 0),
		Name:      getString(pm, "name"),
		Phone:     getWorkflowStringPtr(pm, "phone"),
		Mobile:    getWorkflowStringPtr(pm, "mobile"),
		Email:     getWorkflowStringPtr(pm, "email"),
		Title:     getWorkflowStringPtr(pm, "title"),
		IsPrimary: getBool(pm, "is_primary", false),
		Note:      getWorkflowStringPtr(pm, "note"),
	}
}

func contactSaveMutationsFromParams(pm map[string]any) ([]*biz.ContactSaveMutation, bool) {
	raw, ok := pm["contacts"]
	if !ok {
		return nil, false
	}
	rawItems, ok := raw.([]any)
	if !ok {
		return nil, false
	}
	contacts := make([]*biz.ContactSaveMutation, 0, len(rawItems))
	for _, rawItem := range rawItems {
		itemMap, ok := rawItem.(map[string]any)
		if !ok {
			return nil, false
		}
		contacts = append(contacts, &biz.ContactSaveMutation{
			ID:              getInt(itemMap, "id", 0),
			ContactMutation: *contactMutationFromParams(itemMap),
		})
	}
	return contacts, true
}

func productSKUFilterFromParams(pm map[string]any) biz.ProductSKUFilter {
	return biz.ProductSKUFilter{
		ProductID:  getInt(pm, "product_id", 0),
		Keyword:    getString(pm, "keyword"),
		ActiveOnly: getBool(pm, "active_only", false),
		Limit:      getInt(pm, "limit", 50),
		Offset:     getInt(pm, "offset", 0),
	}
}

func masterDataFilterFromParams(pm map[string]any) biz.MasterDataFilter {
	return biz.MasterDataFilter{
		Keyword:    getString(pm, "keyword"),
		ActiveOnly: getBool(pm, "active_only", false),
		Limit:      getInt(pm, "limit", 50),
		Offset:     getInt(pm, "offset", 0),
	}
}

func (d *jsonrpcDispatcher) requireContactAggregatePermissions(ctx context.Context) *v1.JsonrpcResult {
	for _, permission := range []string{
		biz.PermissionContactCreate,
		biz.PermissionContactUpdate,
		biz.PermissionContactDisable,
	} {
		if res := d.RequireAdminPermission(ctx, permission); res != nil {
			return res
		}
	}
	return nil
}

func (d *jsonrpcDispatcher) mapMasterDataError(ctx context.Context, err error) *v1.JsonrpcResult {
	l := d.log.WithContext(ctx)
	switch {
	case errors.Is(err, biz.ErrBadParam):
		l.Warnf("[masterdata] invalid param err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: errcode.InvalidParam.Message}
	case errors.Is(err, biz.ErrCustomerNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "客户不存在"}
	case errors.Is(err, biz.ErrSupplierNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "供应商不存在"}
	case errors.Is(err, biz.ErrMaterialNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "材料不存在"}
	case errors.Is(err, biz.ErrProcessNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "工序不存在"}
	case errors.Is(err, biz.ErrProductSKUNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "SKU 不存在"}
	case errors.Is(err, biz.ErrProductNotFound), errors.Is(err, biz.ErrProductInactive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "产品不存在或已停用"}
	case errors.Is(err, biz.ErrContactNotFound):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "联系人不存在"}
	case errors.Is(err, biz.ErrUnitNotFound), errors.Is(err, biz.ErrUnitInactive):
		return &v1.JsonrpcResult{Code: errcode.InvalidParam.Code, Message: "默认单位不存在或已停用"}
	default:
		l.Errorf("[masterdata] internal err=%v", err)
		return &v1.JsonrpcResult{Code: errcode.Internal.Code, Message: errcode.Internal.Message}
	}
}

func masterDataMutationResult(ctx context.Context, d *jsonrpcDispatcher, key string, item *biz.Customer, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapMasterDataError(ctx, err)
	}
	return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{key: customerToMap(item)})}
}

func supplierMutationResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.Supplier, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapMasterDataError(ctx, err)
	}
	return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"supplier": supplierToMap(item)})}
}

func customerWithContactsMutationResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.CustomerWithContacts, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapMasterDataError(ctx, err)
	}
	return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
		"customer": customerToMap(item.Customer),
		"contacts": contactsToAny(item.Contacts),
	})}
}

func supplierWithContactsMutationResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.SupplierWithContacts, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapMasterDataError(ctx, err)
	}
	return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{
		"supplier": supplierToMap(item.Supplier),
		"contacts": contactsToAny(item.Contacts),
	})}
}

func materialMutationResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.Material, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapMasterDataError(ctx, err)
	}
	return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"material": materialToMap(item)})}
}

func processMutationResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.Process, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapMasterDataError(ctx, err)
	}
	return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"process": processToMap(item)})}
}

func productMutationResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.Product, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapMasterDataError(ctx, err)
	}
	return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"product": productToMap(item)})}
}

func productSKUMutationResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.ProductSKU, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapMasterDataError(ctx, err)
	}
	return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"product_sku": productSKUToMap(item)})}
}

func contactMutationResult(ctx context.Context, d *jsonrpcDispatcher, item *biz.Contact, err error) *v1.JsonrpcResult {
	if err != nil {
		return d.mapMasterDataError(ctx, err)
	}
	return &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: newDataStruct(map[string]any{"contact": contactToMap(item)})}
}

func customerToMap(item *biz.Customer) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":                        item.ID,
		"code":                      item.Code,
		"name":                      item.Name,
		"short_name":                optionalStringValue(item.ShortName),
		"default_payment_method":    optionalStringValue(item.DefaultPaymentMethod),
		"default_payment_term_days": optionalIntValue(item.DefaultPaymentTermDays),
		"tax_no":                    optionalStringValue(item.TaxNo),
		"is_active":                 item.IsActive,
		"note":                      optionalStringValue(item.Note),
		"created_at":                item.CreatedAt.Unix(),
		"updated_at":                item.UpdatedAt.Unix(),
	}
}

func customersToAny(items []*biz.Customer) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, customerToMap(item))
	}
	return out
}

func supplierToMap(item *biz.Supplier) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":            item.ID,
		"code":          item.Code,
		"name":          item.Name,
		"short_name":    optionalStringValue(item.ShortName),
		"supplier_type": optionalStringValue(item.SupplierType),
		"tax_no":        optionalStringValue(item.TaxNo),
		"is_active":     item.IsActive,
		"note":          optionalStringValue(item.Note),
		"created_at":    item.CreatedAt.Unix(),
		"updated_at":    item.UpdatedAt.Unix(),
	}
}

func suppliersToAny(items []*biz.Supplier) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, supplierToMap(item))
	}
	return out
}

func materialToMap(item *biz.Material) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":              item.ID,
		"code":            item.Code,
		"name":            item.Name,
		"category":        optionalStringValue(item.Category),
		"spec":            optionalStringValue(item.Spec),
		"color":           optionalStringValue(item.Color),
		"default_unit_id": item.DefaultUnitID,
		"is_active":       item.IsActive,
		"created_at":      item.CreatedAt.Unix(),
		"updated_at":      item.UpdatedAt.Unix(),
	}
}

func materialsToAny(items []*biz.Material) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, materialToMap(item))
	}
	return out
}

func unitToMap(item *biz.Unit) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":         item.ID,
		"code":       item.Code,
		"name":       item.Name,
		"precision":  item.Precision,
		"is_active":  item.IsActive,
		"created_at": item.CreatedAt.Unix(),
		"updated_at": item.UpdatedAt.Unix(),
	}
}

func unitsToAny(items []*biz.Unit) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, unitToMap(item))
	}
	return out
}

func warehouseToMap(item *biz.Warehouse) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":         item.ID,
		"code":       item.Code,
		"name":       item.Name,
		"type":       item.Type,
		"is_active":  item.IsActive,
		"created_at": item.CreatedAt.Unix(),
		"updated_at": item.UpdatedAt.Unix(),
	}
}

func warehousesToAny(items []*biz.Warehouse) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, warehouseToMap(item))
	}
	return out
}

func processToMap(item *biz.Process) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":                  item.ID,
		"code":                item.Code,
		"name":                item.Name,
		"category":            optionalStringValue(item.Category),
		"outsourcing_enabled": item.OutsourcingEnabled,
		"inhouse_enabled":     item.InhouseEnabled,
		"quality_required":    item.QualityRequired,
		"sort_order":          item.SortOrder,
		"note":                optionalStringValue(item.Note),
		"is_active":           item.IsActive,
		"created_at":          item.CreatedAt.Unix(),
		"updated_at":          item.UpdatedAt.Unix(),
	}
}

func processesToAny(items []*biz.Process) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, processToMap(item))
	}
	return out
}

func productToMap(item *biz.Product) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":                item.ID,
		"code":              item.Code,
		"name":              item.Name,
		"style_no":          optionalStringValue(item.StyleNo),
		"customer_style_no": optionalStringValue(item.CustomerStyleNo),
		"default_unit_id":   item.DefaultUnitID,
		"is_active":         item.IsActive,
		"created_at":        item.CreatedAt.Unix(),
		"updated_at":        item.UpdatedAt.Unix(),
	}
}

func productsToAny(items []*biz.Product) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, productToMap(item))
	}
	return out
}

func productSKUToMap(item *biz.ProductSKU) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":                item.ID,
		"product_id":        item.ProductID,
		"sku_code":          item.SKUCode,
		"sku_name":          optionalStringValue(item.SKUName),
		"barcode":           optionalStringValue(item.Barcode),
		"customer_sku":      optionalStringValue(item.CustomerSKU),
		"color":             optionalStringValue(item.Color),
		"color_no":          optionalStringValue(item.ColorNo),
		"size":              optionalStringValue(item.Size),
		"packaging_version": optionalStringValue(item.PackagingVersion),
		"default_unit_id":   optionalIntValue(item.DefaultUnitID),
		"is_active":         item.IsActive,
		"created_at":        item.CreatedAt.Unix(),
		"updated_at":        item.UpdatedAt.Unix(),
	}
}

func productSKUsToAny(items []*biz.ProductSKU) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, productSKUToMap(item))
	}
	return out
}

func contactToMap(item *biz.Contact) map[string]any {
	if item == nil {
		return map[string]any{}
	}
	return map[string]any{
		"id":         item.ID,
		"owner_type": item.OwnerType,
		"owner_id":   item.OwnerID,
		"name":       item.Name,
		"phone":      optionalStringValue(item.Phone),
		"mobile":     optionalStringValue(item.Mobile),
		"email":      optionalStringValue(item.Email),
		"title":      optionalStringValue(item.Title),
		"is_primary": item.IsPrimary,
		"is_active":  item.IsActive,
		"note":       optionalStringValue(item.Note),
		"created_at": item.CreatedAt.Unix(),
		"updated_at": item.UpdatedAt.Unix(),
	}
}

func contactsToAny(items []*biz.Contact) []any {
	out := make([]any, 0, len(items))
	for _, item := range items {
		out = append(out, contactToMap(item))
	}
	return out
}
