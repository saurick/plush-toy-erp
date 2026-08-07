function hasExactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return (
    actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index])
  );
}

export function validateRemoteStageTimings({
  timings,
  status,
  stage,
  durationMs,
  requiredStages,
}) {
  if (
    !Array.isArray(timings) ||
    !Array.isArray(requiredStages) ||
    timings.length > requiredStages.length ||
    !Number.isSafeInteger(durationMs) ||
    durationMs < 0
  ) {
    throw new Error("remote stage timing contract is invalid");
  }
  const normalized = timings.map((timing, index) => {
    if (
      !hasExactKeys(timing, ["durationMs", "id", "status"]) ||
      timing.id !== requiredStages[index] ||
      !["passed", "failed"].includes(timing.status) ||
      !Number.isSafeInteger(timing.durationMs) ||
      timing.durationMs < 0
    ) {
      throw new Error("remote stage timing contract is invalid");
    }
    return timing;
  });
  const measuredDurationMs = normalized.reduce(
    (total, timing) => total + timing.durationMs,
    0,
  );
  if (measuredDurationMs > durationMs) {
    throw new Error("remote stage timing exceeds operation duration");
  }
  if (status === "passed") {
    if (
      stage !== "passed" ||
      normalized.length !== requiredStages.length ||
      normalized.some((timing) => timing.status !== "passed")
    ) {
      throw new Error("passed remote stage timing is incomplete");
    }
  } else if (
    normalized.length > 0 &&
    (normalized.at(-1).id !== stage ||
      normalized.at(-1).status !== "failed" ||
      normalized.slice(0, -1).some((timing) => timing.status !== "passed"))
  ) {
    throw new Error("failed remote stage timing is inconsistent");
  }
  return normalized;
}
