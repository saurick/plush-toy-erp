// server/internal/data/model/schema/admin_user.go
package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/dialect/entsql"
	"entgo.io/ent/schema"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"entgo.io/ent/schema/index"
)

type AdminUser struct {
	ent.Schema
}

func (AdminUser) Annotations() []schema.Annotation {
	return []schema.Annotation{
		entsql.Annotation{Checks: map[string]string{
			"admin_users_revoked_requires_disabled": `"revoked_at" IS NULL OR "disabled" = TRUE`,
			"admin_users_status_audit_bundle":       `(("status_changed_at" IS NULL AND "status_changed_by" IS NULL AND "status_reason" IS NULL) OR ("status_changed_at" IS NOT NULL AND "status_changed_by" IS NOT NULL))`,
			"admin_users_revoked_requires_reason":   `"revoked_at" IS NULL OR ("status_reason" IS NOT NULL AND length(trim("status_reason")) BETWEEN 1 AND 255)`,
			"admin_users_account_binding":           `(("account_kind" = 0 AND "supplier_id" IS NULL AND "customer_id" IS NULL) OR ("account_kind" = 1 AND "supplier_id" IS NOT NULL AND "customer_id" IS NULL AND "is_super_admin" = FALSE) OR ("account_kind" = 2 AND "customer_id" IS NOT NULL AND "supplier_id" IS NULL AND "is_super_admin" = FALSE))`,
		}},
	}
}

func (AdminUser) Fields() []ent.Field {
	return []ent.Field{
		field.Int("account_kind").Default(0).Immutable().Comment("账号类别：0 员工、1 供应商、2 客户"),
		field.Int("supplier_id").Optional().Nillable().Positive().Immutable(),
		field.Int("customer_id").Optional().Nillable().Positive().Immutable(),
		field.String("username").
			NotEmpty().
			MaxLen(64),
		field.String("display_name").
			Optional().
			Nillable().
			MaxRuneLen(64).
			Comment("账号显示名；业务页面优先展示，存量缺失时回退账号名"),
		field.String("phone").
			Optional().
			Nillable().
			MaxLen(32).
			Comment("管理员手机号，用于短信验证码登录"),
		field.String("password_hash").
			NotEmpty().
			Sensitive(),
		field.Bool("is_super_admin").
			Default(false).
			Comment("超级管理员拥有全部 RBAC 权限，但业务任务处理仍受归属规则约束"),
		field.String("erp_preferences").
			Default("{}").
			MaxLen(32768).
			Comment("管理员 ERP 页面偏好 JSON"),
		field.Bool("disabled").
			Default(false),
		field.Int64("auth_version").
			Default(1).
			Positive().
			Comment("管理员认证版本；禁用、注销和重置密码时递增，使旧会话立即失效"),
		field.Time("revoked_at").
			Optional().
			Nillable().
			Comment("正式注销时间；与 disabled 共同派生账号状态，不物理删除历史账号"),
		field.String("status_reason").
			Optional().
			Nillable().
			MaxLen(255).
			Comment("最近一次账号状态变更原因"),
		field.Time("status_changed_at").
			Optional().
			Nillable().
			Comment("最近一次账号状态变更时间"),
		field.Int("status_changed_by").
			Optional().
			Nillable().
			Positive().
			Comment("最近一次账号状态变更操作者管理员 ID"),
		field.Time("last_login_at").
			Optional().
			Nillable(),
		field.Time("created_at").
			Default(time.Now).
			Immutable(),
		field.Time("updated_at").
			Default(time.Now).
			UpdateDefault(time.Now),
	}
}

func (AdminUser) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("supplier", Supplier.Type).Field("supplier_id").Unique().Immutable().Annotations(entsql.OnDelete(entsql.Restrict)),
		edge.To("customer", Customer.Type).Field("customer_id").Unique().Immutable().Annotations(entsql.OnDelete(entsql.Restrict)),
	}
}

func (AdminUser) Indexes() []ent.Index {
	return []ent.Index{
		index.Fields("username").Unique(),
		index.Fields("phone").Unique(),
		index.Fields("is_super_admin"),
	}
}
