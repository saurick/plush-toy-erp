package service

import (
	"context"
	"errors"
	"io"
	"testing"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
)

func TestJsonrpcDispatcher_BusinessDashboardStatsReadsDomainProjection(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", biz.DefaultCustomerKey)
	workflowRepo := &businessDashboardWorkflowRepo{}
	operationalFactRepo := &businessDashboardOperationalFactRepo{}
	j := newCompleteBusinessDashboardDispatcher(
		workflowJSONRPCAdmin(
			[]string{biz.WarehouseRoleKey},
			biz.PermissionERPDashboardRead,
			biz.PermissionWorkflowTaskRead,
		),
		&businessDashboardMasterDataRepo{},
		workflowRepo,
		operationalFactRepo,
		businessDashboardCustomerConfigUC(),
	)

	_, res, err := j.handleBusiness(workflowJSONRPCAdminContext(), "dashboard_stats", "1", nil)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("expected OK, got %#v", res)
	}

	modules := businessDashboardResponseModules(t, res)
	if len(modules) != len(businessDashboardProjectionModuleKeys) {
		t.Fatalf("expected %d modules, got %d", len(businessDashboardProjectionModuleKeys), len(modules))
	}
	for index, moduleKey := range businessDashboardProjectionModuleKeys {
		module := modules[index]
		if len(module) != 3 {
			t.Fatalf("expected module contract {module_key,available,total}, got %#v", module)
		}
		if actualModuleKey := testStringValue(module["module_key"]); actualModuleKey != moduleKey {
			t.Fatalf("module[%d] key=%q, want %q", index, actualModuleKey, moduleKey)
		}
		if available, ok := module["available"].(bool); !ok || !available {
			t.Fatalf("expected %s available=true, got %#v", moduleKey, module["available"])
		}
		if actualTotal := testNumberValue(module["total"]); actualTotal != float64(index+1) {
			t.Fatalf("expected %s total %d, got %.0f", moduleKey, index+1, actualTotal)
		}
		if _, exists := module["status_counts"]; exists {
			t.Fatalf("status_counts leaked into %s module contract", moduleKey)
		}
	}

	if len(workflowRepo.filters) != 3 {
		t.Fatalf("expected three workflow module queries, got %#v", workflowRepo.filters)
	}
	for _, filter := range workflowRepo.filters {
		if filter.Limit != 1 {
			t.Fatalf("workflow filter limit=%d, want 1", filter.Limit)
		}
		assertWorkflowRevisionScope(t, filter.TaskGroup, filter.VisibilityScope)
	}
	if got, want := operationalFactRepo.financeFactTypes, []string{
		biz.FinanceFactReconciliation,
		biz.FinanceFactPayable,
		biz.FinanceFactReceivable,
		biz.FinanceFactInvoice,
	}; len(got) != len(want) {
		t.Fatalf("finance fact filters=%#v, want %#v", got, want)
	} else {
		for index := range want {
			if got[index] != want[index] {
				t.Fatalf("finance fact filters=%#v, want %#v", got, want)
			}
		}
	}
}

func TestJsonrpcDispatcher_BusinessDashboardWorkflowModulesUnavailableWithoutReadPermission(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", biz.DefaultCustomerKey)
	workflowRepo := &businessDashboardWorkflowRepo{}
	j := newCompleteBusinessDashboardDispatcher(
		workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey}, biz.PermissionERPDashboardRead),
		&businessDashboardMasterDataRepo{},
		workflowRepo,
		&businessDashboardOperationalFactRepo{},
		businessDashboardCustomerConfigUC(),
	)

	_, res, err := j.handleBusiness(workflowJSONRPCAdminContext(), "dashboard_stats", "no-workflow-read", nil)
	if err != nil || res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("result=%#v err=%v", res, err)
	}
	modules := businessDashboardModulesByKey(t, res)
	workflowModules := map[string]struct{}{
		"shipping-release":      {},
		"production-scheduling": {},
		"production-exceptions": {},
	}
	for _, moduleKey := range businessDashboardProjectionModuleKeys {
		module := modules[moduleKey]
		_, workflowModule := workflowModules[moduleKey]
		if available, _ := module["available"].(bool); available == workflowModule {
			t.Fatalf("module %s available=%v, workflowModule=%v", moduleKey, available, workflowModule)
		}
		if workflowModule && testNumberValue(module["total"]) != 0 {
			t.Fatalf("unavailable workflow module %s total=%v", moduleKey, module["total"])
		}
	}
	if len(workflowRepo.filters) != 0 {
		t.Fatalf("workflow repository called without workflow.task.read: %#v", workflowRepo.filters)
	}
}

