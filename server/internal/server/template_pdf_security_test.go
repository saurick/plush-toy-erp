package server

import (
	"strings"
	"testing"
)

func TestValidateTemplatePDFHTMLAllowsStaticDocumentAndEmbeddedImage(t *testing.T) {
	t.Parallel()

	htmlDocument := `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
		/* source: https://erp.example.invalid/assets/app.css */
		.paper { color: #111; background-image: url("data:image/png;base64,iVBORw0KGgo="); }
	</style></head><body><main class="paper"><table><tbody><tr><td style="font-weight: 600">合同</td></tr></tbody></table>
	<figure><img alt="章" src="data:image/png;base64,iVBORw0KGgo="><figcaption>附件</figcaption></figure>
	<svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none"><defs><marker id="arrow" markerHeight="5" markerWidth="5" orient="auto" refX="4" refY="2.5"><path d="M0,0 L5,2.5 L0,5 Z"></path></marker></defs><line x1="0" y1="0" x2="100" y2="100" marker-end="url(#arrow)"></line></svg>
	</main></body></html>`

	if err := validateTemplatePDFHTML(htmlDocument); err != nil {
		t.Fatalf("safe static PDF HTML should pass: %v", err)
	}
}

func TestValidateTemplatePDFHTMLRejectsActiveAndExternalContent(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name string
		html string
	}{
		{name: "script", html: `<html><body><script>alert(1)</script></body></html>`},
		{name: "iframe", html: `<html><body><iframe src="data:text/html,ok"></iframe></body></html>`},
		{name: "object", html: `<html><body><object data="data:text/plain,ok"></object></body></html>`},
		{name: "link", html: `<html><head><link rel="stylesheet" href="https://example.invalid/a.css"></head></html>`},
		{name: "form", html: `<html><body><form action="https://example.invalid"><input></form></body></html>`},
		{name: "event handler", html: `<html><body><div onload="fetch('http://127.0.0.1')">x</div></body></html>`},
		{name: "external image", html: `<html><body><img src="http://127.0.0.1/internal"></body></html>`},
		{name: "external link", html: `<html><body><a href="https://example.invalid">x</a></body></html>`},
		{name: "srcset", html: `<html><body><img src="data:image/png;base64,iVBORw0KGgo=" srcset="https://example.invalid/a.png"></body></html>`},
		{name: "css import", html: `<html><head><style>@import url("https://example.invalid/a.css");</style></head></html>`},
		{name: "css external url", html: `<html><body><div style="background:url(file:///etc/passwd)">x</div></body></html>`},
		{name: "css comment split url", html: `<html><body><div style="background:u/**/rl(http://127.0.0.1/internal)">x</div></body></html>`},
		{name: "svg marker external url", html: `<html><body><svg><line marker-end="url(https://example.invalid/arrow.svg#marker)"></line></svg></body></html>`},
		{name: "svg data image", html: `<html><body><img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="></body></html>`},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if err := validateTemplatePDFHTML(tc.html); err == nil {
				t.Fatalf("unsafe PDF HTML should be rejected: %s", tc.html)
			}
		})
	}
}

func TestValidateTemplatePDFHTMLAllowsManyImagesAndLargeSingleImage(t *testing.T) {
	largeImage := strings.Repeat("A", 8<<20)
	images := strings.Repeat(`<img src="data:image/png;base64,iVBORw0KGgo=">`, 128)
	htmlDocument := `<html><body><img src="data:image/jpeg;base64,` + largeImage + `">` + images + `</body></html>`
	if err := validateTemplatePDFHTML(htmlDocument); err != nil {
		t.Fatalf("large single image and many images should pass within the document budget: %v", err)
	}
}

func TestValidateTemplatePDFHTMLRejectsImagesOverDocumentBudget(t *testing.T) {
	state := &templatePDFHTMLValidationState{imageBytes: maxTemplatePDFEmbeddedTotalBytes - 1}
	if err := validateTemplatePDFDataImage("data:image/png;base64,iVBORw0KGgo=", state); err == nil {
		t.Fatal("images over the document budget must be rejected")
	}
}

func TestTemplatePDFNetworkURLAllowedOnlyForLocalDocumentData(t *testing.T) {
	t.Parallel()

	for _, allowed := range []string{"about:blank", "data:text/html;base64,PGh0bWw+", "data:image/png;base64,iVBORw0KGgo="} {
		if !templatePDFNetworkURLAllowed(allowed) {
			t.Fatalf("expected local document URL to be allowed: %s", allowed)
		}
	}
	for _, blocked := range []string{
		"http://127.0.0.1/internal",
		"http://10.0.0.1/internal",
		"http://169.254.169.254/latest/meta-data/",
		"https://example.invalid/redirect",
		"file:///etc/passwd",
		"blob:https://example.invalid/id",
		"ws://127.0.0.1/socket",
	} {
		if templatePDFNetworkURLAllowed(blocked) {
			t.Fatalf("expected network URL to be blocked: %s", blocked)
		}
	}
}
