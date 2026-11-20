package main

import (
	"go/parser"
	"go/token"
	"reflect"
	"testing"

	"server/internal/biz"
)

func TestPublicSourcePermissionsMatchRuntimeGuards(t *testing.T) {
	got, err := collect("../../..")
	if err != nil {
		t.Fatal(err)
	}
	want := map[string][]sourcePermissionRule{}
	for _, contract := range biz.PublicSourceActionReadPermissionContracts() {
		for _, rule := range contract.Rules {
			key := contract.Domain + "." + contract.Method
			want[key] = append(want[key], sourcePermissionRule{Permission: rule.PermissionKey, Condition: rule.Condition})
		}
	}
	if !reflect.DeepEqual(got.SourceActionPermissions, want) {
		t.Fatal("generated source permissions differ from service guard truth")
	}
	labels := map[string]string{}
	for _, permission := range biz.AllPermissionDefinitions() {
		labels[permission.Key] = permission.Name
	}
	if !reflect.DeepEqual(got.PermissionLabels, labels) {
		t.Fatal("generated permission labels differ from RBAC truth")
	}
}

func TestPublicSourcePermissionsRejectUnresolvedRules(t *testing.T) {
	rbac, err := parse("../../..", "server/internal/biz/rbac.go")
	if err != nil {
		t.Fatal(err)
	}
	for _, expression := range []string{
		`sourceReadRules(PermissionMissing)`,
		`unknownRules()`,
		`[]SourceActionReadPermissionRule{{PermissionKey: PermissionPurchaseOrderRead, Condition: UnknownCondition}}`,
		`[]SourceActionReadPermissionRule{}`,
	} {
		source, err := parser.ParseFile(token.NewFileSet(), "fixture.go", `package fixture; var publicSourceActionReadPermissionContracts = []Contract{{Domain: "purchase", Method: "create", Rules: `+expression+`}}`, 0)
		if err != nil {
			t.Fatal(err)
		}
		if _, _, err := sourcePermissions(rbac, source); err == nil {
			t.Fatalf("accepted unresolved source rules: %s", expression)
		}
	}
}

func TestPublicPermissionLabelsMatchRBAC(t *testing.T) {
	rbac, err := parse("../../..", "server/internal/biz/rbac.go")
	if err != nil {
		t.Fatal(err)
	}
	got, err := permissionLabels(rbac)
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]string{}
	for _, permission := range biz.AllPermissionDefinitions() {
		want[permission.Key] = permission.Name
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatal("permission labels differ from RBAC truth")
	}
}

func TestPublicPermissionLabelsRejectInvalidRegistries(t *testing.T) {
	for _, registry := range []string{
		`withBuiltinPermissionMetadata([]PermissionDefinition{{Key: PermissionMissing, Name: "查看"}})`,
		`withBuiltinPermissionMetadata([]PermissionDefinition{{Key: PermissionRead, Name: ""}})`,
		`withBuiltinPermissionMetadata([]PermissionDefinition{{Key: PermissionRead, Name: "查看"}, {Key: PermissionRead, Name: "重复"}})`,
		`[]PermissionDefinition{{Key: PermissionRead, Name: "查看"}}`,
	} {
		rbac, err := parser.ParseFile(token.NewFileSet(), "fixture.go", `package fixture; const PermissionRead = "sample.read"; var builtinPermissions = `+registry, 0)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := permissionLabels(rbac); err == nil {
			t.Fatalf("accepted invalid permission registry: %s", registry)
		}
	}
}
