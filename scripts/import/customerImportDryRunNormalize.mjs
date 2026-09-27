import standardUnits from "../../server/internal/unitpolicy/units.json" with { type: "json" };

export function normalizeSourceType(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function normalizeDomain(domain) {
  return String(domain ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_");
}

export function normalizeFields(fields, warnings) {
  const normalized = {};
  for (const [key, value] of Object.entries(fields)) {
    normalized[key] = normalizeValue(key, value, warnings);
  }
  return normalized;
}

function normalizeValue(key, value, warnings) {
  if (value === undefined) {
    return null;
  }
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(key, item, warnings));
  }
  if (typeof value === "object") {
    const output = {};
    for (const [nestedKey, nestedValue] of Object.entries(value)) {
      output[nestedKey] = normalizeValue(nestedKey, nestedValue, warnings);
    }
    return output;
  }

  const trimmed = String(value).trim();
  if (trimmed === "") {
    return null;
  }
  if (isDateField(key)) {
    const date = normalizeDate(trimmed);
    if (!date) {
      warnings.push(`Invalid date value for ${key}: ${trimmed}`);
      return trimmed;
    }
    return date;
  }
  if (isMoneyField(key)) {
    const money = normalizeMoney(trimmed);
    if (money === null) {
      warnings.push(`Invalid money value for ${key}: ${trimmed}`);
      return trimmed;
    }
    return money;
  }
  if (isDecimalField(key) || looksDecimal(trimmed)) {
    const decimal = normalizeDecimal(trimmed);
    if (decimal === null) {
      warnings.push(`Invalid decimal value for ${key}: ${trimmed}`);
      return trimmed;
    }
    return decimal;
  }
  if (isUnitField(key)) {
    return normalizeUnitText(trimmed);
  }
  return trimmed;
}

export function isDateField(key) {
  return /date|日期|交期|出货日/i.test(key);
}

function isMoneyField(key) {
  return /amount|money|price|tax|金额|单价|税额|货款/i.test(key);
}

function isDecimalField(key) {
  return /quantity|qty|(?:^|[_-])count$|rate|数量|用量|损耗/i.test(key);
}

function isUnitField(key) {
  return /unit|单位/i.test(key);
}

export function normalizeDate(text) {
  const normalized = text
    .replace(/[./年]/g, "-")
    .replace(/[月]/g, "-")
    .replace(/[日]/g, "");
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function looksDecimal(text) {
  return /^[-+]?\d{1,3}(,\d{3})*(\.\d+)?$|^[-+]?\d+(\.\d+)?$/.test(text);
}

function normalizeDecimal(text) {
  const cleaned = String(text).replaceAll(",", "").trim();
  if (!/^[-+]?\d+(\.\d+)?$/.test(cleaned)) {
    return null;
  }
  const negative = cleaned.startsWith("-");
  const [integer, fraction = ""] = cleaned.replace(/^[-+]/u, "").split(".");
  const whole = integer.replace(/^0+(?=\d)/u, "");
  const tail = fraction.replace(/0+$/u, "");
  const result = whole + (tail ? "." + tail : "");
  return negative && result !== "0" ? "-" + result : result;
}

function normalizeMoney(text) {
  const cleaned = String(text)
    .replace(/[¥￥$,\s]/g, "")
    .replace(/^(?:CNY|RMB)/i, "");
  return normalizeDecimal(cleaned);
}

function normalizeUnitText(text) {
  const value = text.trim();
  if (/^[a-z]+$/i.test(value)) {
    return value.toUpperCase();
  }
  return value;
}

export function canonicalUnitText(value) {
  const text = String(value ?? "").trim();
  return (
    standardUnits.find((unit) =>
      [unit.code, unit.name, ...unit.aliases].some(
        (candidate) => candidate.toLowerCase() === text.toLowerCase(),
      ),
    )?.name || text
  );
}
export function quantityMatchesUnitPrecision(value, precision) {
  if (!Number.isInteger(precision) || precision < 0 || precision > 6)
    return false;
  const match = /^(\d{1,14})(?:\.(\d{1,6}))?$/u.exec(String(value ?? ""));
  return (
    !!match &&
    (match[2] || "").replace(/0+$/u, "").length <= precision &&
    /[1-9]/u.test(match[0])
  );
}
