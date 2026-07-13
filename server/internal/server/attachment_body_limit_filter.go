package server

import (
	stdhttp "net/http"

	"server/internal/biz"

	httpx "github.com/go-kratos/kratos/v2/transport/http"
)

// AttachmentBodyLimitFilter bounds the only JSON-RPC route that accepts
// base64 file content before protobuf/JSON decoding allocates the request body.
func AttachmentBodyLimitFilter() httpx.FilterFunc {
	return func(next stdhttp.Handler) stdhttp.Handler {
		return stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
			if r.URL.Path != "/rpc/attachment" {
				next.ServeHTTP(w, r)
				return
			}
			if r.ContentLength > biz.BusinessAttachmentMaxJSONRPCBodyBytes {
				stdhttp.Error(w, "attachment request body too large", stdhttp.StatusRequestEntityTooLarge)
				return
			}
			r.Body = stdhttp.MaxBytesReader(w, r.Body, biz.BusinessAttachmentMaxJSONRPCBodyBytes)
			next.ServeHTTP(w, r)
		})
	}
}