func TestJsonrpcDispatcher_BusinessDashboardSuperAdminCanReadScopedWorkflowModules(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", biz.DefaultCustomerKey)
	admin := workflowJSONRPCAdmin(nil)
	admin.IsSuperAdmin = true
	workflowRepo := &businessDashboardWorkflowRepo{}
	j := &jsonrpcDispatcher{
		log:         businessDashboardTestLogger(),
		adminReader: stubAdminAccountReader{admin: admin},
		workflowUC:  biz.NewWorkflowUsecase(workflowRepo),
	}

	_, res, err := j.handleBusiness(workflowJSONRPCAdminContext(), "dashboard_stats", "super-admin", nil)
	if err != nil || res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("result=%#v err=%v", res, err)
	}
	modules := businessDashboardModulesByKey(t, res)
	for moduleKey, wantTotal := range map[string]float64{
		"shipping-release":      10,
		"production-scheduling": 13,
		"production-exceptions": 15,
	} {
		module := modules[moduleKey]
		if available, _ := module["available"].(bool); !available || testNumberValue(module["total"]) != wantTotal {
			t.Fatalf("super-admin workflow module %s=%#v", moduleKey, module)
		}
	}
	if len(workflowRepo.filters) != 3 {
		t.Fatalf("super-admin workflow filters=%#v", workflowRepo.filters)
	}
	for _, filter := range workflowRepo.filters {
		scope := biz.NormalizeWorkflowTaskVisibilityScope(filter.VisibilityScope)
		if scope == nil || !scope.StandaloneAllowAllOwnerRoles || scope.VisibleAssigneeID != nil {
			t.Fatalf("super-admin workflow scope=%#v", scope)
		}
	}
}

func TestJsonrpcDispatcher_BusinessDashboardBossReadsGlobalWorkflowAggregateOnly(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", "yoyoosun")
	admin := workflowJSONRPCAdmin(
		[]string{biz.BossRoleKey},
		biz.PermissionERPDashboardRead,
		biz.PermissionWorkflowTaskRead,
	)
	workflowRepo := &businessDashboardWorkflowRepo{}
	j := newCompleteBusinessDashboardDispatcher(
		admin,
		&businessDashboardMasterDataRepo{},
		workflowRepo,
		&businessDashboardOperationalFactRepo{},
		businessDashboardCustomerConfigUC("yoyoosun"),
	)

	ordinaryScope, err := j.workflowTaskQueryVisibilityScope(
		workflowJSONRPCAdminContext(),
		admin,
		biz.PermissionWorkflowTaskRead,
	)
	if err != nil {
		t.Fatalf("ordinary task scope error=%v", err)
	}
	ordinaryScope = biz.NormalizeWorkflowTaskVisibilityScope(ordinaryScope)
	if ordinaryScope == nil || ordinaryScope.StandaloneAllowAllOwnerRoles ||
		ordinaryScope.VisibleAssigneeID == nil {
		t.Fatalf("ordinary boss task access must remain role/assignee scoped: %#v", ordinaryScope)
	}

	_, res, err := j.handleBusiness(
		workflowJSONRPCAdminContext(),
		"dashboard_stats",
		"boss-global-workflow-aggregate",
		nil,
	)
	if err != nil || res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("result=%#v err=%v", res, err)
	}
	modules := businessDashboardModulesByKey(t, res)
	for moduleKey, wantTotal := range map[string]float64{
		"shipping-release":      10,
		"production-scheduling": 13,
		"production-exceptions": 15,
	} {
		module := modules[moduleKey]
		if available, _ := module["available"].(bool); !available ||
			testNumberValue(module["total"]) != wantTotal {
			t.Fatalf("boss aggregate %s=%#v", moduleKey, module)
		}
	}
	if len(workflowRepo.filters) != 3 {
		t.Fatalf("boss aggregate filters=%#v", workflowRepo.filters)
	}
	for _, filter := range workflowRepo.filters {
		scope := biz.NormalizeWorkflowTaskVisibilityScope(filter.VisibilityScope)
		if scope == nil || !scope.StandaloneAllowAllOwnerRoles ||
			scope.VisibleAssigneeID != nil {
			t.Fatalf("boss aggregate workflow scope=%#v", scope)
		}
	}
}

