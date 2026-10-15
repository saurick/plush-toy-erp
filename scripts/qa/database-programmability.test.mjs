import assert from "node:assert/strict";
import test from "node:test";

import {
  databaseProgrammabilityReceiptSQL,
  parseDatabaseProgrammabilityCatalog,
} from "./database-programmability.mjs";

test("database programmability catalog accepts empty non-system schemas", () => {
  assert.deepEqual(parseDatabaseProgrammabilityCatalog(""), {
    ok: true,
    objects: [],
  });
});

test("database programmability catalog reports every forbidden object", () => {
  assert.deepEqual(
    parseDatabaseProgrammabilityCatalog(
      [
        "function\tpublic.guard_row()",
        "procedure\tpublic.rebuild_projection(integer)",
        "trigger\tpublic.items.guard_items",
        "",
      ].join("\n"),
    ),
    {
      ok: false,
      objects: [
        { kind: "function", name: "public.guard_row()" },
        {
          kind: "procedure",
          name: "public.rebuild_projection(integer)",
        },
        { kind: "trigger", name: "public.items.guard_items" },
      ],
    },
  );
});

test("database programmability rollback receipt excludes internal FK triggers", () => {
  assert.match(
    databaseProgrammabilityReceiptSQL,
    /NOT trigger\.tgisinternal/u,
  );
  assert.match(
    databaseProgrammabilityReceiptSQL,
    /routine\.prokind = 'f'/u,
  );
  assert.match(
    databaseProgrammabilityReceiptSQL,
    /routine\.prokind = 'p'/u,
  );
  assert.match(
    databaseProgrammabilityReceiptSQL,
    /namespace\.nspname !~ '\^pg_'/u,
  );
  assert.match(
    databaseProgrammabilityReceiptSQL,
    /namespace\.nspname <> 'information_schema'/u,
  );
});
