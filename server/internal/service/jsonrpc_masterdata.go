package service

import (
	"context"
	"fmt"

	v1 "server/api/jsonrpc/v1"
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
	case "save_customer_with_contacts", "saveCustomerWithContacts",
		"create_customer", "createCustomer",
		"update_customer", "updateCustomer",
		"get_customer", "getCustomer",
		"list_customers", "listCustomers",
		"set_customer_active", "setCustomerActive":
		return d.handleMasterDataCustomer(ctx, method, id, pm)
	case "save_supplier_with_contacts", "saveSupplierWithContacts",
		"create_supplier", "createSupplier",
		"update_supplier", "updateSupplier",
		"get_supplier", "getSupplier",
		"list_suppliers", "listSuppliers",
		"set_supplier_active", "setSupplierActive":
		return d.handleMasterDataSupplier(ctx, method, id, pm)
	case "create_material", "createMaterial",
		"update_material", "updateMaterial",
		"get_material", "getMaterial",
		"list_materials", "listMaterials",
		"set_material_active", "setMaterialActive":
		return d.handleMasterDataMaterial(ctx, method, id, pm)
	case "create_process", "createProcess",
		"update_process", "updateProcess",
		"get_process", "getProcess",
		"list_processes", "listProcesses",
		"set_process_active", "setProcessActive":
		return d.handleMasterDataProcess(ctx, method, id, pm)
	case "create_product", "createProduct",
		"update_product", "updateProduct",
		"get_product", "getProduct",
		"list_products", "listProducts",
		"set_product_active", "setProductActive",
		"create_product_sku", "createProductSKU",
		"update_product_sku", "updateProductSKU",
		"get_product_sku", "getProductSKU",
		"list_product_skus", "listProductSKUs",
		"set_product_sku_active", "setProductSKUActive":
		return d.handleMasterDataProduct(ctx, method, id, pm)
	case "create_contact", "createContact",
		"update_contact", "updateContact",
		"get_contact", "getContact",
		"list_contacts_by_owner", "listContactsByOwner",
		"set_primary_contact", "setPrimaryContact",
		"disable_contact", "disableContact":
		return d.handleMasterDataContact(ctx, method, id, pm)
	case "list_units", "listUnits",
		"list_warehouses", "listWarehouses":
		return d.handleMasterDataReference(ctx, method, id, pm)
	default:
		return id, &v1.JsonrpcResult{
			Code:    errcode.UnknownMethod.Code,
			Message: fmt.Sprintf("未知 masterdata 接口 method=%s", method),
		}, nil
	}
}