func TestJsonrpcDispatcher_BusinessDashboardSuccessfulZeroIsAvailableAndMissingUsecaseIsUnavailable(t *testing.T) {
	j := &jsonrpcDispatcher{
		log:          businessDashboardTestLogger(),
		adminReader:  stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.BossRoleKey}, biz.PermissionERPDashboardRead)},
		masterDataUC: biz.NewMasterDataUsecase(&businessDashboardMasterDataRepo{zeroTotals: true}),
	}

	_, res, err := j.handleBusiness(workflowJSONRPCAdminContext(), "dashboard_stats", "zero-and-missing", nil)
	if err != nil || res == nil || res.Code != errcode.OK.Code {
		t.Fatalf("result=%#v err=%v", res, err)
	}
	modules := businessDashboardModulesByKey(t, res)
	for _, moduleKey := range []string{"customers", "suppliers", "products"} {
		module := modules[moduleKey]
		if available, _ := module["available"].(bool); !available || testNumberValue(module["total"]) != 0 {
			t.Fatalf("successful zero module %s=%#v", moduleKey, module)
		}
	}
	for _, moduleKey := range businessDashboardProjectionModuleKeys[3:] {
		module := modules[moduleKey]
		if available, _ := module["available"].(bool); available || testNumberValue(module["total"]) != 0 {
			t.Fatalf("missing usecase module %s=%#v", moduleKey, module)
		}
	}
}

func TestJsonrpcDispatcher_BusinessDashboardQueryErrorFailsClosed(t *testing.T) {
	j := &jsonrpcDispatcher{
		log:         businessDashboardTestLogger(),
		adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.BossRoleKey}, biz.PermissionERPDashboardRead)},
		masterDataUC: biz.NewMasterDataUsecase(&businessDashboardMasterDataRepo{
			listProductsErr: errors.New("products unavailable"),
		}),
	}

	_, res, err := j.handleBusiness(workflowJSONRPCAdminContext(), "dashboard_stats", "query-error", nil)
	if err != nil {
		t.Fatalf("expected transport err nil, got %v", err)
	}
	if res == nil || res.Code != errcode.Internal.Code {
		t.Fatalf("expected internal fail-closed result, got %#v", res)
	}
}

func businessDashboardResponseModules(t *testing.T, res *v1.JsonrpcResult) []map[string]any {
	t.Helper()
	if res == nil || res.Data == nil {
		t.Fatalf("missing dashboard response data: %#v", res)
	}
	rawModules, ok := res.Data.AsMap()["modules"].([]any)
	if !ok {
		t.Fatalf("expected modules array, got %#v", res.Data.AsMap()["modules"])
	}
	modules := make([]map[string]any, 0, len(rawModules))
	for _, item := range rawModules {
		module, ok := item.(map[string]any)
		if !ok {
			t.Fatalf("expected module map, got %#v", item)
		}
		modules = append(modules, module)
	}
	return modules
}

func businessDashboardModulesByKey(t *testing.T, res *v1.JsonrpcResult) map[string]map[string]any {
	t.Helper()
	modulesByKey := make(map[string]map[string]any, len(businessDashboardProjectionModuleKeys))
	for _, module := range businessDashboardResponseModules(t, res) {
		modulesByKey[testStringValue(module["module_key"])] = module
	}
	return modulesByKey
}

func testStringValue(value any) string {
	text, _ := value.(string)
	return text
}

func testNumberValue(value any) float64 {
	switch item := value.(type) {
	case float64:
		return item
	case int:
		return float64(item)
	default:
		return 0
	}
}

func TestJsonrpcDispatcher_BusinessRecordMethodsAreRetired(t *testing.T) {
	j := &jsonrpcDispatcher{
		log:         log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.business.test")),
		adminReader: stubAdminAccountReader{admin: workflowJSONRPCAdmin([]string{biz.PurchaseRoleKey})},
	}

	_, res, err := j.handleBusiness(workflowJSONRPCAdminContext(), "list_records", "1", nil)
	if err != nil {
		t.Fatalf("expected nil err, got %v", err)
	}
	if res == nil || res.Code != errcode.UnknownMethod.Code {
		t.Fatalf("expected retired method to be unknown, got %#v", res)
	}
}

func businessDashboardTestLogger() *log.Helper {
	return log.NewHelper(log.With(log.NewStdLogger(io.Discard), "module", "service.jsonrpc.business.test"))
}

