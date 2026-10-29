package service

import (
	"context"
	"testing"

	"server/internal/biz"
	"server/internal/errcode"
)

type roleFlowExceptionRepo struct {
	exceptionProcessServiceOperationalFactRepo
	submitted, cancelled int
}

func (r *roleFlowExceptionRepo) SubmitProductionException(_ context.Context, in *biz.ProductionExceptionSubmit, _ string) (*biz.ProductionExceptionDecision, error) {
	r.submitted++
	return &biz.ProductionExceptionDecision{ID: 1, DecisionType: in.DecisionType}, nil
}

func (r *roleFlowExceptionRepo) CancelProductionException(_ context.Context, _ *biz.ProductionExceptionMutation) (*biz.ProductionExceptionDecision, error) {
	r.cancelled++
	return r.productionException, nil
}

func TestRoleFlowExceptionSubmissionAndWithdrawalByDecisionType(t *testing.T) {
	for _, role := range biz.BuiltinRoles() {
		for _, decision := range []string{biz.ProductionExceptionOverIssue, biz.ProductionExceptionScrap, biz.ProductionExceptionWIPConcession, biz.ProductionExceptionReworkOriginal, biz.ProductionExceptionReworkSwitch, biz.ProductionExceptionRemake} {
			t.Run(role.Key+"/"+decision, func(t *testing.T) {
				repo := &roleFlowExceptionRepo{}
				repo.productionException = &biz.ProductionExceptionDecision{ID: 1, DecisionType: decision, Version: 1}
				admin := workflowJSONRPCAdmin([]string{role.Key}, role.Permissions...)
				j := newOperationalFactJSONRPCTestDataWithRepo(t, admin, repo)
				activateOperationalFactTestCustomerConfig(t, j, customerConfigPublishParamsWithRevisionAndModuleState(t, customerConfigPublishParams(t), "role-flow-"+role.Key+"-"+decision, "production", "enabled"))
				params := map[string]any{"decision_no": "EX-ROLE", "decision_type": decision, "production_order_id": 1, "production_order_item_id": 1, "requested_quantity": "1", "reason": "业务链路权限回归", "idempotency_key": "role-flow-exception"}
				if decision == biz.ProductionExceptionOverIssue {
					params["production_material_requirement_id"] = 1
				} else {
					params["production_wip_batch_id"], params["quality_inspection_id"] = 1, 1
					if biz.ProductionExceptionCreatesBatch(decision) {
						params["target_operation_id"], params["target_supplier_id"] = 1, 1
					}
				}
				allowed := role.Key == biz.ProductionRoleKey && decision == biz.ProductionExceptionOverIssue || role.Key == biz.SalesRoleKey && decision != biz.ProductionExceptionOverIssue
				want, calls := errcode.PermissionDenied.Code, 0
				if allowed {
					want, calls = errcode.OK.Code, 1
				}
				_, result, err := j.handleOperationalFact(workflowJSONRPCAdminContext(), "submit_production_exception", "submit", mustJSONRPCStruct(t, params))
				if err != nil || result == nil || result.Code != want || repo.submitted != calls {
					t.Fatalf("submit: result=%#v calls=%d want=%d err=%v", result, repo.submitted, want, err)
				}
				_, result, err = j.handleOperationalFact(workflowJSONRPCAdminContext(), "cancel_production_exception", "cancel", mustJSONRPCStruct(t, map[string]any{"id": 1, "expected_version": 1, "reason": "撤回申请"}))
				if err != nil || result == nil || result.Code != want || repo.cancelled != calls {
					t.Fatalf("cancel authoritative type: result=%#v calls=%d want=%d err=%v", result, repo.cancelled, want, err)
				}
				if role.Key == biz.ProductionRoleKey || role.Key == biz.SalesRoleKey {
					contract, _, _, _ := customerConfigExceptionProcessContractForMethod("start_production_exception_approval_process")
					ctx := withAdminPermissionCache(biz.WithCurrentAdmin(workflowJSONRPCAdminContext(), admin))
					res := j.requireExceptionProcessSourceRead(ctx, "start_production_exception_approval_process", contract, 1)
					if allowed && res != nil || !allowed && (res == nil || res.Code != errcode.PermissionDenied.Code) {
						t.Fatalf("approval start must use stored type: %#v", res)
					}
				}
			})
		}
	}
}

