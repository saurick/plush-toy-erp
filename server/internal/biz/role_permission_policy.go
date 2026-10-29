package biz

import "errors"

var ErrRolePermissionPolicy = errors.New("role permissions do not match the registered responsibility template")

// RolePermissionPolicy describes the product-owned boundary of a role. It is
// derived from the registered role, never from the permissions being edited.
// Customer entitlements and domain guards continue to narrow these abilities.
type RolePermissionPolicy struct {
	TemplateKey     string
	Registered      bool
	Required        []string
	Optional        []string
	MissingRequired []string
	OutsideTemplate []string
}

// These presentation capabilities do not authorize source documents or facts.
// Source reads required by a role's duties stay in the required set.
var optionalRoleAssistance = []string{
	PermissionERPPrintTemplateRead,
	PermissionERPBusinessDashboardRead,
}

func RolePermissionPolicyFor(role AdminRole) RolePermissionPolicy {
	out := RolePermissionPolicy{
		TemplateKey: NormalizeRoleKey(role.Key),
		Required:    []string{}, Optional: []string{},
		MissingRequired: []string{}, OutsideTemplate: []string{},
	}
	if IsSystemManagedRole(role) {
		return out
	}
	for _, definition := range BuiltinRoles() {
		if definition.Key != out.TemplateKey {
			continue
		}
		out.Registered = true
		out.Optional = append(out.Optional, optionalRoleAssistance...)
		optional := PermissionKeySet(out.Optional)
		for _, key := range definition.Permissions {
			if _, ok := optional[key]; !ok {
				out.Required = append(out.Required, key)
			}
		}
		break
	}
	out.Required = NormalizePermissionKeys(out.Required)
	out.Optional = NormalizePermissionKeys(out.Optional)
	granted := PermissionKeySet(role.Permissions)
	allowed := PermissionKeySet(append(append([]string{}, out.Required...), out.Optional...))
	for _, key := range out.Required {
		if _, ok := granted[key]; !ok {
			out.MissingRequired = append(out.MissingRequired, key)
		}
	}
	for _, key := range role.Permissions {
		if _, ok := allowed[key]; !ok {
			out.OutsideTemplate = append(out.OutsideTemplate, key)
		}
	}
	return out
}

func ValidateRolePermissionPolicy(role AdminRole, permissionKeys []string) error {
	role.Permissions = permissionKeys
	policy := RolePermissionPolicyFor(role)
	if !policy.Registered || len(policy.MissingRequired) > 0 || len(policy.OutsideTemplate) > 0 {
		return ErrRolePermissionPolicy
	}
	return nil
}
