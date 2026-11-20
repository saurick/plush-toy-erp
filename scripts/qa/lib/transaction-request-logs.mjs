import assert from "node:assert/strict";

export function verifyTransactionRequestLogs(
  browser,
  logText,
  secretValues = [],
) {
  for (const secret of secretValues)
    assert.ok(
      !logText.includes(secret),
      "runtime log exposed a private credential",
    );
  assert.doesNotMatch(
    logText,
    /Bearer\s+[a-z0-9._-]+|postgres(?:ql)?:\/\/[^\s"']+|eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/u,
  );
  const records = logText.split("\n").flatMap((line) => {
    try {
      const record = JSON.parse(line);
      return record.msg === "request completed" ? [record] : [];
    } catch {
      return [];
    }
  });
  const calls = [
    ...browser.browserRPC,
    ...browser.fixtureRPC,
    ...[
      ...[...browser.flows, ...(browser.partialReceiving || [])].flatMap(({ transportFault, saveFault, submitFault, transportFaults = [] }) =>
        [transportFault, saveFault, submitFault, ...transportFaults].filter(Boolean),
      ),
      ...(browser.engineering ?? []).map(({ financeFault }) => financeFault).filter(Boolean),
    ].map((fault) => ({ ...fault, code: fault.backendCode })),
  ];
  assert.ok(calls.length > 0, "request correlation needs real RPC evidence");
  const counts = { matched: 0, success: 0, rejected: 0 };
  for (const call of calls) {
    assert.match(call.requestID || "", /^[A-Za-z0-9._:-]{1,128}$/u);
    const matches = records.filter(
      (record) => record.request_id === call.requestID,
    );
    assert.equal(
      matches.length,
      1,
      `${call.method} must have one completion log`,
    );
    const [record] = matches;
    assert.equal(record["rpc.method"], call.method);
    assert.equal(record.code, 0, "completed RPC transport must not fail");
    assert.equal(record.rpc_result_code, call.code);
    assert.match(record["trace.id"], /^[a-f0-9]{32}$/u);
    assert.match(record["span.id"], /^[a-f0-9]{16}$/u);
    const outcome = call.code === 0 ? "success" : "rejected";
    assert.equal(record.outcome, outcome);
    counts.matched += 1;
    counts[outcome] += 1;
  }
  return {
    ...counts,
    credentialsAbsent: true,
    traceExport:
      "disabled; propagation and privacy verified by targeted Go tests",
  };
}
