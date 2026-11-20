package biz

import "context"

const ProcessInitiationAuditEventPrefix = "process_instance.created/"

// Capture only an unambiguous identity from the authenticated request. A task's
// next owner and an account's later role assignments are not initiation evidence.
func WorkflowInitiatorRoleKey(ctx context.Context, actorID int) string {
	admin, ok := GetCurrentAdminFromContext(ctx)
	if !ok || actorID <= 0 || admin.ID != actorID || !admin.IsActive() {
		return ""
	}
	if admin.IsSuperAdmin {
		return AdminRoleKey
	}
	roles := AdminRoleKeys(admin)
	if len(roles) == 1 {
		return roles[0]
	}
	return ""
}
