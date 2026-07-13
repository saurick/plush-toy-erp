import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

test('production order API runtime keeps canonical provider and error-code contracts', () => {
  const handler = read('server/internal/service/jsonrpc_production_order.go')
  const dispatcher = read('server/internal/service/jsonrpc_dispatch.go')
  const dataProviders = read('server/internal/data/data.go')
  const bizProviders = read('server/internal/biz/biz.go')
  const wire = read('server/cmd/server/wire_gen.go')
  const catalog = read('server/internal/errcode/catalog.go')
  const generated = read('web/src/common/consts/errorCodes.generated.js')

  for (const method of [
    'create_production_order',
    'save_production_order',
    'release_production_order',
    'close_production_order',
    'cancel_production_order',
    'get_production_order',
    'list_production_orders',
    'list_production_order_reference_options',
  ]) {
    assert(handler.includes(`case "${method}"`), `missing canonical method ${method}`)
  }
  for (const forbidden of [
    'createProductionOrder',
    'saveProductionOrder',
    'releaseProductionOrder',
    'closeProductionOrder',
    'cancelProductionOrder',
    'getProductionOrder',
    'listProductionOrders',
    'listProductionOrderReferenceOptions',
  ]) {
    assert(!handler.includes(`case "${forbidden}"`), `legacy alias must stay rejected: ${forbidden}`)
  }

  assert.match(dispatcher, /case "production_order":\s*return d\.handleProductionOrder/u)
  assert.match(dataProviders, /NewProductionOrderRepo,[\s\S]*wire\.Bind\(new\(biz\.ProductionOrderRepo\)/u)
  assert.match(bizProviders, /NewProductionOrderUsecase/u)
  assert.match(wire, /productionOrderRepo := data\.NewProductionOrderRepo/u)
  assert.match(wire, /productionOrderUsecase := biz\.NewProductionOrderUsecase/u)
  assert.match(wire, /service\.NewJsonrpcService\([\s\S]*productionOrderUsecase/u)
  assert.match(catalog, /ResourceVersionConflict\s*= Definition\{Name: "ResourceVersionConflict", Code: 40922/u)
  assert.match(generated, /RESOURCE_VERSION_CONFLICT:\s*40922/u)
})