func newCompleteBusinessDashboardDispatcher(
	admin *biz.AdminUser,
	masterDataRepo *businessDashboardMasterDataRepo,
	workflowRepo *businessDashboardWorkflowRepo,
	operationalFactRepo *businessDashboardOperationalFactRepo,
	customerConfigUC *biz.CustomerConfigUsecase,
) *jsonrpcDispatcher {
	return &jsonrpcDispatcher{
		log:                businessDashboardTestLogger(),
		adminReader:        stubAdminAccountReader{admin: admin},
		workflowUC:         biz.NewWorkflowUsecase(workflowRepo),
		masterDataUC:       biz.NewMasterDataUsecase(masterDataRepo),
		salesOrderUC:       biz.NewSalesOrderUsecase(&businessDashboardSalesOrderRepo{}),
		purchaseOrderUC:    biz.NewPurchaseOrderUsecase(&businessDashboardPurchaseOrderRepo{}),
		productionOrderUC:  biz.NewProductionOrderUsecase(&businessDashboardProductionOrderRepo{}),
		outsourcingOrderUC: biz.NewOutsourcingOrderUsecase(&businessDashboardOutsourcingOrderRepo{}),
		inventoryUC:        biz.NewInventoryUsecase(&businessDashboardInventoryRepo{}),
		operationalFactUC:  biz.NewOperationalFactUsecase(operationalFactRepo),
		customerConfigUC:   customerConfigUC,
	}
}

func businessDashboardCustomerConfigUC(customerKeys ...string) *biz.CustomerConfigUsecase {
	customerKey := biz.DefaultCustomerKey
	if len(customerKeys) > 0 && customerKeys[0] != "" {
		customerKey = customerKeys[0]
	}
	repo := newServiceCustomerConfigRepo()
	for _, item := range []struct {
		revision    string
		status      string
		permissions []string
	}{
		{
			revision:    "rev-a",
			status:      biz.CustomerConfigStatusSuperseded,
			permissions: []string{biz.PermissionWorkflowTaskRead},
		},
		{
			revision:    "rev-b",
			status:      biz.CustomerConfigStatusActive,
			permissions: []string{biz.PermissionERPDashboardRead},
		},
	} {
		key := serviceCustomerConfigKey(customerKey, item.revision)
		repo.revisions[key] = &biz.CustomerConfigRevision{
			CustomerKey: customerKey,
			Revision:    item.revision,
			Status:      item.status,
		}
		repo.profiles[key] = []biz.RoleProfileInput{{RoleKey: biz.WarehouseRoleKey, DisplayName: "仓库"}}
		repo.memberships[key] = []biz.WorkPoolMembershipInput{{PoolKey: "warehouse", RoleKey: biz.WarehouseRoleKey, Enabled: true}}
		for _, permissionKey := range item.permissions {
			repo.entitlements[key] = append(repo.entitlements[key], biz.AccessEntitlementInput{
				RoleKey:       biz.WarehouseRoleKey,
				CapabilityKey: permissionKey,
				ScopeType:     "customer",
				ScopeValue:    customerKey,
				Enabled:       true,
			})
		}
	}
	if customerKey == "yoyoosun" {
		for _, revision := range []string{"rev-a", "rev-b"} {
			key := serviceCustomerConfigKey(customerKey, revision)
			repo.profiles[key] = append(repo.profiles[key], biz.RoleProfileInput{
				RoleKey:     biz.BossRoleKey,
				DisplayName: "老板 / 管理层",
			})
			repo.memberships[key] = append(repo.memberships[key], biz.WorkPoolMembershipInput{
				PoolKey: "boss",
				RoleKey: biz.BossRoleKey,
				Enabled: true,
			})
		}
		activeKey := serviceCustomerConfigKey(customerKey, "rev-b")
		for _, permissionKey := range []string{
			biz.PermissionERPDashboardRead,
			biz.PermissionWorkflowTaskRead,
		} {
			repo.entitlements[activeKey] = append(
				repo.entitlements[activeKey],
				biz.AccessEntitlementInput{
					RoleKey:       biz.BossRoleKey,
					CapabilityKey: permissionKey,
					ScopeType:     "customer",
					ScopeValue:    customerKey,
					Enabled:       true,
				},
			)
		}
	}
	return biz.NewCustomerConfigUsecase(repo)
}

type businessDashboardMasterDataRepo struct {
	biz.MasterDataRepo
	zeroTotals      bool
	listProductsErr error
}

