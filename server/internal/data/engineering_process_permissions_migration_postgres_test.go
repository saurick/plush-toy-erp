package data

import (
	"context"
	"os"
	"slices"
	"testing"

	"server/internal/biz"
)

func TestAdminManagePostgresEngineeringProcessReferenceMigration(t *testing.T) {
	ctx := context.Background()
	db, _ := openPurchaseReceiptPostgresTestData(t)
	migration, err := os.ReadFile("model/migrate/20261029060000_engineering_process_references.sql")
	if err != nil {
		t.Fatal(err)
	}
	for _, roleType := range []biz.RoleType{biz.RoleTypeBusinessDefault, biz.RoleTypeCustom} {
		t.Run(string(roleType), func(t *testing.T) {
			tx, err := db.sqldb.BeginTx(ctx, nil)
			if err != nil {
				t.Fatal(err)
			}
			defer func() { _ = tx.Rollback() }()
			for _, permission := range biz.BuiltinPermissions() {
				_, err = tx.ExecContext(ctx, `INSERT INTO permissions(permission_key,name,module,action,resource,builtin,created_at,updated_at) VALUES($1,$2,$3,$4,$5,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(permission_key) DO NOTHING`, permission.Key, permission.Name, permission.Module, permission.Action, permission.Resource)
				if err != nil {
					t.Fatal(err)
				}
			}
			before := []string{biz.PermissionProcessRead, biz.PermissionProcessCreate, biz.PermissionProcessUpdate, biz.PermissionProcessDisable, biz.PermissionBOMUpdate, biz.PermissionMaterialUpdate}
			slices.Sort(before)
			ids := map[string]int{}
			for _, key := range []string{biz.EngineeringRoleKey, biz.PMCRoleKey} {
				var id int
				err = tx.QueryRowContext(ctx, `INSERT INTO roles(role_key,name,role_type,version,disabled,created_at,updated_at) VALUES($1,$1,$2,10,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(role_key) DO UPDATE SET role_type=$2,version=10,disabled=true RETURNING id`, key, roleType).Scan(&id)
				if err != nil {
					t.Fatal(err)
				}
				ids[key] = id
				if _, err = tx.ExecContext(ctx, `DELETE FROM role_permissions WHERE role_id=$1`, id); err != nil {
					t.Fatal(err)
				}
				for _, grant := range before {
					if _, err = tx.ExecContext(ctx, `INSERT INTO role_permissions(role_id,permission_id,created_at) SELECT $1,id,CURRENT_TIMESTAMP FROM permissions WHERE permission_key=$2`, id, grant); err != nil {
						t.Fatal(err)
					}
				}
			}
			for replay := 0; replay < 2; replay++ {
				if _, err = tx.ExecContext(ctx, string(migration)); err != nil {
					t.Fatal(err)
				}
				for key, id := range ids {
					wantVersion := 10
					want := before
					if key == biz.EngineeringRoleKey && roleType == biz.RoleTypeBusinessDefault {
						wantVersion++
						want = []string{biz.PermissionBOMUpdate, biz.PermissionMaterialUpdate, biz.PermissionProcessRead}
						slices.Sort(want)
					}
					var version int
					var disabled bool
					if err = tx.QueryRowContext(ctx, `SELECT version,disabled FROM roles WHERE id=$1`, id).Scan(&version, &disabled); err != nil {
						t.Fatal(err)
					}
					if version != wantVersion || !disabled {
						t.Fatalf("%s replay %d: version=%d disabled=%v", key, replay, version, disabled)
					}
					rows, err := tx.QueryContext(ctx, `SELECT p.permission_key FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=$1 ORDER BY p.permission_key`, id)
					if err != nil {
						t.Fatal(err)
					}
					got := []string{}
					for rows.Next() {
						var permission string
						if err = rows.Scan(&permission); err != nil {
							t.Fatal(err)
						}
						got = append(got, permission)
					}
					if err = rows.Close(); err != nil {
						t.Fatal(err)
					}
					if err = rows.Err(); err != nil {
						t.Fatal(err)
					}
					if !slices.Equal(got, want) {
						t.Fatalf("%s replay %d: got=%v want=%v", key, replay, got, want)
					}
				}
			}
		})
	}
}
