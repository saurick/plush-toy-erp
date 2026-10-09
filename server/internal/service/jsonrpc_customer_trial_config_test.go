package service

import (
	"strings"
	"testing"

	"server/internal/biz"
	"server/internal/customertrialconfig"
	"server/internal/errcode"

	"google.golang.org/protobuf/types/known/structpb"
)

func customerTrialConfigInputForTest() biz.CustomerConfigPublishInput {
	return biz.CustomerConfigPublishInput{
		CustomerKey:    customertrialconfig.ExpectedCustomerKey,
		Revision:       "yoyoosun-customer-trial-133.0123456789abcdef01234567",
		ProductVersion: customertrialconfig.ProductVersion,
		CompiledSnapshot: map[string]any{
			"applyPurpose":   customertrialconfig.ApplyPurpose,
			"datasetVersion": customertrialconfig.DatasetVersion,
			"target":         customertrialconfig.ExpectedTarget,
		},
	}
}

func TestCustomerTrialConfigManifestGateDefaultsClosed(t *testing.T) {
	dispatcher := &jsonrpcDispatcher{}
	result := dispatcher.requireCustomerTrialConfigManifest(customerTrialConfigInputForTest())
	if result == nil || result.Code != errcode.PermissionDenied.Code {
		t.Fatalf("trial manifest gate result = %#v, want permission denied", result)
	}
}

func TestCustomerTrialConfigManifestGateAllowsExactMarkerWhenEnabled(t *testing.T) {
	dispatcher := &jsonrpcDispatcher{trialConfigEnabled: true}
	if result := dispatcher.requireCustomerTrialConfigManifest(customerTrialConfigInputForTest()); result != nil {
		t.Fatalf("enabled trial manifest gate result = %#v, want nil", result)
	}
}

func TestCustomerTrialConfigJSONRPCValidateAndPublishExactMarkerWhenEnabled(t *testing.T) {
	payload := customerConfigPublishParams(t).AsMap()
	payload["customer_key"] = customertrialconfig.ExpectedCustomerKey
	payload["revision"] = "yoyoosun-customer-trial-133.0123456789abcdef01234567"
	payload["product_version"] = customertrialconfig.ProductVersion
	snapshot, ok := payload["compiled_snapshot"].(map[string]any)
	if !ok {
		t.Fatalf("compiled_snapshot missing: %#v", payload)
	}
	snapshot["applyPurpose"] = customertrialconfig.ApplyPurpose
	snapshot["datasetVersion"] = customertrialconfig.DatasetVersion
	snapshot["target"] = customertrialconfig.ExpectedTarget
	params, err := structpb.NewStruct(payload)
	if err != nil {
		t.Fatalf("NewStruct error = %v", err)
	}
	dispatcher := newCustomerConfigTestDispatcher(
		&biz.AdminUser{ID: 1, Username: "admin"},
		[]string{biz.AdminRoleKey},
	)
	dispatcher.trialConfigEnabled = true
	ctx := customerConfigAdminCtx(1, "admin")
	for _, method := range []string{"validate_customer_config", "publish_customer_config"} {
		_, result, err := dispatcher.handleCustomerConfig(ctx, method, method+"-trial", params)
		if err != nil {
			t.Fatalf("%s err = %v", method, err)
		}
		if result.Code != errcode.OK.Code {
			t.Fatalf("%s result = %#v, want OK", method, result)
		}
	}
}

func TestCustomerTrialConfigManifestGateRejectsPartialMarkerWhenEnabled(t *testing.T) {
	dispatcher := &jsonrpcDispatcher{trialConfigEnabled: true}
	input := customerTrialConfigInputForTest()
	delete(input.CompiledSnapshot, "datasetVersion")
	result := dispatcher.requireCustomerTrialConfigManifest(input)
	if result == nil || result.Code != errcode.InvalidParam.Code {
		t.Fatalf("partial trial manifest gate result = %#v, want invalid param", result)
	}
}

func TestCustomerTrialConfigManifestGateLeavesFormalInputUnchanged(t *testing.T) {
	dispatcher := &jsonrpcDispatcher{}
	input := biz.CustomerConfigPublishInput{
		ProductVersion:   "formal-product-version",
		CompiledSnapshot: map[string]any{"pages": []any{"sales-orders"}},
	}
	if result := dispatcher.requireCustomerTrialConfigManifest(input); result != nil {
		t.Fatalf("formal manifest gate result = %#v, want nil", result)
	}
}

func TestCustomerTrialConfigManifestGateLeavesLocalTestInputToItsOwnBoundary(t *testing.T) {
	dispatcher := &jsonrpcDispatcher{}
	input := biz.CustomerConfigPublishInput{
		ProductVersion: biz.CustomerConfigLocalTestProductVersion,
		CompiledSnapshot: map[string]any{
			"applyPurpose": biz.CustomerConfigLocalTestApplyPurpose,
		},
	}
	if result := dispatcher.requireCustomerTrialConfigManifest(input); result != nil {
		t.Fatalf("local test manifest gate result = %#v, want nil", result)
	}
}

