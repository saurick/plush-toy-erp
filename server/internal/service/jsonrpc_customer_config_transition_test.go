package service

import (
	"testing"
	"time"

	"server/internal/biz"
	"server/internal/errcode"

	"google.golang.org/protobuf/types/known/structpb"
)

func TestCustomerConfigTransitionCheckParamsRequireExactContract(t *testing.T) {
	valid := map[string]any{
		"action":                   biz.CustomerConfigTransitionActivate,
		"customer_key":             biz.DefaultCustomerKey,
		"target_revision":          "rev-1",
		"expected_config_hash":     "hash",
		"expected_product_version": "product-v1",
		"expected_active_revision": "",
	}
	if _, ok := customerConfigTransitionCheckInputFromParams(valid); !ok {
		t.Fatal("valid transition check params rejected")
	}
	for name, mutate := range map[string]func(map[string]any){
		"missing expected active revision": func(pm map[string]any) { delete(pm, "expected_active_revision") },
		"unknown field":                    func(pm map[string]any) { pm["processDefinitions"] = map[string]any{} },
		"unsupported action":               func(pm map[string]any) { pm["action"] = "switch" },
		"legacy revision alias": func(pm map[string]any) {
			delete(pm, "target_revision")
			pm["revision"] = "rev-1"
		},
	} {
		t.Run(name, func(t *testing.T) {
			pm := map[string]any{}
			for key, value := range valid {
				pm[key] = value
			}
			mutate(pm)
			if _, ok := customerConfigTransitionCheckInputFromParams(pm); ok {
				t.Fatalf("invalid params accepted: %#v", pm)
			}
		})
	}
}

func TestCustomerConfigJSONRPCTransitionCheckReturnsStructuredReadOnlyResult(t *testing.T) {
	dispatcher := newCustomerConfigTestDispatcher(
		&biz.AdminUser{ID: 1, Username: "admin", CreatedAt: time.Now(), UpdatedAt: time.Now()},
		[]string{biz.AdminRoleKey},
	)
	ctx := customerConfigAdminCtx(1, "admin")
	_, publishRes, err := dispatcher.handleCustomerConfig(
		ctx,
		"publish_customer_config",
		"publish",
		customerConfigPublishParamsForRevision(t, "rev-1"),
	)
	if err != nil || publishRes.Code != errcode.OK.Code {
		t.Fatalf("publish err=%v result=%#v", err, publishRes)
	}
	params, err := structpb.NewStruct(map[string]any{
		"action":                   biz.CustomerConfigTransitionActivate,
		"customer_key":             biz.DefaultCustomerKey,
		"target_revision":          "rev-1",
		"expected_config_hash":     customerConfigHashFromPublishResult(t, publishRes),
		"expected_product_version": "test",
		"expected_active_revision": "",
	})
	if err != nil {
		t.Fatalf("NewStruct error = %v", err)
	}
	_, result, err := dispatcher.handleCustomerConfig(ctx, "check_customer_config_transition", "check", params)
	if err != nil || result.Code != errcode.OK.Code {
		t.Fatalf("check err=%v result=%#v", err, result)
	}
	transition, ok := result.Data.AsMap()["transition"].(map[string]any)
	if !ok {
		t.Fatalf("transition missing: %#v", result.Data.AsMap())
	}
	if transition["allowed"] != true || transition["observed_active_revision"] != "" {
		t.Fatalf("transition = %#v", transition)
	}
	if blockers, ok := transition["blockers"].([]any); !ok || len(blockers) != 0 {
		t.Fatalf("blockers = %#v", transition["blockers"])
	}
}

