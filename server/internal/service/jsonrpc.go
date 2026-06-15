// server/internal/service/jsonrpc.go
package service

import (
	"context"
	"time"

	v1 "server/api/jsonrpc/v1"
	"server/internal/biz"
	"server/internal/conf"

	"github.com/go-kratos/kratos/v2/log"
)

// JsonrpcService 实现 v1.JsonrpcServer 接口。
type JsonrpcService struct {
	v1.UnimplementedJsonrpcServer

	dispatcher *jsonrpcDispatcher
	log        *log.Helper
}

func NewJsonrpcService(
	c *conf.Data,
	logger log.Logger,
	authUC *biz.AuthUsecase,
	adminAuthUC *biz.AdminAuthUsecase,
	adminManageUC *biz.AdminManageUsecase,
	userAdminUC *biz.UserAdminUsecase,
	workflowUC *biz.WorkflowUsecase,
	debugUC *biz.DebugUsecase,
	masterDataUC *biz.MasterDataUsecase,
	salesOrderUC *biz.SalesOrderUsecase,
	purchaseOrderUC *biz.PurchaseOrderUsecase,
	inventoryUC *biz.InventoryUsecase,
	operationalFactUC *biz.OperationalFactUsecase,
	adminReader biz.AdminAccountReader,
) *JsonrpcService {
	return &JsonrpcService{
		dispatcher: newJSONRPCDispatcher(
			c,
			logger,
			authUC,
			adminAuthUC,
			adminManageUC,
			userAdminUC,
			workflowUC,
			debugUC,
			masterDataUC,
			salesOrderUC,
			purchaseOrderUC,
			inventoryUC,
			operationalFactUC,
			adminReader,
		),
		log: log.NewHelper(log.With(logger, "module", "service.jsonrpc.transport")),
	}
}

// GetJsonrpc 对应 GET /rpc/{url}
func (s *JsonrpcService) GetJsonrpc(ctx context.Context, req *v1.GetJsonrpcRequest) (*v1.GetJsonrpcReply, error) {
	s.log.WithContext(ctx).Infof(
		"GetJsonrpc: url=%s jsonrpc=%s method=%s id=%s",
		req.GetUrl(), req.GetJsonrpc(), req.GetMethod(), req.GetId(),
	)

	id, result, bizErr := s.dispatcher.Handle(
		ctx,
		req.GetUrl(),
		req.GetJsonrpc(),
		req.GetMethod(),
		req.GetId(),
		req.GetParams(),
	)

	reply := &v1.GetJsonrpcReply{
		Jsonrpc: "2.0",
		Id:      id,
		Result:  result,
	}

	if bizErr != nil {
		reply.Error = bizErr.Error()
	}

	return reply, nil
}

// PostJsonrpc 对应 POST /rpc/{url}
func (s *JsonrpcService) PostJsonrpc(ctx context.Context, req *v1.PostJsonrpcRequest) (*v1.PostJsonrpcReply, error) {
	start := time.Now()
	defer func() {
		s.log.WithContext(ctx).Infof(
			"PostJsonrpc: done url=%s method=%s id=%s cost=%s",
			req.GetUrl(), req.GetMethod(), req.GetId(), time.Since(start),
		)
	}()

	s.log.WithContext(ctx).Infof(
		"PostJsonrpc: url=%s jsonrpc=%s method=%s id=%s",
		req.GetUrl(), req.GetJsonrpc(), req.GetMethod(), req.GetId(),
	)

	id, result, bizErr := s.dispatcher.Handle(
		ctx,
		req.GetUrl(),
		req.GetJsonrpc(),
		req.GetMethod(),
		req.GetId(),
		req.GetParams(),
	)

	reply := &v1.PostJsonrpcReply{
		Jsonrpc: "2.0",
		Id:      id,
		Result:  result,
	}

	if bizErr != nil {
		reply.Error = bizErr.Error()
	}

	return reply, nil
}
