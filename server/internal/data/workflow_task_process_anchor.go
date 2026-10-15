package data

import (
	"context"

	"server/internal/biz"
	"server/internal/data/model/ent"
	"server/internal/data/model/ent/processnodeinstance"
)

// validateWorkflowTaskProcessAnchors keeps ProcessRuntime ownership in the
// application transaction. PostgreSQL still enforces the paired-null CHECK and
// the two existence foreign keys; the repository is the only supported writer
// for the cross-instance ownership rule.
func validateWorkflowTaskProcessAnchors(
	ctx context.Context,
	client *ent.Client,
	processInstanceID *int,
	processNodeInstanceID *int,
) error {
	if client == nil {
		return biz.ErrBadParam
	}
	if processInstanceID == nil && processNodeInstanceID == nil {
		return nil
	}
	if processInstanceID == nil || processNodeInstanceID == nil ||
		*processInstanceID <= 0 || *processNodeInstanceID <= 0 {
		return biz.ErrBadParam
	}
	exists, err := client.ProcessNodeInstance.Query().
		Where(
			processnodeinstance.ID(*processNodeInstanceID),
			processnodeinstance.ProcessInstanceID(*processInstanceID),
		).
		Exist(ctx)
	if err != nil {
		return err
	}
	if !exists {
		return biz.ErrBadParam
	}
	return nil
}