func TestCustomerTrialConfigTransitionGateReadsFrozenRecord(t *testing.T) {
	input := customerTrialConfigInputForTest()
	input.Revision = "yoyoosun-customer-trial-133-package-v10.runtime-manifest-v1"
	record := &biz.CustomerConfigRevision{CustomerKey: input.CustomerKey, Revision: input.Revision, ProductVersion: input.ProductVersion, CompiledSnapshot: input.CompiledSnapshot}
	repo := &serviceCustomerConfigRepo{revisions: map[string]*biz.CustomerConfigRevision{serviceCustomerConfigKey(input.CustomerKey, input.Revision): record}}
	enabled := newCustomerConfigTestDispatcher(&biz.AdminUser{ID: 1, Username: "admin"}, []string{biz.AdminRoleKey})
	enabled.trialConfigEnabled = true
	enabled.customerConfigUC = biz.NewCustomerConfigUsecase(repo)
	disabled := &jsonrpcDispatcher{customerConfigUC: enabled.customerConfigUC}
	ctx := t.Context()
	if result := enabled.requireCustomerTrialConfigRevisionProductVersion(ctx, input.CustomerKey, input.Revision, input.ProductVersion); result != nil {
		t.Fatalf("frozen transition rejected: %#v", result)
	}
	if result := disabled.requireCustomerTrialConfigRevisionProductVersion(ctx, input.CustomerKey, input.Revision, input.ProductVersion); result == nil || result.Code != errcode.PermissionDenied.Code {
		t.Fatalf("disabled transition should fail closed: %#v", result)
	}
	if result := disabled.requireCustomerTrialConfigRevisionProductVersion(ctx, input.CustomerKey, "formal-revision", "formal-product-version"); result != nil {
		t.Fatalf("formal transition changed: %#v", result)
	}
	for _, mutate := range []func(){
		func() { record.CompiledSnapshot["target"] = "customer-trial-other" },
		func() {
			record.CompiledSnapshot["target"] = customertrialconfig.ExpectedTarget
			delete(record.CompiledSnapshot, "datasetVersion")
		},
		func() { record.ProductVersion = "different-product" },
		func() { delete(repo.revisions, serviceCustomerConfigKey(input.CustomerKey, input.Revision)) },
	} {
		mutate()
		if result := enabled.requireCustomerTrialConfigRevisionProductVersion(ctx, input.CustomerKey, input.Revision, input.ProductVersion); result == nil || result.Code == errcode.OK.Code {
			t.Fatal("missing or mismatched stored identity accepted")
		}
	}
	if result := enabled.requireCustomerTrialConfigManifest(input); result == nil || result.Code != errcode.InvalidParam.Code {
		t.Fatal("frozen transition identity must not authorize a new publication")
	}
}

func TestCustomerTrialFrozenRevisionRollbackKeepsHashAndCAS(t *testing.T) {
	dispatcher := newCustomerConfigTestDispatcher(&biz.AdminUser{ID: 1, Username: "admin"}, []string{biz.AdminRoleKey})
	dispatcher.trialConfigEnabled = true
	ctx := customerConfigAdminCtx(1, "admin")
	input, ok := customerConfigPublishInputFromParams(customerConfigPublishParams(t).AsMap())
	if !ok {
		t.Fatal("invalid fixture")
	}
	input.CustomerKey = customertrialconfig.ExpectedCustomerKey
	input.ProductVersion = customertrialconfig.ProductVersion
	input.CompiledSnapshot["applyPurpose"] = customertrialconfig.ApplyPurpose
	input.CompiledSnapshot["datasetVersion"] = customertrialconfig.DatasetVersion
	input.CompiledSnapshot["target"] = customertrialconfig.ExpectedTarget
	oldRevision := "yoyoosun-customer-trial-133-package-v10.runtime-manifest-v1"
	var old, current *biz.CustomerConfigRevision
	active := ""
	for _, revision := range []string{oldRevision, "yoyoosun-customer-trial-133.0123456789abcdef01234567"} {
		input.Revision = revision
		// Seed the historical publication through the usecase; the public new-write
		// endpoint deliberately rejects its old identity.
		stored, err := dispatcher.customerConfigUC.PublishCustomerConfig(ctx, input, 1)
		if err != nil {
			t.Fatalf("fixture publish: %v", err)
		}
		params, _ := structpb.NewStruct(map[string]any{
			"customer_key": input.CustomerKey, "revision": revision,
			"expected_product_version": input.ProductVersion, "expected_config_hash": stored.ConfigHash,
			"expected_active_revision": active,
		})
		_, result, err := dispatcher.handleCustomerConfig(ctx, "activate_customer_config", "activate", params)
		if err != nil || result.Code != errcode.OK.Code {
			t.Fatalf("activate frozen/current: %#v %v", result, err)
		}
		if revision == oldRevision {
			old = stored
		} else {
			current = stored
		}
		active = revision
	}
	params := map[string]any{
		"customer_key": input.CustomerKey, "target_revision": oldRevision,
		"expected_product_version": input.ProductVersion, "expected_config_hash": old.ConfigHash,
		"expected_active_revision": current.Revision,
	}
	for key, invalid := range map[string]string{"expected_config_hash": strings.Repeat("0", 64), "expected_active_revision": "stale-active-record"} {
		original := params[key]
		params[key] = invalid
		payload, _ := structpb.NewStruct(params)
		_, result, err := dispatcher.handleCustomerConfig(ctx, "rollback_customer_config", "invalid-rollback", payload)
		if err != nil || result.Code == errcode.OK.Code {
			t.Fatalf("rollback bypassed %s: %#v %v", key, result, err)
		}
		params[key] = original
	}
	payload, _ := structpb.NewStruct(params)
	_, result, err := dispatcher.handleCustomerConfig(ctx, "rollback_customer_config", "rollback", payload)
	if err != nil || result.Code != errcode.OK.Code {
		t.Fatalf("frozen rollback failed: %#v %v", result, err)
	}
	readback, err := dispatcher.customerConfigUC.GetCustomerConfigRevision(ctx, input.CustomerKey, oldRevision)
	if err != nil || readback.Status != biz.CustomerConfigStatusActive || readback.ConfigHash != old.ConfigHash {
		t.Fatalf("rollback did not retain frozen identity: %#v %v", readback, err)
	}
}