func TestRoleFlowMaterialIssuePostCancelRequiresWarehouseOutbound(t *testing.T) {
	for _, role := range biz.BuiltinRoles() {
		for _, factType := range []string{biz.ProductionFactMaterialIssue, biz.ProductionFactRework} {
			t.Run(role.Key+"/"+factType, func(t *testing.T) {
				repo := &productionModuleGateOperationalFactRepo{factTypes: map[int]string{603: factType}}
				j := newOperationalFactJSONRPCTestDataWithRepo(t, workflowJSONRPCAdmin([]string{role.Key}, role.Permissions...), repo)
				activateOperationalFactTestCustomerConfig(t, j, customerConfigPublishParamsWithRevisionAndModuleState(t, customerConfigPublishParams(t), "role-material-"+role.Key+"-"+factType, "production", "enabled"))
				allowed := factType == biz.ProductionFactMaterialIssue && role.Key == biz.WarehouseRoleKey || factType == biz.ProductionFactRework && role.Key == biz.ProductionRoleKey
				want, calls := errcode.PermissionDenied.Code, 0
				if allowed {
					want, calls = errcode.OK.Code, 1
				}
				for _, method := range []string{"post_production_fact", "cancel_production_fact"} {
					params := map[string]any{"id": 603, "expected_version": 1}
					if method == "cancel_production_fact" {
						params["reason"] = "来源数量核对"
					}
					_, result, err := j.handleOperationalFact(workflowJSONRPCAdminContext(), method, "material", mustJSONRPCStruct(t, params))
					if err != nil || result == nil || result.Code != want {
						t.Fatalf("%s: result=%#v want=%d err=%v", method, result, want, err)
					}
				}
				if repo.postProductionFactCalls != calls || repo.cancelProductionFactCalls != calls {
					t.Fatal("unauthorized fact writer reached")
				}
			})
		}
	}
}

func TestRoleFlowQuantityCommandsDoNotRequireCommercialRead(t *testing.T) {
	j := &jsonrpcDispatcher{}
	ctx := withAdminPermissionCache(biz.WithCurrentAdmin(workflowJSONRPCAdminContext(), workflowJSONRPCAdmin([]string{biz.WarehouseRoleKey})))
	for _, command := range [][2]string{{"purchase", "create_purchase_receipt_adjustment_from_receipt"}, {"operational_fact", "create_outsourcing_return_disposition"}} {
		if res := j.requireSensitiveFieldMutationPermission(ctx, command[0], command[1]); res != nil {
			t.Fatalf("source-bound quantity command blocked: %s %#v", command[1], res)
		}
	}
	for _, method := range []string{"save_outsourcing_order_with_items", "save_purchase_order_with_items"} {
		if res := j.requireSensitiveFieldMutationPermission(ctx, "purchase", method); res == nil || res.Code != errcode.PermissionDenied.Code {
			t.Fatalf("commercial writer escaped: %s %#v", method, res)
		}
	}
}

func TestRoleFlowQualityDetailRequiresItsActualSourceRead(t *testing.T) {
	for _, source := range []struct{ source, permission string }{
		{biz.QualityInspectionSourcePurchaseReceipt, biz.PermissionPurchaseReceiptRead},
		{biz.QualityInspectionSourceOutsourcingFact, biz.PermissionOutsourcingFactRead},
		{biz.QualityInspectionSourceShipment, biz.PermissionShipmentRead},
		{biz.QualityInspectionSourceProductionWIP, biz.PermissionProductionWIPRead},
	} {
		for _, granted := range []bool{false, true} {
			permissions := []string{biz.PermissionQualityInspectionRead}
			if granted {
				permissions = append(permissions, source.permission)
			}
			j := newOperationalFactJSONRPCTestData(t, workflowJSONRPCAdmin([]string{biz.QualityRoleKey}, permissions...))
			ctx := withAdminPermissionCache(biz.WithCurrentAdmin(workflowJSONRPCAdminContext(), workflowJSONRPCAdmin([]string{biz.QualityRoleKey}, permissions...)))
			res := j.requireQualityInspectionSourceRead(ctx, &biz.QualityInspection{SourceType: &source.source})
			if granted && res != nil || !granted && (res == nil || res.Code != errcode.PermissionDenied.Code) {
				t.Fatalf("source=%s granted=%v: %#v", source.source, granted, res)
			}
		}
	}
}
