// server/internal/service/jsonrpc_dispatch.go
package service

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/conf"
	"server/internal/customertrialconfig"
	"server/internal/devdbguard"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
	"google.golang.org/protobuf/types/known/structpb"
)

// jsonrpcDispatcher 负责 JSON-RPC URL/method 分发、鉴权和错误映射；真实业务动作仍由 biz usecase 承接。
type jsonrpcDispatcher struct {
	log *log.Helper

	adminAuthUC            *biz.AdminAuthUsecase
	adminManageUC          *biz.AdminManageUsecase
	workflowUC             *biz.WorkflowUsecase
	processRuntimeUC       *biz.ProcessRuntimeUsecase
	debugUC                *biz.DebugUsecase
	masterDataUC           *biz.MasterDataUsecase
	salesOrderUC           *biz.SalesOrderUsecase
	purchaseOrderUC        *biz.PurchaseOrderUsecase
	productionOrderUC      *biz.ProductionOrderUsecase
	outsourcingOrderUC     *biz.OutsourcingOrderUsecase
	inventoryUC            *biz.InventoryUsecase
	operationalFactUC      *biz.OperationalFactUsecase
	attachmentUC           *biz.BusinessAttachmentUsecase
	customerConfigUC       *biz.CustomerConfigUsecase
	authSMS                authSMSRuntimeConfig
	trialConfigEnabled     bool
	localTestConfigEnabled bool

	adminReader biz.AdminAccountReader
}

