package biz

import (
	"reflect"
	"testing"
)

func TestBuiltinPermissionUsageRegistryCoversEveryDefinition(t *testing.T) {
	definitions := AllPermissionDefinitions()
	definitionKeys := make(map[string]struct{}, len(definitions))
	for _, definition := range definitions {
		definitionKeys[definition.Key] = struct{}{}
		usage, ok := PermissionUsageFor(definition.Key)
		if !ok {
			t.Errorf("permission %q has no explicit usage", definition.Key)
			continue
		}
		if usage.PermissionKey != definition.Key {
			t.Errorf("permission %q usage key = %q", definition.Key, usage.PermissionKey)
		}
		if len(usage.Surfaces) == 0 {
			t.Errorf("permission %q has no usage surface", definition.Key)
		}
	}
	for permissionKey := range builtinPermissionUsages {
		if _, ok := definitionKeys[permissionKey]; !ok {
			t.Errorf("usage registry contains unknown permission %q", permissionKey)
		}
	}
}

func TestBuiltinPermissionUsageSurfacesAreCompleteAndMenuAligned(t *testing.T) {
	menus := make(map[string]AdminMenu, len(builtinAdminMenus))
	for _, menu := range BuiltinAdminMenus() {
		menus[menu.Key] = menu
	}

	for _, usage := range BuiltinPermissionUsages() {
		seenControls := make(map[string]struct{}, len(usage.Surfaces))
		for _, surface := range usage.Surfaces {
			if surface.ControlKey == "" || surface.ControlLabel == "" || surface.ControlType == "" {
				t.Errorf("permission %q has incomplete control metadata: %#v", usage.PermissionKey, surface)
			}
			controlIdentity := surface.PageKey + "/" + surface.SectionKey + "/" + surface.ControlKey
			if _, exists := seenControls[controlIdentity]; exists {
				t.Errorf("permission %q repeats control %q", usage.PermissionKey, controlIdentity)
			}
			seenControls[controlIdentity] = struct{}{}
			for _, method := range surface.BackendMethods {
				if method.Domain == "" || method.Method == "" {
					t.Errorf("permission %q has incomplete backend method: %#v", usage.PermissionKey, method)
				}
			}

			if usage.BackendOnly {
				if surface.PageKey != "" || surface.PageLabel != "" || surface.PagePath != "" {
					t.Errorf("backend-only permission %q advertises product page %#v", usage.PermissionKey, surface)
				}
				continue
			}
			if surface.PageKey == "" || surface.PageLabel == "" || surface.PagePath == "" || surface.SectionKey == "" || surface.SectionLabel == "" {
				t.Errorf("permission %q has incomplete page metadata: %#v", usage.PermissionKey, surface)
				continue
			}
			if menu, ok := menus[surface.PageKey]; ok {
				if surface.PageLabel != menu.Label || surface.PagePath != menu.Path {
					t.Errorf("permission %q page %q drifted from menu: surface=%#v menu=%#v", usage.PermissionKey, surface.PageKey, surface, menu)
				}
				if !reflect.DeepEqual(surface.RequiredAny, menu.RequiredAny) || !reflect.DeepEqual(surface.RequiredAll, menu.RequiredAll) {
					t.Errorf("permission %q page %q requirements drifted: any=%v/%v all=%v/%v", usage.PermissionKey, surface.PageKey, surface.RequiredAny, menu.RequiredAny, surface.RequiredAll, menu.RequiredAll)
				}
			}
		}
	}
}

func TestEveryMenuRequirementHasMatchingPermissionUsage(t *testing.T) {
	for _, menu := range BuiltinAdminMenus() {
		permissionKeys := append(append([]string(nil), menu.RequiredAny...), menu.RequiredAll...)
		for _, permissionKey := range permissionKeys {
			usage, ok := PermissionUsageFor(permissionKey)
			if !ok {
				t.Errorf("menu %q requires unregistered permission %q", menu.Key, permissionKey)
				continue
			}
			found := false
			for _, surface := range usage.Surfaces {
				if surface.PageKey == menu.Key {
					found = true
					break
				}
			}
			if !found {
				t.Errorf("menu %q requirement %q has no matching usage surface", menu.Key, permissionKey)
			}
		}
	}
}

