package data

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"
)

func TestFulfillmentRoleMigrationPreservesCustomRolesAndSeparatesReceiving(t *testing.T) {
	content, err := os.ReadFile(filepath.Join("model", "migrate", "20260916090000_fulfillment_role_handoffs.sql"))
	if err != nil {
		t.Fatal(err)
	}
	for _, populated := range []bool{false, true} {
		t.Run(map[bool]string{false: "fresh", true: "existing roles"}[populated], func(t *testing.T) {
			db, err := sql.Open("sqlite3", ":memory:")
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() {
				if err := db.Close(); err != nil {
					t.Errorf("close migration test database: %v", err)
				}
			})
			db.SetMaxOpenConns(1)
			_, err = db.Exec(`CREATE TABLE roles (id integer PRIMARY KEY, role_key text, role_type text, version integer, updated_at text);
CREATE TABLE permissions (id integer PRIMARY KEY, permission_key text UNIQUE);
CREATE TABLE role_permissions (role_id integer, permission_id integer, created_at text, PRIMARY KEY(role_id,permission_id));
INSERT INTO permissions VALUES (1,'purchase.receipt.create'),(2,'outsourcing.return_receipt.create'),(3,'outsourcing.order.confirm'),(4,'warehouse.inbound.confirm'),(5,'production.wip.execute'),(6,'purchase.order.read');`)
			if err != nil {
				t.Fatal(err)
			}
			if populated {
				_, err = db.Exec(`INSERT INTO roles VALUES (1,'warehouse','business_default',7,'before'),(2,'purchase','business_default',7,'before'),(3,'production','business_default',7,'before'),(4,'production','custom',7,'before'),(5,'finance','business_default',7,'before');
INSERT INTO role_permissions VALUES (1,4,'before'),(2,1,'before'),(2,2,'before'),(2,3,'before'),(3,2,'before'),(3,3,'before'),(3,5,'before'),(4,2,'before'),(4,3,'before');`)
				if err != nil {
					t.Fatal(err)
				}
			}
			if _, err = db.Exec(string(content)); err != nil {
				t.Fatal(err)
			}
			if !populated {
				var count int
				if err = db.QueryRow(`SELECT count(*) FROM role_permissions`).Scan(&count); err != nil || count != 0 {
					t.Fatalf("fresh migration manufactured roles: %d %v", count, err)
				}
				return
			}
			for _, tc := range []struct{ role, permission, want int }{{1, 1, 1}, {1, 4, 1}, {1, 6, 1}, {2, 1, 0}, {2, 2, 0}, {2, 3, 1}, {3, 2, 0}, {3, 3, 0}, {3, 5, 1}, {4, 2, 1}, {4, 3, 1}, {5, 3, 0}} {
				var count int
				if err = db.QueryRow(`SELECT count(*) FROM role_permissions WHERE role_id=? AND permission_id=?`, tc.role, tc.permission).Scan(&count); err != nil || count != tc.want {
					t.Fatalf("role %d permission %d count=%d want=%d err=%v", tc.role, tc.permission, count, tc.want, err)
				}
			}
			var changedOthers int
			if err = db.QueryRow(`SELECT count(*) FROM roles WHERE id IN (4,5) AND (version<>7 OR updated_at<>'before')`).Scan(&changedOthers); err != nil || changedOthers != 0 {
				t.Fatalf("unrelated role changed: %v", err)
			}
		})
	}
}
