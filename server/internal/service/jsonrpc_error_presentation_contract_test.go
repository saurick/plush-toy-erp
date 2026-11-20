package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"testing"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
	"google.golang.org/protobuf/encoding/protojson"
)

// 跨层 Node 回归经真实 JsonRpc 消费这些映射响应，避免另维护一份 JSON 样例。
func TestJSONRPCErrorPresentationContract(t *testing.T) {
	d := &jsonrpcDispatcher{log: log.NewHelper(log.NewStdLogger(io.Discard))}
	type sample struct {
		Name  string          `json:"name"`
		Reply json.RawMessage `json:"reply"`
	}
	var samples []sample
	for _, tc := range []struct {
		name   string
		mapper func(context.Context, error) *v1.JsonrpcResult
		err    error
		code   errcode.Definition
	}{
		{"inventory version", d.mapInventoryError, biz.ErrInventoryOperationVersionConflict, errcode.ResourceVersionConflict},
		{"inventory stale count", d.mapInventoryError, biz.ErrInventoryOperationStaleCount, errcode.ResourceVersionConflict},
		{"inventory self approval", d.mapInventoryError, biz.ErrInventoryOperationSelfApproval, errcode.PermissionDenied},
		{"process self approval", d.mapCustomerConfigError, biz.ErrInventoryOperationSelfApproval, errcode.PermissionDenied},
		{"task self approval", d.mapWorkflowError, biz.ErrInventoryOperationSelfApproval, errcode.PermissionDenied},
		{"image referenced", d.mapBusinessAttachmentError, biz.ErrBusinessAttachmentReferenced, errcode.BusinessRuleViolation},
		{"attachment withdrawn", d.mapBusinessAttachmentError, biz.ErrBusinessAttachmentWithdrawn, errcode.BusinessRuleViolation},
		{"finance duplicate", d.mapOperationalFactError, biz.ErrFinanceFactSourceConflict, errcode.ResourceConflict},
		{"finance prerequisite", d.mapOperationalFactError, biz.ErrFinanceFactSourceInvalid, errcode.BusinessRuleViolation},
		{"reconciliation prerequisite", d.mapOperationalFactError, biz.ErrFinanceReconciliationSourceInvalid, errcode.BusinessRuleViolation},
		{"WIP count mismatch", d.mapProductionWIPError, biz.ErrProductionWIPReturnQuantityMismatch, errcode.BusinessRuleViolation},
		{"quality duplicate", d.mapQualityError, biz.ErrQualityInspectionSourceConflict, errcode.ResourceConflict},
		{"purchase duplicate", d.mapPurchaseError, biz.ErrPurchaseReturnQualitySourceConflict, errcode.ResourceConflict},
		{"material duplicate", d.mapMasterDataError, biz.ErrMaterialIdentityConflict, errcode.ResourceConflict},
		{"task version", d.mapWorkflowError, biz.ErrWorkflowTaskConflict, errcode.ResourceVersionConflict},
		{"task settled", d.mapWorkflowError, biz.ErrWorkflowTaskSettled, errcode.BusinessRuleViolation},
		{"task missing", d.mapWorkflowError, biz.ErrWorkflowTaskNotFound, errcode.ResourceNotFound},
		{"material request changed", d.mapSalesOrderError, biz.ErrMaterialRequestConflict, errcode.ResourceVersionConflict},
		{"material request missing", d.mapSalesOrderError, biz.ErrMaterialRequestNotFound, errcode.ResourceNotFound},
		{"material review order", d.mapSalesOrderError, biz.ErrMaterialRequestReviewInvalid, errcode.BusinessRuleViolation},
		{"material rejection reason", d.mapSalesOrderError, biz.ErrMaterialRequestReviewReasonRequired, errcode.InvalidParam},
		{"sales state", d.mapSalesOrderError, biz.ErrSourceOrderStateInvalid, errcode.BusinessRuleViolation},
		{"purchase state", d.mapPurchaseOrderError, biz.ErrSourceOrderStateInvalid, errcode.BusinessRuleViolation},
		{"outsourcing state", d.mapOutsourcingOrderError, biz.ErrSourceOrderStateInvalid, errcode.BusinessRuleViolation},
		{"process source state", d.mapCustomerConfigError, biz.ErrSourceOrderStateInvalid, errcode.BusinessRuleViolation},
		{"sales missing", d.mapSalesOrderError, biz.ErrSalesOrderNotFound, errcode.ResourceNotFound},
		{"customer missing", d.mapSalesOrderError, biz.ErrCustomerNotFound, errcode.ResourceNotFound},
		{"customer inactive", d.mapSalesOrderError, biz.ErrCustomerInactive, errcode.BusinessRuleViolation},
		{"stock shortage", d.mapInventoryError, biz.ErrInventoryInsufficientStock, errcode.BusinessRuleViolation},
		{"shipment prerequisite", d.mapOperationalFactError, biz.ErrShipmentFinanceReleaseRequired, errcode.BusinessRuleViolation},
		{"idempotency", d.mapInventoryError, biz.ErrIdempotencyConflict, errcode.IdempotencyConflict},
		{"input invalid", d.mapInventoryError, biz.ErrBadParam, errcode.InvalidParam},
		{"quantity precision", d.mapSalesOrderError, &biz.UnitQuantityError{Precision: 0}, errcode.InvalidParam},
		{"sales readiness", d.mapSalesOrderError, &biz.SalesOrderReadinessError{MissingFields: []string{"tax_rate"}}, errcode.InvalidParam},
		{"config changed", d.mapCustomerConfigError, biz.ErrCustomerConfigActiveRevisionChanged, errcode.ResourceVersionConflict},
		{"config blocked", d.mapCustomerConfigError, biz.ErrCustomerConfigTransitionBlocked, errcode.BusinessRuleViolation},
		{"config module disabled", d.mapCustomerConfigError, biz.ErrCustomerConfigModuleDisabled, errcode.BusinessRuleViolation},
		{"config module read only", d.mapCustomerConfigError, biz.ErrCustomerConfigModuleReadOnly, errcode.BusinessRuleViolation},
		{"task module disabled", d.mapWorkflowError, biz.ErrCustomerConfigModuleDisabled, errcode.BusinessRuleViolation},
		{"task module read only", d.mapWorkflowError, biz.ErrCustomerConfigModuleReadOnly, errcode.BusinessRuleViolation},
		{"process missing", d.mapCustomerConfigError, biz.ErrProcessInstanceNotFound, errcode.ResourceNotFound},
		{"process handler missing", d.mapCustomerConfigError, biz.ErrProcessDomainCommandHandlerNotFound, errcode.Internal},
		{"login rejected", d.mapAdminPasswordLoginError, biz.ErrInvalidPassword, errcode.AuthLoginRejected},
		{"SMS unavailable", d.mapAuthError, biz.ErrSMSServiceUnavailable, errcode.AuthSMSServiceUnavailable},
		{"unknown failure", d.mapInventoryError, errors.New("数据库 password=private diagnostic at /srv/private.go:42"), errcode.Internal},
	} {
		t.Run(tc.name, func(t *testing.T) {
			result := tc.mapper(t.Context(), fmt.Errorf("operation failed: %w", tc.err))
			if result.Code != tc.code.Code {
				t.Fatalf("code=%d message=%q, want %s", result.Code, result.Message, tc.code.Name)
			}
			body, err := protojson.Marshal(&v1.PostJsonrpcReply{Jsonrpc: "2.0", Id: "contract", Result: result})
			if err != nil {
				t.Fatal(err)
			}
			samples = append(samples, sample{Name: tc.name, Reply: body})
		})
	}
	if t.Failed() {
		return
	}
	body, err := json.Marshal(samples)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("ERROR_PRESENTATION_CONTRACT:%s", body)
}
