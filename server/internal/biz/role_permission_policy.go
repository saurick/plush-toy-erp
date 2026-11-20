package biz

import "errors"

var ErrRolePermissionPolicy = errors.New("role has no registered permission template")

// RolePermissionPolicy separates a role's initial grants from the business
// permissions an administrator may assign. Customer entitlements and domain
// guards continue to narrow the saved grants.
type RolePermissionPolicy struct {
	TemplateKey string
	Registered  bool
	Defaults    []string
	Assignable  []string
}

func RolePermissionPolicyFor(role AdminRole) RolePermissionPolicy {
	out := RolePermissionPolicy{
		TemplateKey: NormalizeRoleKey(role.Key),
		Defaults:    []string{}, Assignable: []string{},
	}
	if IsSystemManagedRole(role) {
		return out
	}
	for _, definition := range BuiltinRoles() {
		if definition.Key != out.TemplateKey {
			continue
		}
		out.Registered = true
		out.Defaults = NormalizePermissionKeys(definition.Permissions)
		break
	}
	if out.Registered {
		for _, definition := range BuiltinPermissions() {
			if definition.Class == PermissionClassBusiness && definition.Assignable && !definition.NonProductionOnly {
				out.Assignable = append(out.Assignable, definition.Key)
			}
		}
	}
	return out
}

func ValidateRolePermissionPolicy(role AdminRole, permissionKeys []string) error {
	if !RolePermissionPolicyFor(role).Registered {
		return ErrRolePermissionPolicy
	}
	return ValidateAssignablePermissionKeys(permissionKeys)
}
