package server

import (
	"regexp"

	v1 "server/api/jsonrpc/v1"
	"server/internal/errcode"
)

// Logs, metrics and spans must classify the JSON-RPC envelope the same way,
// because a failed RPC can still be a successful HTTP exchange.
func requestOutcome(req, reply any, err error) string {
	if err != nil {
		return "error"
	}
	if _, ok := req.(*v1.PostJsonrpcRequest); !ok {
		return "success"
	}
	response, _ := reply.(*v1.PostJsonrpcReply)
	if response == nil || response.GetResult() == nil || response.GetError() != "" || response.GetResult().GetCode() >= errcode.Internal.Code {
		return "error"
	}
	if response.GetResult().GetCode() != errcode.OK.Code {
		return "rejected"
	}
	return "success"
}

var traceOperationToken = regexp.MustCompile(`^[a-z][a-z0-9_]{0,95}$`)

func rpcTraceOperation(req *v1.PostJsonrpcRequest, reply any) (string, string) {
	if req == nil {
		return "unknown", "unknown"
	}
	route, method := req.GetUrl(), req.GetMethod()
	if !traceOperationToken.MatchString(route) {
		route = "unknown"
	}
	if !traceOperationToken.MatchString(method) {
		method = "unknown"
	}
	if response, ok := reply.(*v1.PostJsonrpcReply); ok && response.GetResult() != nil {
		switch response.GetResult().GetCode() {
		case errcode.JSONRPCUnknownURL.Code:
			route, method = "unknown", "unknown"
		case errcode.UnknownMethod.Code:
			method = "unknown"
		}
	}
	return route, method
}
