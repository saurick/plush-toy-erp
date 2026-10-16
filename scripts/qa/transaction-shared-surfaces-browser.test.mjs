import assert from "node:assert/strict";
import test from "node:test";
import { assertSharedSurfaceReport } from "./transaction-shared-surfaces-browser.mjs";
import { assertPDFDownloadResponse } from "./transaction-pdf-download-observer.mjs";
import { printTemplateCatalog } from "../../web/src/erp/config/printTemplates.mjs";

function completeReport() {
  return {
    pageErrors: [],
    filters: ["incoming-quality", "customer-receipts", "supplier-payments"].map(
      (key) => ({
        key,
        rows: 2,
        databaseMatches: true,
        restored: true,
        documentOverflow: false,
      }),
    ),
    prints: [
      "purchase-business",
      "outsourcing-business",
      "outsourcing-instruction-business",
      "bom-material-business",
      "bom-color-business",
      "bom-instruction-business",
      ...printTemplateCatalog
        .filter((template) => template.runtime?.workspace)
        .map(({ key }) => key),
    ].map((key, index) => ({
      key,
      sourceNo: "E2E-PO",
      sourceID: 41,
      bytes: 3500,
      responseStatus: 200,
      editorExcluded: true,
      downloadMatchesResponse: true,
      paperVisible: true,
      pages: 1,
      pageCharacters: [100],
      embeddedFontFaces: 2,
      requestID: `qa-pdf-${index}`,
      sha256: "a".repeat(64),
    })),
    factsUnchanged: true,
    freshTemplatesClearedBusinessSources: true,
    materialOnlyInstructionBlocked: true,
    printFixtureCreatedThroughAPI: true,
    fixtureDidNotPostFacts: true,
    factTablesChecked: 25,
    ownedPrintWindowsClosed: true,
  };
}

test("shared surface evidence requires actual rows, restored filters, real PDFs and unchanged facts", () => {
  assert.doesNotThrow(() => assertSharedSurfaceReport(completeReport()));
  for (const modify of [
    (r) => r.filters.pop(),
    (r) => {
      r.filters[0].rows = 0;
    },
    (r) => {
      r.filters[0].databaseMatches = false;
    },
    (r) => {
      r.filters[1].restored = false;
    },
    (r) => {
      r.filters[2].documentOverflow = true;
    },
    (r) => r.prints.pop(),
    (r) => {
      r.prints[0].sourceNo = "";
    },
    (r) => {
      r.prints[2].sourceID = null;
    },
    (r) => {
      r.freshTemplatesClearedBusinessSources = false;
    },
    (r) => {
      r.materialOnlyInstructionBlocked = false;
    },
    (r) => {
      r.printFixtureCreatedThroughAPI = false;
    },
    (r) => {
      r.fixtureDidNotPostFacts = false;
    },
    (r) => {
      r.prints[1].bytes = 0;
    },
    (r) => {
      r.prints[2].responseStatus = 403;
    },
    (r) => {
      r.prints[3].editorExcluded = false;
    },
    (r) => {
      r.prints[4].downloadMatchesResponse = false;
    },
    (r) => {
      r.prints[5].paperVisible = false;
    },
    (r) => { r.prints[0].pages = 0; },
    (r) => { r.prints[0].pages = 2; },
    (r) => { r.prints[0].pageCharacters = [0]; },
    (r) => { r.prints[0].embeddedFontFaces = 0; },
    (r) => {
      r.prints[0].requestID = "";
    },
    (r) => {
      r.prints[1].sha256 = "";
    },
    (r) => {
      r.prints[2].requestID = r.prints[0].requestID;
    },
    (r) => {
      r.factTablesChecked = 0;
    },
    (r) => {
      r.factsUnchanged = false;
    },
    (r) => {
      r.ownedPrintWindowsClosed = false;
    },
    (r) => r.pageErrors.push({ message: "print failed" }),
  ]) {
    const report = completeReport();
    modify(report);
    assert.throws(() => assertSharedSurfaceReport(report));
  }
});

test("the download must match its native PDF response, not an overlapping preview", () => {
  const actual = {
    templateKey: "material-purchase-contract",
    bytes: 4800,
    sha256: "a".repeat(64),
  };
  const response = {
    method: "POST",
    status: 200,
    contentType: "application/pdf",
    requestID: "qa-pdf-response",
    payload: {
      template_key: actual.templateKey,
      html: "<html><body>来源单据</body></html>",
    },
    prefix: "%PDF-",
    bytes: actual.bytes,
    sha256: actual.sha256,
  };
  assert.doesNotThrow(() => assertPDFDownloadResponse(response, actual));
  for (const override of [
    { method: "GET" },
    { status: 403 },
    { contentType: "text/html" },
    { requestID: "" },
    { payload: { ...response.payload, template_key: "processing-contract" } },
    { payload: { ...response.payload, html: "" } },
    { prefix: "" },
    { bytes: 0 },
    { bytes: 4801 },
    { sha256: "b".repeat(64) },
  ])
    assert.throws(() =>
      assertPDFDownloadResponse({ ...response, ...override }, actual),
    );
});
