import assert from "node:assert/strict";

// Observe the native response Blob consumed by the application. Background
// preview renders can overlap a click, so the first PDF response is not its identity.
export async function observePDFDownloads(context) {
  await context.addInitScript(() => {
    const responses = new WeakMap();
    const downloads = new Map();
    window.__transactionPDFDownloadEvidence = downloads;
    const originalFetch = window.fetch;
    const originalObjectURL = URL.createObjectURL;
    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);
      if (new URL(response.url).pathname !== "/templates/render-pdf")
        return response;
      const payload = JSON.parse(args[1]?.body || "{}");
      const metadata = {
        method: args[1]?.method || "GET",
        status: response.status,
        contentType: response.headers.get("content-type"),
        requestID: response.headers.get("x-request-id"),
        payload,
      };
      const originalBlob = response.blob.bind(response);
      response.blob = async () => {
        const blob = await originalBlob();
        const bytes = await blob.arrayBuffer();
        responses.set(blob, {
          ...metadata,
          bytes: bytes.byteLength,
          prefix: new TextDecoder().decode(new Uint8Array(bytes).slice(0, 5)),
          sha256: Array.from(
            new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          )
            .map((value) => value.toString(16).padStart(2, "0"))
            .join(""),
        });
        return blob;
      };
      return response;
    };
    URL.createObjectURL = function (blob) {
      const url = originalObjectURL.call(this, blob);
      const response = responses.get(blob);
      if (response) downloads.set(url, response);
      return url;
    };
  });
}

export async function readPDFDownloadEvidence(page, download) {
  assert.match(download.url(), /^blob:http:\/\/127\.0\.0\.1:\d+\//u);
  const response = await page.evaluate(
    (url) => window.__transactionPDFDownloadEvidence?.get(url),
    download.url(),
  );
  assert.ok(
    response,
    "the downloaded Blob must belong to a real PDF HTTP response",
  );
  return response;
}

export function assertPDFDownloadResponse(
  response,
  { templateKey, bytes, sha256 },
) {
  assert.equal(response.method, "POST");
  assert.equal(response.status, 200);
  assert.match(response.contentType || "", /^application\/pdf\b/u);
  assert.match(response.requestID || "", /^[A-Za-z0-9._:-]{1,128}$/u);
  assert.equal(response.payload?.template_key, templateKey);
  assert.ok(response.payload.html?.includes("<html"));
  assert.equal(response.prefix, "%PDF-");
  assert.ok(response.bytes > 2000);
  assert.equal(response.bytes, bytes);
  assert.match(response.sha256 || "", /^[a-f0-9]{64}$/u);
  assert.equal(response.sha256, sha256);
}
