package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestRPCParameterExamplesRejectInvalidContainersAndMissingFields(t *testing.T) {
	fields := []rpcSourceField{
		{Name: "id", Type: "integer", Required: "必填"},
		{Name: "items", Type: "array", Required: "必填"},
		{Name: "items[]", Type: "object"},
		{Name: "items[].quantity", Type: "string", Required: "必填"},
		{Name: "options", Type: "object"},
		{Name: "options.note", Type: "string", Nullable: true},
		{Name: "raw", Type: "json"},
	}
	for _, tt := range []struct {
		name   string
		params map[string]any
		valid  bool
	}{
		{"valid", map[string]any{"id": float64(1), "items": []any{map[string]any{"quantity": "1.25"}}}, true},
		{"required absent", map[string]any{}, false},
		{"array replaced by string", map[string]any{"id": float64(1), "items": "invalid"}, false},
		{"array item replaced by string", map[string]any{"id": float64(1), "items": []any{"invalid"}}, false},
		{"nested required absent", map[string]any{"id": float64(1), "items": []any{map[string]any{}}}, false},
		{"nested number in decimal", map[string]any{"id": float64(1), "items": []any{map[string]any{"quantity": float64(1)}}}, false},
		{"object replaced by string", map[string]any{"id": float64(1), "items": []any{}, "options": "invalid"}, false},
		{"nullable nested", map[string]any{"id": float64(1), "items": []any{}, "options": map[string]any{"note": nil}}, true},
		{"null strict id", map[string]any{"id": nil, "items": []any{}}, false},
		{"unknown nested", map[string]any{"id": float64(1), "items": []any{}, "options": map[string]any{"unknown": true}}, false},
		{"dynamic json", map[string]any{"id": float64(1), "items": []any{}, "raw": map[string]any{"arbitrary": []any{1}}}, true},
	} {
		t.Run(tt.name, func(t *testing.T) {
			err := validateRPCParameterExample(fields, tt.params, "test.method")
			if (err == nil) != tt.valid {
				t.Fatalf("valid=%v: %v", tt.valid, err)
			}
		})
	}
}

func TestRPCExampleKeysRejectDuplicateMethodsAndNestedFields(t *testing.T) {
	for _, source := range []string{
		`{"inventory.list":{},"inventory.list":{}}`,
		`{"inventory.list":{"params":{"status":"ACTIVE","status":"HOLD"}}}`,
		`{"inventory.list":{"data":[{"quantity":"12.5","quantity":"99"}]}}`,
	} {
		if validateRPCExampleKeys([]byte(source)) == nil {
			t.Fatal("duplicate example or wire field was accepted")
		}
	}
	if err := validateRPCExampleKeys([]byte(`{"a":{"id":1},"b":{"id":2}}`)); err != nil {
		t.Fatalf("separate method scopes must remain independent: %v", err)
	}
}

func TestRPCReviewRetainsShapesWithoutRelaxingGenerationValidation(t *testing.T) {
	repository, err := filepath.Abs("../../..")
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "server/cmd/public-contracts/testdata"), 0o700); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"internal", "api"} {
		if err := os.Symlink(filepath.Join(repository, "server", name), filepath.Join(root, "server", name)); err != nil {
			t.Fatal(err)
		}
	}
	raw, err := os.ReadFile(filepath.Join(repository, "server/cmd/public-contracts/testdata/rpc_examples.json"))
	if err != nil {
		t.Fatal(err)
	}
	var examples map[string]rpcExample
	if err := json.Unmarshal(raw, &examples); err != nil {
		t.Fatal(err)
	}
	delete(examples, "inventory.list_inventory_lots")
	raw, err = json.Marshal(examples)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "server/cmd/public-contracts/testdata/rpc_examples.json"), raw, 0o600); err != nil {
		t.Fatal(err)
	}
	methods, err := rpcMethods(root)
	if err != nil {
		t.Fatal(err)
	}
	index, err := rpcInspection(root, methods)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := rpcCallContracts(root, methods, index); err == nil {
		t.Fatal("generation accepted a missing example")
	}
	var issues []rpcExampleIssue
	calls, err := rpcCallContracts(root, methods, index, &issues)
	if err != nil || len(issues) == 0 {
		t.Fatalf("review did not retain explicit issues: %v %#v", err, issues)
	}
	if calls["inventory"]["list_inventory_lots"].DataType != "object" || len(calls["inventory"]["list_inventory_lots"].Parameters) == 0 {
		t.Fatal("review lost the real backend shape")
	}
	if _, err := rpcCallContracts(root, methods, index); err == nil {
		t.Fatal("review relaxed a subsequent generation check")
	}
}

