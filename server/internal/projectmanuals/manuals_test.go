package projectmanuals

import (
	"strings"
	"testing"

	"server/internal/biz"
)

func TestVisibleManualsFollowActualRolesAndPermissions(t *testing.T) {
	controlPermissions := []string{biz.PermissionSystemRolePermissionManage, biz.PermissionCustomerConfigRead, biz.PermissionSystemAuditRead}
	for _, tc := range []struct {
		name  string
		admin *biz.AdminUser
		want  int
	}{
		{"anonymous", nil, 0},
		{"warehouse", &biz.AdminUser{Roles: []biz.AdminRole{{Key: biz.WarehouseRoleKey}}}, 0},
		{"manager", &biz.AdminUser{Roles: []biz.AdminRole{{Key: biz.BossRoleKey}}}, 1},
		{"account reader", &biz.AdminUser{Permissions: []string{biz.PermissionSystemUserRead}}, 1},
		{"administrator role without capabilities", &biz.AdminUser{Roles: []biz.AdminRole{{Key: biz.AdminRoleKey}}}, 0},
		{"custom operations capabilities", &biz.AdminUser{Permissions: controlPermissions}, 2},
		{"partial operations capabilities", &biz.AdminUser{Permissions: controlPermissions[:2]}, 1},
		{"super administrator", &biz.AdminUser{IsSuperAdmin: true}, 2},
		{"suspended super administrator", &biz.AdminUser{IsSuperAdmin: true, Disabled: true}, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			manuals, err := Visible(tc.admin)
			if err != nil || len(manuals) != tc.want {
				t.Fatalf("Visible = %d, %v; want %d", len(manuals), err, tc.want)
			}
			for _, manual := range manuals {
				if !strings.HasPrefix(manual.Markdown, "# "+manual.Title) || len(manual.SourceHash) != 64 {
					t.Fatalf("incomplete manual %q", manual.Key)
				}
				if tc.want == 1 && manual.Key != "administration" {
					t.Fatal("partial privileges disclosed operations handbook")
				}
			}
		})
	}
}
