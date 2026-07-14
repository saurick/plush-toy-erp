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
	case "save_customer_with_contacts",
		"create_customer",
		"update_customer",
		"get_customer",
		"list_customers",
		"set_customer_active":
		return d.handleMasterDataCustomer(ctx, method, id, pm)
	case "save_supplier_with_contacts",
		"create_supplier",
		"update_supplier",
		"get_supplier",
		"list_suppliers",
		"set_supplier_active":
		return d.handleMasterDataSupplier(ctx, method, id, pm)
	case "create_material",
		"update_material",
		"get_material",
		"list_materials",
		"set_material_active":
		return d.handleMasterDataMaterial(ctx, method, id, pm)
	case "create_process",
		"update_process",
		"get_process",
		"list_processes",
		"set_process_active":
		return d.handleMasterDataProcess(ctx, method, id, pm)
	case "create_product",
		"update_product",
		"get_product",
		"list_products",
		"set_product_active",
		"create_product_sku",
		"update_product_sku",
		"get_product_sku",
		"list_product_skus",
		"set_product_sku_active":
		return d.handleMasterDataProduct(ctx, method, id, pm)
	case "create_contact",
		"update_contact",
		"get_contact",
		"list_contacts_by_owner",
		"set_primary_contact",
		"disable_contact":
		return d.handleMasterDataContact(ctx, method, id, pm)
	case "list_units",
		"list_warehouses":
		return d.handleMasterDataReference(ctx, method, id, pm)
	default:
		return id, &v1.JsonrpcResult{
			Code:    errcode.UnknownMethod.Code,
			Message: fmt.Sprintf("未知 masterdata 接口 method=%s", method),
		}, nil
	}
}
