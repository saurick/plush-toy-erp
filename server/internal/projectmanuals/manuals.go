// Package projectmanuals serves the reviewed project handbooks using the current account's access.
package projectmanuals

import (
	_ "embed"
	"encoding/json"

	"server/internal/biz"
)

//go:embed content.generated.json
var content []byte

type Manual struct {
	Key        string `json:"key"`
	Title      string `json:"title"`
	Summary    string `json:"summary"`
	Markdown   string `json:"markdown"`
	SourceHash string `json:"source_hash"`
}

// Visible uses persisted roles and permissions; requested help-role parameters do not participate.
func Visible(admin *biz.AdminUser) ([]Manual, error) {
	result := make([]Manual, 0, 2)
	if admin == nil || !admin.IsActive() {
		return result, nil
	}
	var manuals []Manual
	if err := json.Unmarshal(content, &manuals); err != nil {
		return nil, err
	}
	for _, manual := range manuals {
		if CanReadBook(admin, manual.Key) {
			result = append(result, manual)
		}
	}
	return result, nil
}

func CanReadBook(admin *biz.AdminUser, book string) bool {
	if !admin.IsActive() {
		return false
	}
	permissions := biz.PermissionKeySet(admin.Permissions)
	switch book {
	case "business":
		return true
	case "administration":
		return admin.IsSuperAdmin || biz.AdminHasRole(admin, biz.BossRoleKey) || biz.PermissionSetHasAny(permissions, biz.PermissionSystemUserRead, biz.PermissionSystemRoleRead, biz.PermissionCustomerConfigRead)
	case "operations":
		return admin.IsSuperAdmin || biz.PermissionSetHasAll(permissions, biz.PermissionSystemRolePermissionManage, biz.PermissionCustomerConfigRead, biz.PermissionSystemAuditRead)
	}
	return false
}
