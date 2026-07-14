import { styleRpcResult, unsupportedRpcMethod } from './rpcMockResult.mjs'

export async function installMasterDataRpcMocks(page, context) {
  const { nowUnix } = context

  await page.route('**/rpc/masterdata', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body
    const customer = {
      id: 1,
      code: 'CUS-STYLE-L1',
      name: '暗色客户',
      short_name: '暗色',
      tax_no: 'TAX-STYLE-L1',
      note: '',
      is_active: true,
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const supplier = {
      id: 1,
      code: 'SUP-STYLE-L1',
      name: '样式供应商',
      short_name: '样式供',
      supplier_type: '加工厂',
      tax_no: '',
      note: '',
      is_active: true,
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const contact = {
      id: 1,
      owner_type: params.owner_type || 'CUSTOMER',
      owner_id: Number(params.owner_id || 1),
      name: '样式联系人',
      mobile: '13800138000',
      phone: '',
      email: '',
      title: '业务',
      is_primary: true,
      is_active: true,
      note: '',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const productSKU = {
      id: 1,
      product_id: 1,
      sku_code: 'SKU-STYLE-L1',
      sku_name: '样式产品 SKU',
      barcode: '690000000001',
      customer_sku: 'CUS-SKU-STYLE',
      color: '米白',
      color_no: 'C01',
      size: 'M',
      packaging_version: '基础包装',
      default_unit_id: 1,
      unit_net_weight_kg: '0.375',
      is_active: true,
      note: '',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const product = {
      id: 1,
      code: 'PROD-STYLE-L1',
      name: '样式产品',
      style_no: 'BEAR-STYLE',
      customer_style_no: 'CUS-BEAR-STYLE',
      default_unit_id: 1,
      unit_net_weight_kg: '0.425',
      is_active: true,
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const material = {
      id: 1,
      code: 'MAT-STYLE-L1',
      name: '样式材料',
      category: '面料',
      spec: '短毛绒 300g',
      color: '米白',
      default_unit_id: 1,
      is_active: true,
      note: '',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const process = {
      id: 1,
      code: 'PROC-STYLE-L1',
      name: '车缝',
      category: '委外车缝',
      outsourcing_enabled: true,
      inhouse_enabled: true,
      quality_required: true,
      sort_order: 10,
      is_active: true,
      note: '',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const processes = [
      {
        ...process,
        id: 11,
        code: 'PROC-CHECKING-L1',
        name: '查货',
        category: '查货',
        quality_required: true,
        sort_order: 10,
      },
      {
        ...process,
        id: 12,
        code: 'PROC-HANDWORK-L1',
        name: '手工',
        category: '手工',
        quality_required: false,
        sort_order: 20,
      },
      {
        ...process,
        id: 1,
        code: 'PROC-SEWING-L1',
        name: '车缝',
        category: '车缝',
        quality_required: false,
        sort_order: 30,
      },
      {
        ...process,
        id: 13,
        code: 'PROC-PACKAGING-L1',
        name: '包装',
        category: '包装',
        quality_required: false,
        sort_order: 40,
      },
    ]
    const unit = {
      id: 1,
      code: 'SIM-PLUSH-CORE-PCS',
      name: '核心演示单位-件',
      precision: 0,
      is_active: true,
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const warehouse = {
      id: 1,
      code: 'WH-STYLE-L1',
      name: '样式仓库',
      warehouse_type: 'RAW_MATERIAL',
      is_active: true,
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const materials = Array.from({ length: 6 }, (_, index) => ({
      ...material,
      id: index + 1,
      code: index === 0 ? material.code : `MAT-STYLE-L${index + 1}`,
      name: index === 0 ? material.name : `样式材料 ${index + 1}`,
      spec: index === 0 ? material.spec : `短毛绒 ${300 + index * 20}g`,
    }))

    let data = {}
    switch (method) {
      case 'list_customers':
        data = { customers: [customer], total: 1, limit: 100, offset: 0 }
        break
      case 'list_suppliers':
        data = { suppliers: [supplier], total: 1, limit: 100, offset: 0 }
        break
      case 'list_contacts_by_owner':
        data = { contacts: [contact], total: 1, limit: 100, offset: 0 }
        break
      case 'list_products':
        data = { products: [product], total: 1, limit: 100, offset: 0 }
        break
      case 'list_product_skus':
        data = { product_skus: [productSKU], total: 1, limit: 100, offset: 0 }
        break
      case 'list_processes':
        data = {
          processes,
          total: processes.length,
          limit: 100,
          offset: 0,
        }
        break
      case 'list_materials':
        data = {
          materials,
          total: materials.length,
          limit: 100,
          offset: 0,
        }
        break
      case 'list_units':
        data = { units: [unit], total: 1, limit: 100, offset: 0 }
        break
      case 'list_warehouses':
        data = {
          warehouses: [warehouse],
          total: 1,
          limit: 100,
          offset: 0,
        }
        break
      case 'create_customer':
      case 'update_customer':
      case 'set_customer_active':
      case 'get_customer':
        data = { customer: { ...customer, ...params } }
        break
      case 'create_supplier':
      case 'update_supplier':
      case 'set_supplier_active':
      case 'get_supplier':
        data = { supplier: { ...supplier, ...params } }
        break
      case 'create_contact':
      case 'update_contact':
      case 'set_primary_contact':
      case 'disable_contact':
        data = { contact: { ...contact, ...params } }
        break
      case 'create_product_sku':
      case 'update_product_sku':
      case 'set_product_sku_active':
      case 'get_product_sku':
        data = { product_sku: { ...productSKU, ...params } }
        break
      case 'create_material':
      case 'update_material':
      case 'set_material_active':
      case 'get_material':
        data = { material: { ...material, ...params } }
        break
      default:
        data = unsupportedRpcMethod('masterdata', method)
        break
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: styleRpcResult(data),
      }),
    })
  })
}
