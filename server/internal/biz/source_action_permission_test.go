package biz

import "testing"

func TestPublicSourceActionReadPermissionContractsAreUniqueReadCapabilities(t *testing.T) {
	definitions := make(map[string]string)
	for _, definition := range AllPermissionDefinitions() {
		definitions[definition.Key] = definition.Action
	}
	seenActions := map[string]struct{}{}
	for _, contract := range PublicSourceActionReadPermissionContracts() {
		identity := contract.Domain + "." + contract.Method
		if contract.Domain == "" || contract.Method == "" || len(contract.Rules) == 0 {
			t.Errorf("incomplete source action contract: %#v", contract)
			continue
		}
		if _, duplicate := seenActions[identity]; duplicate {
			t.Errorf("duplicate source action contract %q", identity)
		}
		seenActions[identity] = struct{}{}
		seenRules := map[string]struct{}{}
		for _, rule := range contract.Rules {
			ruleIdentity := rule.PermissionKey + "/" + rule.Condition
			if _, duplicate := seenRules[ruleIdentity]; duplicate {
				t.Errorf("%s repeats rule %#v", identity, rule)
			}
			seenRules[ruleIdentity] = struct{}{}
			action, ok := definitions[rule.PermissionKey]
			if !ok || action != "read" {
				t.Errorf("%s source permission %q is not a registered read capability", identity, rule.PermissionKey)
			}
		}
	}
}

func TestSourceActionReadPermissionResolutionAndUsageStayInSync(t *testing.T) {
	for _, contract := range PublicSourceActionReadPermissionContracts() {
		conditions := make([]string, 0, len(contract.Rules))
		want := make([]string, 0, len(contract.Rules))
		seen := map[string]struct{}{}
		for _, rule := range contract.Rules {
			if rule.Condition != "" {
				conditions = append(conditions, rule.Condition)
			}
			if _, duplicate := seen[rule.PermissionKey]; !duplicate {
				seen[rule.PermissionKey] = struct{}{}
				want = append(want, rule.PermissionKey)
			}
			usage, ok := PermissionUsageFor(rule.PermissionKey)
			if !ok || !permissionUsageContainsBackendMethod(usage, PermissionBackendMethod{Domain: contract.Domain, Method: contract.Method}) {
				t.Errorf("permission usage %q missing source action %s.%s", rule.PermissionKey, contract.Domain, contract.Method)
			}
		}
		got, ok := SourceActionReadPermissions(contract.Domain, contract.Method, conditions...)
		if !ok || !sameStringSlice(got, want) {
			t.Errorf("%s.%s permissions=%v ok=%v want=%v", contract.Domain, contract.Method, got, ok, want)
		}
		candidates, ok := SourceActionReadPermissionCandidates(contract.Domain, contract.Method)
		if !ok || !sameStringSlice(candidates, want) {
			t.Errorf("%s.%s candidates=%v ok=%v want=%v", contract.Domain, contract.Method, candidates, ok, want)
		}
	}
}

func TestSourceActionReadPermissionContractDefensiveCopyAndFinanceType(t *testing.T) {
	contracts := PublicSourceActionReadPermissionContracts()
	contracts[0].Rules[0].PermissionKey = "mutated"
	if got := PublicSourceActionReadPermissionContracts()[0].Rules[0].PermissionKey; got == "mutated" {
		t.Fatal("source action contract leaked mutable rule slice")
	}
	for factType, want := range map[string]string{
		FinanceFactPayable:    SourceReadConditionFinancePayable,
		FinanceFactReceivable: SourceReadConditionFinanceReceivable,
		FinanceFactInvoice:    SourceReadConditionFinanceInvoice,
	} {
		if got, ok := FinanceSourceReadCondition(factType); !ok || got != want {
			t.Errorf("FinanceSourceReadCondition(%q)=(%q,%v), want (%q,true)", factType, got, ok, want)
		}
	}
	if _, ok := FinanceSourceReadCondition(FinanceFactReconciliation); ok {
		t.Fatal("reconciliation must not be accepted as a reconciliation source")
	}
}

func sameStringSlice(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}
