package server

import (
	stdhttp "net/http"

	httpx "github.com/go-kratos/kratos/v2/transport/http"
)

const contentSecurityPolicy = "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' http: https: ws: wss:"

func SecurityHeadersFilter() httpx.FilterFunc {
	return func(next stdhttp.Handler) stdhttp.Handler {
		return stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
			h := w.Header()
			h.Set("Content-Security-Policy", contentSecurityPolicy)
			h.Set("Referrer-Policy", "same-origin")
			h.Set("X-Content-Type-Options", "nosniff")
			h.Set("X-Frame-Options", "DENY")
			h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")

			next.ServeHTTP(w, r)
		})
	}
}
