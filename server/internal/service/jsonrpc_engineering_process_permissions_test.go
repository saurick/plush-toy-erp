package service

import (
	"testing"

	"server/internal/biz"
	"server/internal/errcode"
)

func TestJsonrpcDispatcher_EngineeringProcessReferencesRemainReadOnly(t *testing.T) {
	var permissions []string
	for _, role := range biz.BuiltinRoles() {
		if role.Key == biz.EngineeringRoleKey {
			permissions = role.Permissions
		}
	}
	if len(permissions) == 0 {
		t.Fatal("engineering role must be registered")
	}
	repo := &stubMasterDataJSONRPCRepo{}
	j := newMasterDataJSONRPCTestData(t, repo, workflowJSONRPCAdmin([]string{biz.EngineeringRoleKey}, permissions...))
	for _, method := range []string{"list_processes", "get_process"} {
		_, result, err := j.handleMasterData(workflowJSONRPCAdminContext(), method, method, mustJSONRPCStruct(t, map[string]any{"id": 1, "limit": 20}))
		if err != nil || result == nil || result.Code != errcode.OK.Code {
			t.Fatalf("read-only reference %s: result=%v err=%v", method, result, err)
		}
	}
	for _, method := range []string{"create_process", "update_process", "set_process_active"} {
		_, result, err := j.handleMasterData(workflowJSONRPCAdminContext(), method, method, mustJSONRPCStruct(t, map[string]any{"id": 1, "code": "PROC-ENG", "name": "工程不可维护", "active": false}))
		if err != nil || result == nil || result.Code != errcode.PermissionDenied.Code {
			t.Fatalf("engineering must not call %s: result=%v err=%v", method, result, err)
		}
	}
	if repo.createdProcess != nil || repo.updatedProcess != nil || repo.processActiveCalls != 0 {
		t.Fatal("denied process maintenance reached the repository")
	}
}