func newJSONRPCDispatcher(
	c *conf.Data,
	logger log.Logger,
	adminAuthUC *biz.AdminAuthUsecase,
	adminManageUC *biz.AdminManageUsecase,
	workflowUC *biz.WorkflowUsecase,
	processRuntimeUC *biz.ProcessRuntimeUsecase,
	debugUC *biz.DebugUsecase,
	masterDataUC *biz.MasterDataUsecase,
	salesOrderUC *biz.SalesOrderUsecase,
	purchaseOrderUC *biz.PurchaseOrderUsecase,
	productionOrderUC *biz.ProductionOrderUsecase,
	outsourcingOrderUC *biz.OutsourcingOrderUsecase,
	inventoryUC *biz.InventoryUsecase,
	operationalFactUC *biz.OperationalFactUsecase,
	attachmentUC *biz.BusinessAttachmentUsecase,
	customerConfigUC *biz.CustomerConfigUsecase,
	adminReader biz.AdminAccountReader,
) *jsonrpcDispatcher {
	helper := log.NewHelper(log.With(logger, "module", "service.jsonrpc"))

	if adminAuthUC == nil {
		panic("newJSONRPCDispatcher: adminAuthUC is nil")
	}
	if adminManageUC == nil {
		panic("newJSONRPCDispatcher: adminManageUC is nil")
	}
	if workflowUC == nil {
		panic("newJSONRPCDispatcher: workflowUC is nil")
	}
	if processRuntimeUC == nil {
		panic("newJSONRPCDispatcher: processRuntimeUC is nil")
	}
	if debugUC == nil {
		panic("newJSONRPCDispatcher: debugUC is nil")
	}
	if masterDataUC == nil {
		panic("newJSONRPCDispatcher: masterDataUC is nil")
	}
	if salesOrderUC == nil {
		panic("newJSONRPCDispatcher: salesOrderUC is nil")
	}
	if purchaseOrderUC == nil {
		panic("newJSONRPCDispatcher: purchaseOrderUC is nil")
	}
	if productionOrderUC == nil {
		panic("newJSONRPCDispatcher: productionOrderUC is nil")
	}
	if outsourcingOrderUC == nil {
		panic("newJSONRPCDispatcher: outsourcingOrderUC is nil")
	}
	if inventoryUC == nil {
		panic("newJSONRPCDispatcher: inventoryUC is nil")
	}
	if operationalFactUC == nil {
		panic("newJSONRPCDispatcher: operationalFactUC is nil")
	}
	if attachmentUC == nil {
		panic("newJSONRPCDispatcher: attachmentUC is nil")
	}
	if customerConfigUC == nil {
		panic("newJSONRPCDispatcher: customerConfigUC is nil")
	}
	if adminReader == nil {
		panic("newJSONRPCDispatcher: adminReader is nil")
	}
	if err := biz.RegisterSalesOrderProcessDomainCommandHandlers(processRuntimeUC, salesOrderUC); err != nil {
		panic(fmt.Sprintf("newJSONRPCDispatcher: register sales order process command handlers: %v", err))
	}
	if err := biz.RegisterPurchaseOrderProcessDomainCommandHandlers(processRuntimeUC, purchaseOrderUC); err != nil {
		panic(fmt.Sprintf("newJSONRPCDispatcher: register purchase order process command handlers: %v", err))
	}
	if err := biz.RegisterPurchaseReceiptProcessDomainCommandHandlers(processRuntimeUC, inventoryUC); err != nil {
		panic(fmt.Sprintf("newJSONRPCDispatcher: register purchase receipt process command handlers: %v", err))
	}
	if err := biz.RegisterQualityInspectionProcessDomainCommandHandlers(processRuntimeUC, inventoryUC); err != nil {
		panic(fmt.Sprintf("newJSONRPCDispatcher: register quality inspection process command handlers: %v", err))
	}
	if err := biz.RegisterInventoryProcessDomainCommandHandlers(processRuntimeUC, inventoryUC); err != nil {
		panic(fmt.Sprintf("newJSONRPCDispatcher: register inventory process command handlers: %v", err))
	}
	if err := biz.RegisterShipmentProcessDomainCommandHandlers(processRuntimeUC, operationalFactUC); err != nil {
		panic(fmt.Sprintf("newJSONRPCDispatcher: register shipment process command handlers: %v", err))
	}
	if err := biz.RegisterFinanceProcessDomainCommandHandlers(processRuntimeUC, operationalFactUC); err != nil {
		panic(fmt.Sprintf("newJSONRPCDispatcher: register finance process command handlers: %v", err))
	}
	trialDSN := ""
	if c != nil && c.Postgres != nil {
		trialDSN = c.Postgres.Dsn
	}
	trialConfigEnabled, err := customertrialconfig.ResolveGate(trialDSN, os.Getenv)
	if err != nil {
		panic(fmt.Sprintf("newJSONRPCDispatcher: customer trial config gate: %v", err))
	}
	localTestConfigEnabled, err := resolveCustomerConfigLocalTestGate(c, os.Getenv)
	if err != nil {
		panic(fmt.Sprintf("newJSONRPCDispatcher: customer config local-test gate: %v", err))
	}
	authSMS := newAuthSMSRuntimeConfig(c)

	helper.Info("jsonrpcDispatcher created")

	return &jsonrpcDispatcher{
		log:                    helper,
		adminAuthUC:            adminAuthUC,
		adminManageUC:          adminManageUC,
		workflowUC:             workflowUC,
		processRuntimeUC:       processRuntimeUC,
		debugUC:                debugUC,
		masterDataUC:           masterDataUC,
		salesOrderUC:           salesOrderUC,
		purchaseOrderUC:        purchaseOrderUC,
		productionOrderUC:      productionOrderUC,
		outsourcingOrderUC:     outsourcingOrderUC,
		inventoryUC:            inventoryUC,
		operationalFactUC:      operationalFactUC,
		attachmentUC:           attachmentUC,
		customerConfigUC:       customerConfigUC,
		authSMS:                authSMS,
		trialConfigEnabled:     trialConfigEnabled,
		localTestConfigEnabled: localTestConfigEnabled,
		adminReader:            adminReader,
	}
}

func resolveCustomerConfigLocalTestGate(c *conf.Data, getenv func(string) string) (bool, error) {
	if getenv == nil {
		getenv = func(string) string { return "" }
	}
	if strings.TrimSpace(getenv(biz.CustomerConfigLocalTestAllowEnv)) != "1" {
		return false, nil
	}
	if c == nil || c.Postgres == nil || strings.TrimSpace(c.Postgres.Dsn) == "" {
		return false, fmt.Errorf("POSTGRES_DSN is required")
	}
	if err := devdbguard.RequireCustomerConfigLocalTestDSN(c.Postgres.Dsn); err != nil {
		return false, err
	}
	return true, nil
}