func TestCustomerConfigJSONRPCTransitionCheckReportsStaleActiveRevision(t *testing.T) {
	dispatcher := newCustomerConfigTestDispatcher(
		&biz.AdminUser{ID: 1, Username: "admin", CreatedAt: time.Now(), UpdatedAt: time.Now()},
		[]string{biz.AdminRoleKey},
	)
	ctx := customerConfigAdminCtx(1, "admin")
	_, publishRes, err := dispatcher.handleCustomerConfig(ctx, "publish_customer_config", "publish", customerConfigPublishParamsForRevision(t, "rev-1"))
	if err != nil || publishRes.Code != errcode.OK.Code {
		t.Fatalf("publish err=%v result=%#v", err, publishRes)
	}
	params, _ := structpb.NewStruct(map[string]any{
		"action":                   biz.CustomerConfigTransitionActivate,
		"customer_key":             biz.DefaultCustomerKey,
		"target_revision":          "rev-1",
		"expected_config_hash":     customerConfigHashFromPublishResult(t, publishRes),
		"expected_product_version": "test",
		"expected_active_revision": "rev-stale",
	})
	_, result, err := dispatcher.handleCustomerConfig(ctx, "check_customer_config_transition", "check", params)
	if err != nil || result.Code != errcode.OK.Code {
		t.Fatalf("check err=%v result=%#v", err, result)
	}
	transition := result.Data.AsMap()["transition"].(map[string]any)
	if transition["allowed"] != false {
		t.Fatalf("stale transition allowed: %#v", transition)
	}
	blockers := transition["blockers"].([]any)
	if len(blockers) != 1 || blockers[0].(map[string]any)["code"] != "active_revision_changed" {
		t.Fatalf("blockers = %#v", blockers)
	}
}

func TestCustomerConfigTransitionMutationParamsRequireExactContract(t *testing.T) {
	activate := map[string]any{
		"customer_key":             biz.DefaultCustomerKey,
		"revision":                 "rev-2",
		"expected_config_hash":     "hash-2",
		"expected_product_version": "product-v1",
		"expected_active_revision": "rev-1",
	}
	if got, ok := customerConfigTransitionMutationIdentityFromParams(activate, biz.CustomerConfigTransitionActivate); !ok || got.TargetRevision != "rev-2" || got.ExpectedActiveRevision != "rev-1" {
		t.Fatalf("valid activate params rejected: %#v ok=%v", got, ok)
	}
	rollback := map[string]any{
		"customer_key":             biz.DefaultCustomerKey,
		"target_revision":          "rev-1",
		"expected_config_hash":     "hash-1",
		"expected_product_version": "product-v1",
		"expected_active_revision": "rev-2",
	}
	if got, ok := customerConfigTransitionMutationIdentityFromParams(rollback, biz.CustomerConfigTransitionRollback); !ok || got.TargetRevision != "rev-1" {
		t.Fatalf("valid rollback params rejected: %#v ok=%v", got, ok)
	}

	for name, params := range map[string]map[string]any{
		"activate missing hash": {
			"customer_key":             biz.DefaultCustomerKey,
			"revision":                 "rev-2",
			"expected_product_version": "product-v1",
			"expected_active_revision": "rev-1",
		},
		"activate missing product version": {
			"customer_key":             biz.DefaultCustomerKey,
			"revision":                 "rev-2",
			"expected_config_hash":     "hash-2",
			"expected_active_revision": "rev-1",
		},
		"activate missing expected active": {
			"customer_key":             biz.DefaultCustomerKey,
			"revision":                 "rev-2",
			"expected_config_hash":     "hash-2",
			"expected_product_version": "product-v1",
		},
		"activate unknown field": {
			"customer_key":             biz.DefaultCustomerKey,
			"revision":                 "rev-2",
			"expected_config_hash":     "hash-2",
			"expected_product_version": "product-v1",
			"expected_active_revision": "rev-1",
			"fallback":                 true,
		},
		"rollback rejects revision alias": {
			"customer_key":             biz.DefaultCustomerKey,
			"revision":                 "rev-1",
			"expected_config_hash":     "hash-1",
			"expected_product_version": "product-v1",
			"expected_active_revision": "rev-2",
		},
	} {
		t.Run(name, func(t *testing.T) {
			action := biz.CustomerConfigTransitionActivate
			if name == "rollback rejects revision alias" {
				action = biz.CustomerConfigTransitionRollback
			}
			if _, ok := customerConfigTransitionMutationIdentityFromParams(params, action); ok {
				t.Fatalf("invalid mutation params accepted: %#v", params)
			}
		})
	}
}
