package service

import (
	"testing"

	"server/internal/biz"
	"server/internal/customertrialconfig"
	"server/internal/errcode"

	"google.golang.org/protobuf/types/known/structpb"
)

func customerTrialConfigInputForTest() biz.CustomerConfigPublishInput {
	return biz.CustomerConfigPublishInput{
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

func TestCustomerTrialConfigTransitionGateUsesExactProductVersion(t *testing.T) {
	disabled := &jsonrpcDispatcher{}
	result := disabled.requireCustomerTrialConfigProductVersion(customertrialconfig.ProductVersion)
	if result == nil || result.Code != errcode.PermissionDenied.Code {
		t.Fatalf("disabled transition gate result = %#v, want permission denied", result)
	}

	enabled := &jsonrpcDispatcher{trialConfigEnabled: true}
	if result := enabled.requireCustomerTrialConfigProductVersion(customertrialconfig.ProductVersion); result != nil {
		t.Fatalf("enabled transition gate result = %#v, want nil", result)
	}
	if result := disabled.requireCustomerTrialConfigProductVersion("formal-product-version"); result != nil {
		t.Fatalf("formal transition gate result = %#v, want nil", result)
	}
	result = enabled.requireCustomerTrialConfigProductVersion("customer-trial-133-test-2026.07.15-v1")
	if result == nil || result.Code != errcode.InvalidParam.Code {
		t.Fatalf("invalid trial transition gate result = %#v, want invalid param", result)
	}
}