func (d *jsonrpcDispatcher) Handle(
	ctx context.Context,
	url, jsonrpc, method, id string,
	params *structpb.Struct,
) (string, *v1.JsonrpcResult, error) {
	if jsonrpc == "" {
		jsonrpc = "2.0"
	}
	ctx = withAdminPermissionCache(ctx)
	d.log.WithContext(ctx).Infof(
		"[jsonrpc] handle url=%s jsonrpc=%s method=%s id=%s",
		url, jsonrpc, method, id,
	)

	if params == nil {
		d.log.WithContext(ctx).Info("[jsonrpc] params=<nil>")
	} else {
		logParams := redactRPCParams(params.AsMap())
		if url == "production_order" {
			logParams = productionOrderRPCLogSummary(params.AsMap())
		}
		b, _ := json.MarshalIndent(logParams, "", "  ")
		d.log.WithContext(ctx).Infof("[jsonrpc] params=%s", string(b))
	}

	if !d.isPublic(url, method) {
		if _, res := d.requireLogin(ctx); res != nil {
			return id, res, nil
		}
		if res := d.requireSensitiveFieldMutationPermission(ctx, url, method); res != nil {
			return id, res, nil
		}
	}

	dispatch := func() (string, *v1.JsonrpcResult, error) {
		switch url {
		case "system":
			return d.handleSystem(ctx, id, method, params)
		case "auth":
			return d.handleAuth(ctx, method, id, params)
		case "admin":
			return d.handleAdmin(ctx, method, id, params)
		case "workflow":
			return d.handleWorkflow(ctx, method, id, params)
		case "business":
			return d.handleBusiness(ctx, method, id, params)
		case "masterdata":
			return d.handleMasterData(ctx, method, id, params)
		case "sales_order":
			return d.handleSalesOrder(ctx, method, id, params)
		case "purchase_order":
			return d.handlePurchaseOrder(ctx, method, id, params)
		case "production_order":
			return d.handleProductionOrder(ctx, method, id, params)
		case "production_wip":
			return d.handleProductionWIP(ctx, method, id, params)
		case "outsourcing_order":
			return d.handleOutsourcingOrder(ctx, method, id, params)
		case "purchase":
			return d.handlePurchase(ctx, method, id, params)
		case "inventory":
			return d.handleInventory(ctx, method, id, params)
		case "quality":
			return d.handleQuality(ctx, method, id, params)
		case "bom":
			return d.handleBOM(ctx, method, id, params)
		case "operational_fact":
			return d.handleOperationalFact(ctx, method, id, params)
		case "attachment":
			return d.handleBusinessAttachment(ctx, method, id, params)
		case "customer_config":
			return d.handleCustomerConfig(ctx, method, id, params)
		case "debug":
			return d.handleDebug(ctx, method, id, params)
		default:
			return id, &v1.JsonrpcResult{
				Code:    errcode.JSONRPCUnknownURL.Code,
				Message: fmt.Sprintf("unknown jsonrpc url=%s", url),
			}, nil
		}
	}
	resultID, result, err := dispatch()
	if err == nil && result != nil && !d.isPublic(url, method) {
		d.applySensitiveFieldReadPolicy(ctx, url, method, result)
	}
	return resultID, result, err
}

func (r *jsonrpcDispatcher) handleSystem(
	ctx context.Context,
	id, method string,
	_ *structpb.Struct,
) (string, *v1.JsonrpcResult, error) {
	logger := r.log.WithContext(ctx)
	logger.Info("Jsonrpc.system: start", "method", method, "id", id)

	switch method {
	case "ping":
		data := newDataStruct(map[string]any{"pong": "pong"})
		logger.Info("Jsonrpc.system.ping: success", "id", id)
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: data}, nil
	case "version":
		data := newDataStruct(map[string]any{"version": "1.0.0"})
		logger.Info("Jsonrpc.system.version: success", "id", id)
		return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message, Data: data}, nil
	default:
		logger.Warn("Jsonrpc.system: unknown method", "method", method, "id", id)
		return id, &v1.JsonrpcResult{
			Code:    errcode.UnknownMethod.Code,
			Message: fmt.Sprintf("unknown system method: %s", method),
		}, nil
	}
}
