//go:build pdf_runtime

package server

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestTemplatePDFBusinessSnapshotIntegration(t *testing.T) {
	fixtureDir := os.Getenv("ERP_PDF_BUSINESS_FIXTURE_DIR")
	if fixtureDir == "" {
		t.Skip("set ERP_PDF_BUSINESS_FIXTURE_DIR to render real browser business snapshots")
	}
	files, err := filepath.Glob(filepath.Join(fixtureDir, "print-snapshot-*.html"))
	if err != nil || len(files) == 0 {
		t.Fatalf("business snapshots are missing: %v", err)
	}
	outputDir := os.Getenv("ERP_PDF_BUSINESS_OUTPUT_DIR")
	if outputDir == "" {
		t.Fatal("ERP_PDF_BUSINESS_OUTPUT_DIR is required")
	}
	if err := os.MkdirAll(outputDir, 0700); err != nil {
		t.Fatal(err)
	}
	sharedTemplatePDFChromeManager.Close()
	t.Cleanup(sharedTemplatePDFChromeManager.Close)
	for _, file := range files {
		t.Run(filepath.Base(file), func(t *testing.T) {
			htmlBytes, err := os.ReadFile(file)
			if err != nil {
				t.Fatal(err)
			}
			if len(htmlBytes) > maxTemplateHTMLSize {
				t.Fatal("snapshot exceeds HTML budget")
			}
			if err := validateTemplatePDFHTML(string(htmlBytes)); err != nil {
				t.Fatalf("validate actual snapshot: %v", err)
			}
			if !strings.Contains(string(htmlBytes), "data:font/woff2;base64,") {
				t.Fatal("business snapshot must embed bundled fonts")
			}
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			pdfBytes, err := renderTemplateHTMLToPDF(ctx, string(htmlBytes), 1)
			if err != nil {
				t.Fatal(err)
			}
			if !strings.HasPrefix(string(pdfBytes), "%PDF") {
				t.Fatal("missing PDF signature")
			}
			output := filepath.Join(outputDir, strings.TrimSuffix(filepath.Base(file), ".html")+".pdf")
			if err := os.WriteFile(output, pdfBytes, 0600); err != nil {
				t.Fatal(err)
			}
			t.Logf("backend PDF: snapshot=%d bytes pdf=%d bytes", len(htmlBytes), len(pdfBytes))
		})
	}
}