func (r *businessDashboardMasterDataRepo) ListCustomers(context.Context, biz.MasterDataFilter) ([]*biz.Customer, int, error) {
	if r.zeroTotals {
		return nil, 0, nil
	}
	return nil, 1, nil
}

func (r *businessDashboardMasterDataRepo) ListSuppliers(context.Context, biz.MasterDataFilter) ([]*biz.Supplier, int, error) {
	if r.zeroTotals {
		return nil, 0, nil
	}
	return nil, 2, nil
}

func (r *businessDashboardMasterDataRepo) ListProducts(context.Context, biz.MasterDataFilter) ([]*biz.Product, int, error) {
	if r.listProductsErr != nil {
		return nil, 0, r.listProductsErr
	}
	if r.zeroTotals {
		return nil, 0, nil
	}
	return nil, 3, nil
}

type businessDashboardSalesOrderRepo struct {
	biz.SalesOrderRepo
}

func (*businessDashboardSalesOrderRepo) ListSalesOrders(context.Context, biz.SalesOrderFilter) ([]*biz.SalesOrder, int, error) {
	return nil, 4, nil
}

type businessDashboardInventoryRepo struct {
	biz.InventoryRepo
}

func (*businessDashboardInventoryRepo) ListBOMHeaders(context.Context, biz.BOMHeaderFilter) ([]*biz.BOMHeader, int, error) {
	return nil, 5, nil
}

func (*businessDashboardInventoryRepo) ListPurchaseReceipts(context.Context, biz.PurchaseReceiptFilter) ([]*biz.PurchaseReceipt, int, error) {
	return nil, 8, nil
}

func (*businessDashboardInventoryRepo) ListInventoryBalances(context.Context, biz.InventoryBalanceFilter) ([]*biz.InventoryBalance, int, error) {
	return nil, 9, nil
}

func (*businessDashboardInventoryRepo) ListQualityInspections(context.Context, biz.QualityInspectionFilter) ([]*biz.QualityInspection, int, error) {
	return nil, 16, nil
}

type businessDashboardPurchaseOrderRepo struct {
	biz.PurchaseOrderRepo
}

func (*businessDashboardPurchaseOrderRepo) ListPurchaseOrders(context.Context, biz.PurchaseOrderFilter) ([]*biz.PurchaseOrder, int, error) {
	return nil, 6, nil
}

type businessDashboardOutsourcingOrderRepo struct {
	biz.OutsourcingOrderRepo
}

func (*businessDashboardOutsourcingOrderRepo) ListOutsourcingOrders(context.Context, biz.OutsourcingOrderFilter) ([]*biz.OutsourcingOrder, int, error) {
	return nil, 7, nil
}

type businessDashboardProductionOrderRepo struct {
	biz.ProductionOrderRepo
}

func (*businessDashboardProductionOrderRepo) ListProductionOrders(context.Context, biz.ProductionOrderFilter) ([]*biz.ProductionOrder, int, error) {
	return nil, 12, nil
}

type businessDashboardOperationalFactRepo struct {
	biz.OperationalFactRepo
	financeFactTypes []string
}

func (*businessDashboardOperationalFactRepo) ListShipments(context.Context, biz.OperationalFactFilter) ([]*biz.Shipment, int, error) {
	return nil, 11, nil
}

func (*businessDashboardOperationalFactRepo) ListProductionFacts(context.Context, biz.OperationalFactFilter) ([]*biz.ProductionFact, int, error) {
	return nil, 14, nil
}

func (r *businessDashboardOperationalFactRepo) ListFinanceFacts(_ context.Context, filter biz.OperationalFactFilter) ([]*biz.FinanceFact, int, error) {
	r.financeFactTypes = append(r.financeFactTypes, filter.FactType)
	totals := map[string]int{
		biz.FinanceFactReconciliation: 17,
		biz.FinanceFactPayable:        18,
		biz.FinanceFactReceivable:     19,
		biz.FinanceFactInvoice:        20,
	}
	return nil, totals[filter.FactType], nil
}

type businessDashboardWorkflowRepo struct {
	biz.WorkflowRepo
	filters []biz.WorkflowTaskFilter
}

func (r *businessDashboardWorkflowRepo) ListWorkflowTasks(_ context.Context, filter biz.WorkflowTaskFilter) ([]*biz.WorkflowTask, int, error) {
	r.filters = append(r.filters, filter)
	totals := map[string]int{
		"shipment_release":      10,
		"production_scheduling": 13,
		"production_exception":  15,
	}
	return nil, totals[filter.TaskGroup], nil
}

