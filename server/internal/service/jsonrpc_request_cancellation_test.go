package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/errcode"

	"github.com/go-kratos/kratos/v2/log"
)

func TestJSONRPCRequestCancellationErrorMappings(t *testing.T) {
	mappers := map[string]func(*jsonrpcDispatcher, context.Context, error) *v1.JsonrpcResult{
		"admin password login": (*jsonrpcDispatcher).mapAdminPasswordLoginError,
		"admin login":          (*jsonrpcDispatcher).mapAdminLoginError,
		"auth":                 (*jsonrpcDispatcher).mapAuthError,
		"admin manage":         (*jsonrpcDispatcher).mapAdminManageError,
		"workflow":             (*jsonrpcDispatcher).mapWorkflowError,
		"customer config":      (*jsonrpcDispatcher).mapCustomerConfigError,
		"master data":          (*jsonrpcDispatcher).mapMasterDataError,
		"BOM":                  (*jsonrpcDispatcher).mapBOMError,
		"sales":                (*jsonrpcDispatcher).mapSalesOrderError,
		"purchase order":       (*jsonrpcDispatcher).mapPurchaseOrderError,
		"purchase":             (*jsonrpcDispatcher).mapPurchaseError,
		"production order":     (*jsonrpcDispatcher).mapProductionOrderError,
		"production WIP":       (*jsonrpcDispatcher).mapProductionWIPError,
		"outsourcing":          (*jsonrpcDispatcher).mapOutsourcingOrderError,
		"inventory":            (*jsonrpcDispatcher).mapInventoryError,
		"quality":              (*jsonrpcDispatcher).mapQualityError,
		"facts":                (*jsonrpcDispatcher).mapOperationalFactError,
		"attachments":          (*jsonrpcDispatcher).mapBusinessAttachmentError,
		"debug":                (*jsonrpcDispatcher).mapDebugError,
	}
	for name, mapper := range mappers {
		t.Run(name, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			cancel()
			var output bytes.Buffer
			d := &jsonrpcDispatcher{log: log.NewHelper(log.NewStdLogger(&output))}
			result := mapper(d, ctx, fmt.Errorf("query: %w", context.Canceled))
			if result == nil || result.Code != errcode.RequestCanceled.Code || result.Message != errcode.RequestCanceled.Message {
				t.Fatalf("client cancellation became a business/system error: %+v", result)
			}
			if output.Len() != 0 {
				t.Fatalf("cancellation produced a duplicate error log: %s", output.String())
			}
		})
	}
}

func TestJSONRPCRequestCancellationDoesNotHideFailures(t *testing.T) {
	canceled, cancel := context.WithCancel(context.Background())
	cancel()
	for _, tc := range []struct {
		name string
		ctx  context.Context
		err  error
	}{
		{"active request with canceled dependency", context.Background(), context.Canceled},
		{"deadline exceeded", canceled, context.DeadlineExceeded},
		{"unrelated error after cancellation", canceled, errors.New("database unavailable")},
		{"cancellation text is not cancellation", canceled, errors.New("context canceled")},
		{"joined real failure", canceled, errors.Join(context.Canceled, errors.New("database unavailable"))},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var output bytes.Buffer
			d := &jsonrpcDispatcher{log: log.NewHelper(log.NewStdLogger(&output))}
			result := d.mapMasterDataError(tc.ctx, tc.err)
			if result.Code != errcode.Internal.Code || !strings.Contains(output.String(), "ERROR") {
				t.Fatalf("real failure was hidden: result=%+v log=%s", result, output.String())
			}
		})
	}
}

func TestJSONRPCRequestCancellationKeepsProgressQueryResultExplicit(t *testing.T) {
	t.Setenv("ERP_CUSTOMER_KEY", biz.DefaultCustomerKey)
	d, _, _, _ := newProductionOrderJSONRPCTestData(t, biz.PermissionERPBusinessDashboardRead, biz.PermissionPMCPlanRead)
	repo := &progressAPIRepo{err: context.Canceled}
	d.businessProgressUC = biz.NewBusinessProgressUsecase(repo)
	ctx, cancel := context.WithCancel(workflowJSONRPCAdminContext())
	cancel()
	_, result, err := d.handleBusiness(ctx, "list_progress", "canceled-progress", nil)
	if err != nil || result.Code != errcode.RequestCanceled.Code || repo.calls != 1 {
		t.Fatalf("progress cancellation was not mapped at the real API boundary: result=%+v calls=%d err=%v", result, repo.calls, err)
	}
}

func TestJSONRPCRequestCancellationRequiresOnlyCanceledCauses(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	for _, err := range []error{context.Canceled, fmt.Errorf("query: %w", context.Canceled), errors.Join(context.Canceled, context.Canceled)} {
		if result := canceledRequestResult(ctx, err); result == nil || result.Code != errcode.RequestCanceled.Code {
			t.Fatalf("proven cancellation was lost: %v", err)
		}
	}
	if canceledRequestResult(ctx, nil) != nil {
		t.Fatal("canceled context cannot replace a successful operation")
	}
}
