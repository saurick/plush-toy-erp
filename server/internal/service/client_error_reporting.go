package service

import (
	"context"
	"regexp"
	"strings"

	v1 "server/api/jsonrpc/v1"
	"server/internal/errcode"

	"golang.org/x/time/rate"
)

var clientErrorBudget = rate.NewLimiter(2, 20)
var clientErrorFingerprint = regexp.MustCompile(`^[0-9a-f]{8}$`)
var clientErrorBuild = regexp.MustCompile(`^(local|unknown|[0-9a-f]{40})$`)
var clientErrorFrame = regexp.MustCompile(`^/(assets|src)/[A-Za-z0-9_./-]{1,180}\.(js|jsx|mjs|ts|tsx):[0-9]{1,7}:[0-9]{1,7}$`)
var clientErrorRequestID = regexp.MustCompile(`^[A-Za-z0-9._:-]{1,128}$`)

func (d *jsonrpcDispatcher) reportClientError(ctx context.Context, id string, pm map[string]any) (string, *v1.JsonrpcResult, error) {
	claims, rejected := d.requireLogin(ctx)
	if rejected != nil {
		return id, rejected, nil
	}
	if !jsonRPCParamsAllowed(pm, "kind", "error_name", "fingerprint", "path", "build", "frames", "origin_request_id") {
		return id, invalidParamResult(), nil
	}
	for _, key := range []string{"kind", "error_name", "fingerprint", "path", "build"} {
		if _, ok := pm[key].(string); !ok {
			return id, invalidParamResult(), nil
		}
	}
	if value, present := pm["origin_request_id"]; present {
		if _, ok := value.(string); !ok {
			return id, invalidParamResult(), nil
		}
	}
	text := func(key string) string { value, _ := pm[key].(string); return value }
	kind, name, fingerprint, path, build := text("kind"), text("error_name"), text("fingerprint"), text("path"), text("build")
	if !oneOfClientError(kind, "runtime", "unhandled_rejection", "react_render") ||
		!oneOfClientError(name, "Error", "TypeError", "ReferenceError", "RangeError", "SyntaxError", "URIError", "EvalError", "AggregateError") ||
		!clientErrorFingerprint.MatchString(fingerprint) || !clientErrorBuild.MatchString(build) || len(path) > 256 {
		return id, invalidParamResult(), nil
	}
	frames, ok := pm["frames"].([]any)
	if !ok || len(frames) > 5 {
		return id, invalidParamResult(), nil
	}
	safeFrames := make([]string, 0, len(frames))
	for _, value := range frames {
		frame, ok := value.(string)
		if !ok || !clientErrorFrame.MatchString(frame) || strings.Contains(frame, "..") {
			return id, invalidParamResult(), nil
		}
		safeFrames = append(safeFrames, frame)
	}
	originRequestID := text("origin_request_id")
	if originRequestID != "" && !clientErrorRequestID.MatchString(originRequestID) {
		return id, invalidParamResult(), nil
	}
	// A broken page must not turn into an unbounded log producer. Reports are
	// best effort and never queue or retry; the normal authenticated RPC remains.
	if clientErrorBudget.Allow() {
		d.log.WithContext(ctx).Errorw(
			"msg", "browser runtime failed", "event", "browser_failure", "outcome", "error",
			"component", "browser", "actor_id", claims.UserID,
			"error_name", name, "error_kind", kind, "fingerprint", fingerprint,
			"path", safeBrowserReportPath(path), "web_build", build,
			"frames", safeFrames, "origin_request_id", originRequestID,
		)
	}
	return id, &v1.JsonrpcResult{Code: errcode.OK.Code, Message: errcode.OK.Message}, nil
}

func oneOfClientError(value string, allowed ...string) bool {
	for _, item := range allowed {
		if item == value {
			return true
		}
	}
	return false
}

func safeBrowserReportPath(path string) string {
	path = strings.SplitN(strings.SplitN(path, "?", 2)[0], "#", 2)[0]
	segments := strings.Split(path, "/")
	if len(segments) > 12 {
		return "/unknown"
	}
	for i, segment := range segments {
		if segment != "" && !oneOfClientError(segment, "erp", "mobile", "admin-login", "dashboard", "workbench", "workflow", "inventory", "purchase", "sales", "finance", "master-data", "products", "materials", "units", "warehouses", "customers", "suppliers", "shipments", "production", "quality", "outsourcing", "orders", "help", "print", "tasks", "{page}", "{id}") {
			segments[i] = "{page}"
		}
	}
	return "/" + strings.Trim(strings.Join(segments, "/"), "/")
}
