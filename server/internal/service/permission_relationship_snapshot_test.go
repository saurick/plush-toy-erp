package service

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"server/internal/biz"
)

func TestPermissionRelationshipSnapshotReusesFormalProjectionAndOmitsSecrets(t *testing.T) {
	role := biz.AdminRole{Key: "sales", Name: "业务", Version: 3, Disabled: true}
	account := &biz.AdminUser{ID: 1, Username: "test", DisplayName: "测试", Phone: "private-phone", PasswordHash: "private-password", Roles: []biz.AdminRole{role}, Disabled: true}
	explanation := &biz.RoleEffectiveAccessExplanation{RoleKey: role.Key, RoleVersion: 3, RoleDisabled: true, Source: "role_disabled"}
	permission := biz.AdminPermission{Key: biz.PermissionSalesOrderRead}
	snapshot := PermissionRelationshipSnapshot([]*biz.AdminUser{account}, []biz.AdminRole{role}, []biz.AdminPermission{permission}, nil, map[string]*biz.RoleEffectiveAccessExplanation{role.Key: explanation}, nil)
	want := roleEffectiveAccessExplanationToMap(explanation)
	want["is_preview"] = false
	if !reflect.DeepEqual(snapshot["access_by_role_key"].(map[string]any)[role.Key], want) {
		t.Fatal("developer view must reuse the formal role access DTO")
	}
	if !reflect.DeepEqual(snapshot["permissions"], permissionOptionsToAny([]biz.AdminPermission{permission})) {
		t.Fatal("permission catalog must reuse the formal permission DTO")
	}
	row := snapshot["accounts"].([]any)[0].(map[string]any)
	if row["account_status"] != "suspended" || len(row["roles"].([]any)) != 1 {
		t.Fatal("disabled account/role relationships must remain observable")
	}
	encoded, err := json.Marshal(snapshot)
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{"private-phone", "private-password", "password", "token", "\"phone\""} {
		if strings.Contains(string(encoded), forbidden) {
			t.Fatalf("snapshot disclosed %q", forbidden)
		}
	}
	if snapshot["approval_settings"].(map[string]any)["partial"] != true {
		t.Fatal("missing active approval settings cannot appear complete")
	}
}