type stubBusinessDashboardOperationalFactRepo struct{}

func (s *stubBusinessDashboardOperationalFactRepo) CustomerIsActive(context.Context, int) (bool, error) {
	return false, biz.ErrCustomerNotFound
}

func (s *stubBusinessDashboardOperationalFactRepo) MaterialIsActive(context.Context, int) (bool, error) {
	return false, biz.ErrMaterialNotFound
}

func (s *stubBusinessDashboardOperationalFactRepo) ProductIsActive(context.Context, int) (bool, error) {
	return false, biz.ErrProductNotFound
}

func (s *stubBusinessDashboardOperationalFactRepo) ProductSKUIsActive(context.Context, int) (bool, error) {
	return false, biz.ErrProductSKUNotFound
}

func (s *stubBusinessDashboardOperationalFactRepo) SupplierIsActive(context.Context, int) (bool, error) {
	return false, biz.ErrSupplierNotFound
}

func (s *stubBusinessDashboardOperationalFactRepo) UnitIsActive(context.Context, int) (bool, error) {
	return false, biz.ErrUnitNotFound
}

func (s *stubBusinessDashboardOperationalFactRepo) WarehouseIsActive(context.Context, int) (bool, error) {
	return false, biz.ErrWarehouseNotFound
}

func (s *stubBusinessDashboardOperationalFactRepo) CreateProductionFactDraft(context.Context, *biz.OperationalFactMutation) (*biz.ProductionFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) PostProductionFact(context.Context, int) (*biz.ProductionFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) CancelPostedProductionFact(context.Context, int) (*biz.ProductionFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) ListProductionFacts(context.Context, biz.OperationalFactFilter) ([]*biz.ProductionFact, int, error) {
	return nil, 4, nil
}

func (s *stubBusinessDashboardOperationalFactRepo) CreateOutsourcingFactDraft(context.Context, *biz.OperationalFactMutation) (*biz.OutsourcingFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) PostOutsourcingFact(context.Context, int) (*biz.OutsourcingFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) CancelPostedOutsourcingFact(context.Context, int) (*biz.OutsourcingFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) ListOutsourcingFacts(context.Context, biz.OperationalFactFilter) ([]*biz.OutsourcingFact, int, error) {
	return nil, 2, nil
}

func (s *stubBusinessDashboardOperationalFactRepo) CreateShipmentDraftWithItems(context.Context, *biz.ShipmentCreateWithItems) (*biz.Shipment, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) ShipShipment(context.Context, int) (*biz.Shipment, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) ShipShipmentWithActor(ctx context.Context, id int, _ int) (*biz.Shipment, error) {
	return s.ShipShipment(ctx, id)
}

func (s *stubBusinessDashboardOperationalFactRepo) CancelShippedShipment(context.Context, int) (*biz.Shipment, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) CancelShippedShipmentWithActor(ctx context.Context, id int, _ int) (*biz.Shipment, error) {
	return s.CancelShippedShipment(ctx, id)
}

func (s *stubBusinessDashboardOperationalFactRepo) GetShipment(context.Context, int) (*biz.Shipment, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) ListShipments(context.Context, biz.OperationalFactFilter) ([]*biz.Shipment, int, error) {
	return nil, 3, nil
}

func (s *stubBusinessDashboardOperationalFactRepo) CreateStockReservation(context.Context, *biz.StockReservationCreate) (*biz.StockReservation, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) CreateStockReservationFromSalesOrder(context.Context, *biz.StockReservationFromSalesOrderCreate) (*biz.StockReservation, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) ReleaseStockReservation(context.Context, int) (*biz.StockReservation, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) ListStockReservations(context.Context, biz.OperationalFactFilter) ([]*biz.StockReservation, int, error) {
	return nil, 5, nil
}

func (s *stubBusinessDashboardOperationalFactRepo) CreateFinanceFactDraft(context.Context, *biz.FinanceFactCreate) (*biz.FinanceFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) PostFinanceFact(context.Context, int) (*biz.FinanceFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) SettleFinanceFact(context.Context, int) (*biz.FinanceFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) CancelPostedFinanceFact(context.Context, int, int, string) (*biz.FinanceFact, error) {
	return nil, biz.ErrBadParam
}

func (s *stubBusinessDashboardOperationalFactRepo) ListFinanceFacts(context.Context, biz.OperationalFactFilter) ([]*biz.FinanceFact, int, error) {
	return nil, 6, nil
}
