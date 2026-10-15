package data

import (
	"context"
	"fmt"
	"io"
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/enttest"
	"server/internal/data/model/ent/workflowtask"

	"entgo.io/ent/dialect"
	"github.com/go-kratos/kratos/v2/log"
	"github.com/shopspring/decimal"
)

type orderApprovalTestOwnerResolver struct{}

func (orderApprovalTestOwnerResolver) WorkflowCandidateOwnerRoleKeysAtRevision(_ context.Context, _, revision, ownerPoolKey string, capabilities ...string) (*biz.WorkflowTaskCandidateExplanation, error) {
	return &biz.WorkflowTaskCandidateExplanation{
		ConfigRevision: revision, OwnerPoolKey: ownerPoolKey, RequiredCapabilities: capabilities,
		CandidateOwnerRoleKeys: []string{biz.BossRoleKey}, Source: "customer_config_revision",
	}, nil
}

func TestOrderApprovalConditionSourceTransactionAndRouting(t *testing.T) {
	for _, kind := range []string{"sales_order", "purchase_order"} {
		for _, tc := range []struct {
			name, amount, currency, mode string
			required                     bool
		}{
			{"below", "9999.99", "CNY", "amount", false},
			{"equal", "10000", "CNY", "amount", true},
			{"other_currency", "1", "USD", "amount", true},
			{"default_all", "1", "CNY", "all", true},
			{"receipt_failure", "9999.99", "CNY", "amount", false},
		} {
			t.Run(kind+"/"+tc.name, func(t *testing.T) {
				ctx := context.Background()
				client := enttest.Open(t, dialect.SQLite, fmt.Sprintf("file:approval_%s_%s?mode=memory&cache=shared&_fk=1", kind, tc.name))
				defer mustCloseEntClient(t, client)
				data := &Data{postgres: client, sqlDialect: dialect.SQLite}
				logger := log.NewStdLogger(io.Discard)
				processRepo := NewProcessRuntimeRepo(data, logger)
				workflowRepo := NewWorkflowRepo(data, logger)
				runtime := biz.NewProcessRuntimeUsecase(processRepo, workflowRepo, orderApprovalTestOwnerResolver{})
				if err := biz.RegisterExceptionApprovalProcessBranchPolicyHandlers(runtime); err != nil {
					t.Fatal(err)
				}
				amount := decimal.RequireFromString(tc.amount)
				unit := createTestUnit(t, ctx, client, "UNIT")
				var id int
				var status func() string
				processKey := biz.ProcessKeySalesOrderAcceptance
				submitKey := "submit_sales_order"
				commandKey := biz.ProcessDomainCommandSalesOrderSubmit
				policyKey := biz.ProcessBranchPolicySalesOrderRequirement
				approvalKey := "order_approval"
				effectiveKey := "activate_sales_order"
				effectiveCommand := biz.ProcessDomainCommandSalesOrderActivate
				effectiveStatus := biz.SalesOrderStatusActive
				if kind == "sales_order" {
					customer := createSalesOrderTestCustomer(t, ctx, client, "C-APPROVAL", true)
					product := createTestProduct(t, ctx, client, unit.ID, "PRODUCT")
					order := client.SalesOrder.Create().SetOrderNo("SO-APPROVAL").SetCustomerID(customer.ID).SetOrderDate(time.Now()).
						SetCurrency(tc.currency).SetTaxMode(biz.SalesOrderTaxModeNone).SetFreightTerms(biz.SalesOrderFreightTermsExcluded).
						SetQuotedFreightAmount(decimal.Zero).SetGoodsAmount(amount).SetTaxAmount(decimal.Zero).SetOrderTotal(amount).SaveX(ctx)
					client.SalesOrderItem.Create().SetSalesOrderID(order.ID).SetLineNo(1).SetProductID(product.ID).SetUnitID(unit.ID).
						SetOrderedQuantity(decimal.NewFromInt(1)).SetUnitPrice(amount).SetAmount(amount).SaveX(ctx)
					id = order.ID
					status = func() string { return client.SalesOrder.GetX(ctx, id).LifecycleStatus }
					if err := biz.RegisterSalesOrderProcessDomainCommandHandlers(runtime, biz.NewSalesOrderUsecase(NewSalesOrderRepo(data, logger))); err != nil {
						t.Fatal(err)
					}
				} else {
					supplier := client.Supplier.Create().SetCode("SUP-APPROVAL").SetName("审批测试供应商").SaveX(ctx)
					material := createTestMaterial(t, ctx, client, unit.ID, "MAT-APPROVAL")
					order := client.PurchaseOrder.Create().SetPurchaseOrderNo("PO-APPROVAL").SetSupplierID(supplier.ID).SetPurchaseDate(time.Now()).SetCurrency(tc.currency).SaveX(ctx)
					// Multiple lines prove the source transaction uses the order sum.
					for i := 1; i <= 2; i++ {
						client.PurchaseOrderItem.Create().SetPurchaseOrderID(order.ID).SetLineNo(i).SetMaterialID(material.ID).SetUnitID(unit.ID).
							SetPurchasedQuantity(decimal.NewFromInt(1)).SetUnitPrice(amount.Div(decimal.NewFromInt(2))).SetAmount(amount.Div(decimal.NewFromInt(2))).SaveX(ctx)
					}
					id = order.ID
					status = func() string { return client.PurchaseOrder.GetX(ctx, id).LifecycleStatus }
					processKey = biz.ProcessKeyMaterialSupply
					submitKey = "submit_purchase_order"
					commandKey = biz.ProcessDomainCommandPurchaseOrderSubmit
					policyKey = biz.ProcessBranchPolicyPurchaseOrderRequirement
					approvalKey = "purchase_order_approval"
					effectiveKey = "approve_purchase_order"
					effectiveCommand = biz.ProcessDomainCommandPurchaseOrderApprove
					effectiveStatus = biz.PurchaseOrderStatusApproved
					if err := biz.RegisterPurchaseOrderProcessDomainCommandHandlers(runtime, biz.NewPurchaseOrderUsecase(NewPurchaseOrderRepo(data, logger))); err != nil {
						t.Fatal(err)
					}
				}
				rule, err := biz.NormalizeApprovalCondition(kind, biz.ApprovalCondition{Mode: tc.mode, Amount: "10000", Currency: "CNY"})
				if err != nil {
					t.Fatal(err)
				}
				policy := map[string]any{"command_key": commandKey, "approval_condition": rule.Snapshot()}
				if tc.mode == "amount" {
					policy["branch_policy_key"] = policyKey
				}
				owner := "boss"
				capability := biz.PermissionWorkflowTaskApprove
				instance, nodes, err := processRepo.CreateProcessInstance(ctx, &biz.ProcessInstanceCreate{
					ProcessKey: processKey, ProcessVersion: "v1", ConfigRevision: "approval-rule-test", DefinitionHash: "approval-rule-test",
					BusinessRefType: kind, BusinessRefID: id, IdempotencyKey: "start-approval-rule", Status: biz.ProcessStatusActive,
					Nodes: []biz.ProcessNodeInstanceCreate{
						{NodeKey: submitKey, NodeType: biz.ProcessNodeTypeDomainCommand, Status: biz.ProcessNodeStatusWaiting, Attempt: 1, PolicySnapshot: policy},
						{NodeKey: approvalKey, NodeType: biz.ProcessNodeTypeApproval, Status: biz.ProcessNodeStatusWaiting, Attempt: 1, OwnerPoolKey: &owner, RequiredCapabilityKey: &capability},
						{NodeKey: effectiveKey, NodeType: biz.ProcessNodeTypeDomainCommand, Status: biz.ProcessNodeStatusWaiting, Attempt: 1, PolicySnapshot: map[string]any{"command_key": effectiveCommand, "execute_after_approval": true}},
						{NodeKey: "end", NodeType: biz.ProcessNodeTypeEnd, Status: biz.ProcessNodeStatusWaiting, Attempt: 1},
					},
				}, 7)
				if err != nil {
					t.Fatal(err)
				}
				node := activateProcessNodeForTest(t, ctx, processRepo, instance, nodes[0])
				input := &biz.ProcessDomainCommandExecution{ProcessInstanceID: instance.ID, ProcessNodeInstanceID: node.ID, ExpectedVersion: node.Version, CommandKey: commandKey, IdempotencyKey: "submit-approval-rule", Payload: map[string]any{kind + "_id": id}}
				if tc.name == "receipt_failure" {
					failReceipt := true
					client.ProcessNodeInstance.Use(func(next ent.Mutator) ent.Mutator {
						return ent.MutateFunc(func(ctx context.Context, mutation ent.Mutation) (ent.Value, error) {
							if _, writesReceipt := mutation.Field("domain_command_result"); failReceipt && writesReceipt {
								return nil, fmt.Errorf("injected approval receipt failure")
							}
							return next.Mutate(ctx, mutation)
						})
					})
					if _, err := runtime.ExecuteDomainCommandNode(ctx, input, 7); err == nil {
						t.Fatal("missing injected failure")
					}
					failedNode, err := processRepo.GetProcessNodeInstance(ctx, node.ID)
					if err != nil || failedNode.DomainCommandResultHash != nil || status() != "draft" {
						t.Fatalf("partial source submission: status=%s node=%+v err=%v", status(), failedNode, err)
					}
					failReceipt = false
				}
				completed, err := runtime.ExecuteDomainCommandNode(ctx, input, 7)
				if err != nil {
					t.Fatal(err)
				}
				stored, err := processRepo.GetProcessNodeInstance(ctx, completed.ID)
				if err != nil {
					t.Fatal(err)
				}
				decision := stored.DomainCommandResult["approval_decision"].(map[string]any)
				if decision["amount"] != tc.amount || decision["required"] != tc.required {
					t.Fatalf("decision=%+v", decision)
				}
				taskCount := client.WorkflowTask.Query().CountX(ctx)
				approvalTaskCount := client.WorkflowTask.Query().Where(workflowtask.ProcessNodeInstanceID(nodes[1].ID)).CountX(ctx)
				if tc.required {
					if status() != "submitted" || approvalTaskCount != 1 {
						t.Fatalf("manual route: status=%s approval tasks=%d", status(), approvalTaskCount)
					}
				} else {
					if status() != effectiveStatus || approvalTaskCount != 0 {
						t.Fatalf("exempt route: status=%s approval tasks=%d", status(), approvalTaskCount)
					}
					finished, err := processRepo.GetProcessInstance(ctx, instance.ID)
					if err != nil || finished.Status != biz.ProcessStatusCompleted {
						t.Fatalf("unfinished process=%+v err=%v", finished, err)
					}
				}
				// Replaying the submitted intent cannot duplicate tasks or effects.
				if _, err := runtime.ExecuteDomainCommandNode(ctx, input, 7); err != nil {
					t.Fatal(err)
				}
				if client.WorkflowTask.Query().CountX(ctx) != taskCount {
					t.Fatal("duplicate task")
				}
				if client.InventoryTxn.Query().CountX(ctx) != 0 || client.FinanceFact.Query().CountX(ctx) != 0 {
					t.Fatal("approval wrote facts")
				}
			})
		}
	}
}
