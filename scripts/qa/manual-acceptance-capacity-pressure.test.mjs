import assert from "node:assert/strict";
import test from "node:test";
import { PRESSURE_LEVELS, normalizeLoopbackURL, percentile } from "./manual-acceptance-capacity-pressure.mjs";

test("pressure target fails closed outside loopback", () => {
  assert.equal(normalizeLoopbackURL("http://127.0.0.1:8300"), "http://127.0.0.1:8300");
  for (const value of ["https://example.com", "http://192.168.0.133:8300", "http://u:p@localhost:8300"]) assert.throws(() => normalizeLoopbackURL(value));
});

test("capacity and stress levels are distinct and reach 100 concurrent users", () => {
  assert.deepEqual(PRESSURE_LEVELS, [
    { key: "capacity", concurrency: 20, requests: 1000 },
    { key: "stress", concurrency: 100, requests: 5000 },
  ]);
});

test("percentile uses nearest-rank semantics", () => {
  assert.equal(percentile([1, 2, 3, 4, 5], 0.5), 3);
  assert.equal(percentile([1, 2, 3, 4, 5], 0.95), 5);
  assert.equal(percentile([], 0.99), 0);
});