func TestRPCParameterExamplesRespectConditionsAndArrayItemScope(t *testing.T) {
	fields := []rpcSourceField{
		{Name: "action", Type: "string"},
		{Name: "execution_mode", Type: "string", Required: "条件必填", RequiredWhen: []rpcParameterCondition{{Field: "action", Equals: "start"}}},
		{Name: "defect_rate_operator", Type: "string", Nullable: true, RequiredWhen: []rpcParameterCondition{{Field: "defect_rate_percent", Presence: "nonnull"}}},
		{Name: "defect_rate_percent", Type: "string", Nullable: true, RequiredWhen: []rpcParameterCondition{{Field: "defect_rate_operator", Presence: "nonnull"}}},
		{Name: "items", Type: "array"},
		{Name: "items[].selected", Type: "boolean"},
		{Name: "items[].id", Type: "integer", RequiredWhen: []rpcParameterCondition{{Field: "items[].selected", Equals: "true"}}},
	}
	for _, tt := range []struct {
		name   string
		params map[string]any
		valid  bool
	}{
		{"inactive", map[string]any{"action": "finish"}, true},
		{"start missing mode", map[string]any{"action": "start"}, false},
		{"start with mode", map[string]any{"action": "start", "execution_mode": "inhouse"}, true},
		{"pair omitted", map[string]any{}, true},
		{"pair null", map[string]any{"defect_rate_operator": nil, "defect_rate_percent": nil}, true},
		{"pair partial", map[string]any{"defect_rate_operator": "LE"}, false},
		{"pair partial null", map[string]any{"defect_rate_operator": "LE", "defect_rate_percent": nil}, false},
		{"pair supplied", map[string]any{"defect_rate_operator": "LE", "defect_rate_percent": "1.5"}, true},
		{"array other item does not satisfy", map[string]any{"items": []any{map[string]any{"selected": true}, map[string]any{"selected": false, "id": float64(1)}}}, false},
		{"array proper scope", map[string]any{"items": []any{map[string]any{"selected": false}, map[string]any{"selected": true, "id": float64(1)}}}, true},
	} {
		t.Run(tt.name, func(t *testing.T) {
			err := validateRPCParameterExample(fields, tt.params, "test.method")
			if (err == nil) != tt.valid {
				t.Fatalf("valid=%v: %v", tt.valid, err)
			}
		})
	}
}

func TestRPCResponseExamplesValidateProjectionTypesAndNullableData(t *testing.T) {
	shape := &rpcWireShape{Type: "object", Nullable: true, Fields: map[string]*rpcWireShape{"rows": {Type: "array", Item: &rpcWireShape{Type: "object", Fields: map[string]*rpcWireShape{"quantity": {Type: "string"}, "id": {Type: "integer"}}}}}}
	for _, tt := range []struct {
		name  string
		value any
		valid bool
	}{
		{"empty data", nil, true},
		{"empty rows", map[string]any{"rows": []any{}}, true},
		{"projection", map[string]any{"rows": []any{map[string]any{"id": float64(1)}}}, true},
		{"unknown return field", map[string]any{"typo": true}, false},
		{"wrong nested type", map[string]any{"rows": []any{map[string]any{"quantity": float64(1)}}}, false},
		{"wrong container", map[string]any{"rows": "invalid"}, false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			err := validateRPCWireExample(shape, tt.value, "data")
			if (err == nil) != tt.valid {
				t.Fatalf("valid=%v: %v", tt.valid, err)
			}
		})
	}
	if err := validateRPCWireExample(nil, nil, "data"); err == nil {
		t.Fatal("missing schema must not validate null")
	}
}

func TestAllRegisteredRPCCallsHaveValidatedExamples(t *testing.T) {
	methods, err := rpcMethods("../../..")
	if err != nil {
		t.Fatal(err)
	}
	index, err := rpcInspection("../../..", methods)
	if err != nil {
		t.Fatal(err)
	}
	calls, err := rpcCallContracts("../../..", methods, index)
	if err != nil {
		t.Fatal(err)
	}
	count, fixtures := 0, 0
	for domain, names := range methods {
		for _, method := range names {
			count++
			contract, ok := calls[domain][method]
			if !ok {
				t.Fatalf("missing %s.%s", domain, method)
			}
			if contract.Example.Basis == "handler-fixture" {
				fixtures++
				if contract.Example.Source == nil || contract.Example.Source.Line <= 0 {
					t.Fatal("missing fixture source")
				}
			}
		}
	}
	if count == 0 || fixtures == 0 || fixtures >= count {
		t.Fatalf("missing method or example provenance coverage: %d methods, %d fixtures", count, fixtures)
	}
}