func TestDebugPermissionsAreBackendOnly(t *testing.T) {
	for _, definition := range AllPermissionDefinitions() {
		if definition.Class != PermissionClassDebug {
			continue
		}
		usage, ok := PermissionUsageFor(definition.Key)
		if !ok || !usage.BackendOnly {
			t.Errorf("debug permission %q must be backend-only, usage=%#v", definition.Key, usage)
			continue
		}
		for _, surface := range usage.Surfaces {
			if surface.PagePath != "" {
				t.Errorf("debug permission %q exposes product path %q", definition.Key, surface.PagePath)
			}
		}
	}
}

func TestPermissionUsageForReturnsDefensiveCopy(t *testing.T) {
	first, ok := PermissionUsageFor(PermissionCustomerRead)
	if !ok || len(first.Surfaces) == 0 {
		t.Fatal("customer read usage missing")
	}
	first.Surfaces[0].PagePath = "/mutated"
	first.Surfaces[0].RequiredAny[0] = "mutated.permission"

	second, ok := PermissionUsageFor(PermissionCustomerRead)
	if !ok {
		t.Fatal("customer read usage missing after mutation")
	}
	if second.Surfaces[0].PagePath == "/mutated" || second.Surfaces[0].RequiredAny[0] == "mutated.permission" {
		t.Fatalf("registry leaked mutable slices: %#v", second)
	}
}

func TestProductionMaterialIssuePermissionUsageNamesExactSourceDrivenMethod(t *testing.T) {
	usage, ok := PermissionUsageFor(PermissionProductionMaterialIssueCreate)
	if !ok || usage.BackendOnly || len(usage.Surfaces) != 1 {
		t.Fatalf("production material issue usage=%#v ok=%v", usage, ok)
	}
	surface := usage.Surfaces[0]
	if surface.ControlKey != "create-production-material-issue" || len(surface.BackendMethods) != 1 ||
		surface.BackendMethods[0].Domain != "operational_fact" ||
		surface.BackendMethods[0].Method != "create_production_material_issue_from_order" {
		t.Fatalf("production material issue usage surface=%#v", surface)
	}
}

func TestQualityPermissionUsageCoversOutsourcingReturnSourceCommands(t *testing.T) {
	readUsage, ok := PermissionUsageFor(PermissionQualityInspectionRead)
	if !ok {
		t.Fatal("quality inspection read usage missing")
	}
	createUsage, ok := PermissionUsageFor(PermissionQualityInspectionCreate)
	if !ok {
		t.Fatal("quality inspection create usage missing")
	}

	hasMethod := func(usage PermissionUsage, pageKey, method string) bool {
		for _, surface := range usage.Surfaces {
			if surface.PageKey != pageKey {
				continue
			}
			for _, backendMethod := range surface.BackendMethods {
				if backendMethod.Domain == "quality" && backendMethod.Method == method {
					return true
				}
			}
		}
		return false
	}

	if !hasMethod(readUsage, "processing-contracts", "list_outsourcing_return_quality_inspections") {
		t.Fatalf("quality read usage missing outsourcing return list: %#v", readUsage)
	}
	if !hasMethod(createUsage, "processing-contracts", "create_quality_inspection_from_outsourcing_return") {
		t.Fatalf("quality create usage missing outsourcing return command: %#v", createUsage)
	}
}

func TestFinancePayablePermissionUsageCoversSourcePages(t *testing.T) {
	usage, ok := PermissionUsageFor(PermissionFinancePayableConfirm)
	if !ok {
		t.Fatal("finance payable confirm usage missing")
	}
	hasMethod := func(pageKey, method string) bool {
		for _, surface := range usage.Surfaces {
			if surface.PageKey != pageKey {
				continue
			}
			for _, backendMethod := range surface.BackendMethods {
				if backendMethod.Domain == "operational_fact" && backendMethod.Method == method {
					return true
				}
			}
		}
		return false
	}
	if !hasMethod("inbound", "create_payable_from_purchase_receipt") {
		t.Fatalf("finance payable usage missing purchase receipt source: %#v", usage)
	}
	if !hasMethod("processing-contracts", "create_payable_from_outsourcing_return") {
		t.Fatalf("finance payable usage missing outsourcing return source: %#v", usage)
	}
	if !hasMethod("payables", "post_finance_fact") {
		t.Fatalf("finance payable usage missing payable status action: %#v", usage)
	}
}
