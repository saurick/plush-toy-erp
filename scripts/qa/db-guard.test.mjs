import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { evaluateDbGuard } from "./db-guard.mjs";

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function commitAll(root, message) {
  git(root, ["add", "."]);
  git(root, [
    "-c",
    "user.name=DB Guard Test",
    "-c",
    "user.email=db-guard@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-qm",
    message,
  ]);
}

async function write(root, relativePath, content) {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

async function withRepository(callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), "plush-db-guard-"));
  try {
    git(root, ["init", "-q"]);
    await write(
      root,
      "server/internal/data/model/schema/item.go",
      "package schema\n\nfunc (Item) Fields() []ent.Field { return nil }\n",
    );
    await write(
      root,
      "server/internal/data/model/migrate/20260101000000_migrate.sql",
      "CREATE TABLE items (id bigint);\n",
    );
    await write(root, "server/internal/data/model/migrate/atlas.sum", "h1:base\n");
    git(root, ["add", "."]);
    git(root, [
      "-c",
      "user.name=DB Guard Test",
      "-c",
      "user.email=db-guard@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-qm",
      "base",
    ]);
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("db guard fails closed for an invalid base range", async () => {
  await withRepository(async (root) => {
    assert.throws(
      () =>
        evaluateDbGuard({
          root,
          range: "refs/heads/definitely-missing...HEAD",
        }),
      /git rev-list failed/u,
    );
  });
});

test("db guard sees a new ref schema change through empty-tree..HEAD", async () => {
  await withRepository(async (root) => {
    await write(
      root,
      "server/internal/data/model/schema/workflow_reconcile_job.go",
      [
        "package schema",
        "type WorkflowReconcileJob struct { ent.Schema }",
        "func (WorkflowReconcileJob) Fields() []ent.Field {",
        "  return []ent.Field{field.String(\"status\")}",
        "}",
        "",
      ].join("\n"),
    );
    commitAll(root, "new ref schema");
    const emptyTree = git(root, ["hash-object", "-t", "tree", "/dev/null"]);
    const changedFiles = git(root, ["diff", "--name-only", `${emptyTree}..HEAD`]).split("\n");
    assert(changedFiles.includes("server/internal/data/model/schema/workflow_reconcile_job.go"));
    const result = evaluateDbGuard({ root, range: `${emptyTree}..HEAD` });

    assert.equal(result.ok, false);
    assert.equal(result.reason, "schema-migration-proof-missing");
    const proof = result.proofs.find((item) => item.file.endsWith("workflow_reconcile_job.go"));
    assert(proof);
    assert(proof.missingTokens.includes("workflow_reconcile_jobs"));
  });
});

test("db guard requires a newly added migration for structural schema changes", async () => {
  await withRepository(async (root) => {
    await write(
      root,
      "server/internal/data/model/schema/item.go",
      "package schema\n\nfunc (Item) Fields() []ent.Field { return []ent.Field{field.String(\"name\")} }\n",
    );
    const result = evaluateDbGuard({ root, range: "HEAD...HEAD" });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "missing-new-migration");
  });
});

test("db guard rejects editing an old migration as schema proof", async () => {
  await withRepository(async (root) => {
    await write(
      root,
      "server/internal/data/model/schema/item.go",
      "package schema\n\nfunc (Item) Fields() []ent.Field { return []ent.Field{field.String(\"name\")} }\n",
    );
    await write(
      root,
      "server/internal/data/model/migrate/20260101000000_migrate.sql",
      "-- unrelated comment\nCREATE TABLE items (id bigint);\n",
    );
    const result = evaluateDbGuard({ root, range: "HEAD...HEAD" });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "base-migration-modified");
  });
});

test("db guard accepts a new migration only when atlas.sum also changes", async () => {
  await withRepository(async (root) => {
    await write(
      root,
      "server/internal/data/model/schema/item.go",
      "package schema\n\nfunc (Item) Fields() []ent.Field { return []ent.Field{field.String(\"name\")} }\n",
    );
    await write(
      root,
      "server/internal/data/model/migrate/20260102000000_migrate.sql",
      "ALTER TABLE items ADD COLUMN name text;\n",
    );

    let result = evaluateDbGuard({ root, range: "HEAD...HEAD" });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "missing-atlas-sum");

    await write(root, "server/internal/data/model/migrate/atlas.sum", "h1:next\n");
    result = evaluateDbGuard({ root, range: "HEAD...HEAD" });
    assert.equal(result.ok, true);
  });
});

test("db guard rejects an unrelated new migration for a changed schema", async () => {
  await withRepository(async (root) => {
    await write(
      root,
      "server/internal/data/model/schema/item.go",
      "package schema\n\nfunc (Item) Fields() []ent.Field { return []ent.Field{field.String(\"name\")} }\n",
    );
    await write(
      root,
      "server/internal/data/model/migrate/20260102000000_migrate.sql",
      "ALTER TABLE other_items ADD COLUMN unrelated text;\n",
    );
    await write(root, "server/internal/data/model/migrate/atlas.sum", "h1:next\n");

    const result = evaluateDbGuard({ root, range: "HEAD...HEAD" });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "schema-migration-proof-missing");
    assert.deepEqual(result.proofs[0].missingTokens, ["items", "name"]);
  });
});

test("db guard requires DDL for every newly added schema table", async () => {
  await withRepository(async (root) => {
    await write(
      root,
      "server/internal/data/model/schema/workflow_reconcile_job.go",
      [
        "package schema",
        "type WorkflowReconcileJob struct { ent.Schema }",
        "func (WorkflowReconcileJob) Fields() []ent.Field {",
        "  return []ent.Field{field.String(\"status\")}",
        "}",
        "",
      ].join("\n"),
    );
    await write(
      root,
      "server/internal/data/model/migrate/20260102000000_migrate.sql",
      "ALTER TABLE items ADD COLUMN harmless text;\n",
    );
    await write(root, "server/internal/data/model/migrate/atlas.sum", "h1:next\n");

    const result = evaluateDbGuard({ root, range: "HEAD...HEAD" });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "schema-migration-proof-missing");
    const proof = result.proofs.find(
      (item) => item.file.endsWith("workflow_reconcile_job.go"),
    );
    assert(proof);
    assert(proof.missingTokens.includes("workflow_reconcile_jobs"));
    assert(proof.missingTokens.includes("status"));
  });
});

test("db guard requires added named checks in the versioned DDL", async () => {
  await withRepository(async (root) => {
    await write(
      root,
      "server/internal/data/model/schema/item.go",
      [
        "package schema",
        "func (Item) Annotations() []schema.Annotation {",
        "  return []schema.Annotation{entsql.Annotation{Checks: map[string]string{",
        "    \"items_status_allowed\": \"status IN ('active')\",",
        "  }}}",
        "}",
        "func (Item) Fields() []ent.Field { return nil }",
        "",
      ].join("\n"),
    );
    await write(
      root,
      "server/internal/data/model/migrate/20260102000000_migrate.sql",
      "ALTER TABLE items ADD COLUMN unrelated text;\n",
    );
    await write(root, "server/internal/data/model/migrate/atlas.sum", "h1:next\n");

    const result = evaluateDbGuard({ root, range: "HEAD...HEAD" });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "schema-migration-proof-missing");
    assert(result.proofs[0].missingTokens.includes("items_status_allowed"));
  });
});

test("db guard ignores unchanged table and check formatting", async () => {
  await withRepository(async (root) => {
    await write(
      root,
      "server/internal/data/model/schema/item.go",
      [
        "package schema",
        "func (Item) Annotations() []schema.Annotation {",
        "  return []schema.Annotation{entsql.Annotation{Table: \"items\", Checks: map[string]string{",
        "    \"items_status_allowed\": \"status IN ('active')\",",
        "  }}}",
        "}",
        "func (Item) Fields() []ent.Field { return nil }",
        "",
      ].join("\n"),
    );
    commitAll(root, "table and check baseline");

    await write(
      root,
      "server/internal/data/model/schema/item.go",
      [
        "package schema",
        "func (Item) Annotations() []schema.Annotation {",
        "  return []schema.Annotation{entsql.Annotation{",
        "    Table: \"items\",",
        "    Checks: map[string]string{",
        "      \"items_status_allowed\": \"status IN ('active')\",",
        "      \"items_weight_positive\": \"weight > 0\",",
        "    },",
        "  }}",
        "}",
        "func (Item) Fields() []ent.Field { return nil }",
        "",
      ].join("\n"),
    );
    await write(
      root,
      "server/internal/data/model/migrate/20260102000000_migrate.sql",
      "ALTER TABLE items ADD CONSTRAINT items_weight_positive CHECK (weight > 0);\n",
    );
    await write(root, "server/internal/data/model/migrate/atlas.sum", "h1:next\n");

    const result = evaluateDbGuard({ root, range: "HEAD...HEAD" });
    assert.equal(result.ok, true);
  });
});

test("db guard rejects changing an old migration from a file to a symlink", async () => {
  await withRepository(async (root) => {
    const migration = path.join(
      root,
      "server/internal/data/model/migrate/20260101000000_migrate.sql",
    );
    await rm(migration);
    await symlink("atlas.sum", migration);

    const result = evaluateDbGuard({ root, range: "HEAD...HEAD" });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "base-migration-modified");
  });
});

test("db guard requires proof when a CHECK is added inside an existing annotation", async () => {
  await withRepository(async (root) => {
    await write(
      root,
      "server/internal/data/model/schema/item.go",
      [
        "package schema",
        "func (Item) Annotations() []schema.Annotation {",
        "  return []schema.Annotation{entsql.Annotation{Checks: map[string]string{}}}",
        "}",
        "func (Item) Fields() []ent.Field { return nil }",
        "",
      ].join("\n"),
    );
    commitAll(root, "annotation baseline");
    await write(
      root,
      "server/internal/data/model/schema/item.go",
      [
        "package schema",
        "func (Item) Annotations() []schema.Annotation {",
        "  return []schema.Annotation{entsql.Annotation{Checks: map[string]string{",
        "    \"items_status_allowed\": \"status IN ('active')\",",
        "  }}}",
        "}",
        "func (Item) Fields() []ent.Field { return nil }",
        "",
      ].join("\n"),
    );
    await write(
      root,
      "server/internal/data/model/migrate/20260102000000_migrate.sql",
      "ALTER TABLE items ADD COLUMN unrelated text;\n",
    );
    await write(root, "server/internal/data/model/migrate/atlas.sum", "h1:next\n");

    const result = evaluateDbGuard({ root, range: "HEAD...HEAD" });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "schema-migration-proof-missing");
    assert(result.proofs[0].missingTokens.includes("items_status_allowed"));
  });
});

test("db guard associates detached field modifiers with their physical column", async () => {
  for (const modifier of ["Optional", "Unique", "Default(\"draft\")"]) {
    await withRepository(async (root) => {
      await write(
        root,
        "server/internal/data/model/schema/item.go",
        [
          "package schema",
          "func (Item) Fields() []ent.Field {",
          "  return []ent.Field{field.String(\"name\").NotEmpty()}",
          "}",
          "",
        ].join("\n"),
      );
      commitAll(root, "field modifier baseline");
      const call = modifier.includes("(") ? modifier : `${modifier}()`;
      await write(
        root,
        "server/internal/data/model/schema/item.go",
        [
          "package schema",
          "func (Item) Fields() []ent.Field {",
          "  return []ent.Field{",
          "    field.String(\"name\").",
          `      ${call},`,
          "  }",
          "}",
          "",
        ].join("\n"),
      );
      await write(
        root,
        "server/internal/data/model/migrate/20260102000000_migrate.sql",
        "ALTER TABLE items ADD COLUMN unrelated text;\n",
      );
      await write(root, "server/internal/data/model/migrate/atlas.sum", "h1:next\n");

      const result = evaluateDbGuard({ root, range: "HEAD...HEAD" });
      assert.equal(result.ok, false, modifier);
      assert.equal(result.reason, "schema-migration-proof-missing", modifier);
      assert(result.proofs[0].missingTokens.includes("name"), modifier);
    });
  }
});

test("db guard associates detached index and edge modifiers with physical columns", async () => {
  for (const [baseline, changed, expectedToken] of [
    [
      [
        "package schema",
        "func (Item) Indexes() []ent.Index {",
        "  return []ent.Index{index.Fields(\"name\")}",
        "}",
        "",
      ],
      [
        "package schema",
        "func (Item) Indexes() []ent.Index {",
        "  return []ent.Index{",
        "    index.Fields(\"name\").",
        "      Unique(),",
        "  }",
        "}",
        "",
      ],
      "name",
    ],
    [
      [
        "package schema",
        "func (Item) Edges() []ent.Edge {",
        "  return []ent.Edge{edge.From(\"owner\", Owner.Type).Ref(\"items\").Field(\"owner_id\")}",
        "}",
        "",
      ],
      [
        "package schema",
        "func (Item) Edges() []ent.Edge {",
        "  return []ent.Edge{",
        "    edge.From(\"owner\", Owner.Type).",
        "      Ref(\"items\").",
        "      Unique().",
        "      Field(\"owner_id\"),",
        "  }",
        "}",
        "",
      ],
      "owner_id",
    ],
  ]) {
    await withRepository(async (root) => {
      await write(
        root,
        "server/internal/data/model/schema/item.go",
        baseline.join("\n"),
      );
      commitAll(root, "builder modifier baseline");
      await write(
        root,
        "server/internal/data/model/schema/item.go",
        changed.join("\n"),
      );
      await write(
        root,
        "server/internal/data/model/migrate/20260102000000_migrate.sql",
        "ALTER TABLE items ADD COLUMN unrelated text;\n",
      );
      await write(root, "server/internal/data/model/migrate/atlas.sum", "h1:next\n");

      const result = evaluateDbGuard({ root, range: "HEAD...HEAD" });
      assert.equal(result.ok, false, expectedToken);
      assert.equal(result.reason, "schema-migration-proof-missing", expectedToken);
      assert(result.proofs[0].missingTokens.includes(expectedToken), expectedToken);
    });
  }
});

test("db guard requires DROP proof for removed fields", async () => {
  await withRepository(async (root) => {
    await write(
      root,
      "server/internal/data/model/schema/item.go",
      "package schema\nfunc (Item) Fields() []ent.Field { return []ent.Field{field.String(\"name\")} }\n",
    );
    commitAll(root, "field removal baseline");
    await write(
      root,
      "server/internal/data/model/schema/item.go",
      "package schema\nfunc (Item) Fields() []ent.Field { return nil }\n",
    );
    await write(
      root,
      "server/internal/data/model/migrate/20260102000000_migrate.sql",
      "ALTER TABLE items ADD COLUMN unrelated text;\n",
    );
    await write(root, "server/internal/data/model/migrate/atlas.sum", "h1:next\n");

    const result = evaluateDbGuard({ root, range: "HEAD...HEAD" });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "schema-migration-proof-missing");
    assert(result.proofs[0].missingTokens.includes("name"));
  });
});

test("db guard requires statement-local and operation-aware field proof", async () => {
  for (const migration of [
    "ALTER TABLE items ADD COLUMN unrelated text; ALTER TABLE other_items ADD COLUMN name text;\n",
    "ALTER TABLE items DROP COLUMN name;\n",
  ]) {
    await withRepository(async (root) => {
      await write(
        root,
        "server/internal/data/model/schema/item.go",
        "package schema\nfunc (Item) Fields() []ent.Field { return []ent.Field{field.String(\"name\")} }\n",
      );
      await write(
        root,
        "server/internal/data/model/migrate/20260102000000_migrate.sql",
        migration,
      );
      await write(root, "server/internal/data/model/migrate/atlas.sum", "h1:next\n");

      const result = evaluateDbGuard({ root, range: "HEAD...HEAD" });
      assert.equal(result.ok, false, migration);
      assert.equal(result.reason, "schema-migration-proof-missing", migration);
    });
  }
});

test("db guard rejects DDL for the wrong schema object kind", async () => {
  const cases = [
    {
      name: "column addition cannot be proved by an index name",
      baseline:
        "package schema\nfunc (Item) Fields() []ent.Field { return nil }\n",
      changed:
        "package schema\nfunc (Item) Fields() []ent.Field { return []ent.Field{field.String(\"name\")} }\n",
      migration: "CREATE INDEX name ON items (id);\n",
      expectedKind: "column",
    },
    {
      name: "column removal cannot be proved by a constraint name",
      baseline:
        "package schema\nfunc (Item) Fields() []ent.Field { return []ent.Field{field.String(\"name\")} }\n",
      changed:
        "package schema\nfunc (Item) Fields() []ent.Field { return nil }\n",
      migration: "ALTER TABLE items DROP CONSTRAINT name;\n",
      expectedKind: "column",
    },
    {
      name: "named check cannot be proved by a column with the same name",
      baseline:
        "package schema\nfunc (Item) Annotations() []schema.Annotation { return nil }\n",
      changed:
        "package schema\nfunc (Item) Annotations() []schema.Annotation { return []schema.Annotation{entsql.Annotation{Checks: map[string]string{\"items_status_allowed\": \"status IN ('active')\"}}} }\n",
      migration:
        "ALTER TABLE items ADD COLUMN items_status_allowed boolean;\n",
      expectedKind: "check",
    },
  ];

  for (const fixture of cases) {
    await withRepository(async (root) => {
      await write(
        root,
        "server/internal/data/model/schema/item.go",
        fixture.baseline,
      );
      commitAll(root, "object kind baseline");
      await write(
        root,
        "server/internal/data/model/schema/item.go",
        fixture.changed,
      );
      await write(
        root,
        "server/internal/data/model/migrate/20260102000000_migrate.sql",
        fixture.migration,
      );
      await write(
        root,
        "server/internal/data/model/migrate/atlas.sum",
        "h1:next\n",
      );

      const result = evaluateDbGuard({ root, range: "HEAD...HEAD" });
      assert.equal(result.ok, false, fixture.name);
      assert.equal(
        result.reason,
        "schema-migration-proof-missing",
        fixture.name,
      );
      assert.equal(
        result.proofs[0].missingRequirements[0].kind,
        fixture.expectedKind,
        fixture.name,
      );
    });
  }
});

test("db guard ignores identifiers in inline comments and SQL strings", async () => {
  for (const suffix of [
    "-- name",
    "SELECT 'name'",
    "DO $$ BEGIN RAISE NOTICE 'name'; END $$",
  ]) {
    await withRepository(async (root) => {
      await write(
        root,
        "server/internal/data/model/schema/item.go",
        "package schema\nfunc (Item) Fields() []ent.Field { return []ent.Field{field.String(\"name\")} }\n",
      );
      await write(
        root,
        "server/internal/data/model/migrate/20260102000000_migrate.sql",
        `ALTER TABLE items ADD COLUMN unrelated text; ${suffix};\n`,
      );
      await write(root, "server/internal/data/model/migrate/atlas.sum", "h1:next\n");

      const result = evaluateDbGuard({ root, range: "HEAD...HEAD" });
      assert.equal(result.ok, false, suffix);
      assert.equal(result.reason, "schema-migration-proof-missing", suffix);
      assert(result.proofs[0].missingTokens.includes("name"), suffix);
    });
  }
});

test("db guard requires an actual table rename for Table annotation changes", async () => {
  await withRepository(async (root) => {
    await write(
      root,
      "server/internal/data/model/schema/item.go",
      "package schema\nfunc (Item) Annotations() []schema.Annotation { return []schema.Annotation{entsql.Annotation{Table: \"legacy_items\"}} }\n",
    );
    commitAll(root, "table annotation baseline");
    await write(
      root,
      "server/internal/data/model/schema/item.go",
      "package schema\nfunc (Item) Annotations() []schema.Annotation { return []schema.Annotation{entsql.Annotation{Table: \"items\"}} }\n",
    );
    await write(
      root,
      "server/internal/data/model/migrate/20260102000000_migrate.sql",
      "ALTER TABLE legacy_items ADD COLUMN items text;\n",
    );
    await write(root, "server/internal/data/model/migrate/atlas.sum", "h1:next\n");

    const result = evaluateDbGuard({ root, range: "HEAD...HEAD" });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "schema-migration-proof-missing");
    assert.equal(result.proofs[0].missingRequirements[0].operation, "rename-table");
  });
});

test("db guard accepts a modifier proof without requiring adjacent fields", async () => {
  await withRepository(async (root) => {
    await write(
      root,
      "server/internal/data/model/schema/item.go",
      [
        "package schema",
        "func (Item) Fields() []ent.Field {",
        "  return []ent.Field{",
        "    field.String(\"name\").",
        "      NotEmpty(),",
        "    field.String(\"description\"),",
        "  }",
        "}",
        "",
      ].join("\n"),
    );
    commitAll(root, "adjacent field baseline");
    await write(
      root,
      "server/internal/data/model/schema/item.go",
      [
        "package schema",
        "func (Item) Fields() []ent.Field {",
        "  return []ent.Field{",
        "    field.String(\"name\").",
        "      NotEmpty().",
        "      Optional(),",
        "    field.String(\"description\"),",
        "  }",
        "}",
        "",
      ].join("\n"),
    );
    await write(
      root,
      "server/internal/data/model/migrate/20260102000000_migrate.sql",
      "ALTER TABLE items ALTER COLUMN name DROP NOT NULL;\n",
    );
    await write(root, "server/internal/data/model/migrate/atlas.sum", "h1:next\n");

    const result = evaluateDbGuard({ root, range: "HEAD...HEAD" });
    assert.equal(result.ok, true);
  });
});

test("db guard ignores an unchanged field chain displaced by adjacent removals", async () => {
  await withRepository(async (root) => {
    await write(
      root,
      "server/internal/data/model/schema/item.go",
      [
        "package schema",
        "func (Item) Fields() []ent.Field {",
        "  return []ent.Field{",
        "    field.Time(\"due_at\").Optional().Nillable(),",
        "    field.Time(\"started_at\").Optional().Nillable(),",
        "    field.Time(\"completed_at\").",
        "      Optional().",
        "      Nillable(),",
        "    field.Time(\"closed_at\").Optional().Nillable(),",
        "  }",
        "}",
        "",
      ].join("\n"),
    );
    commitAll(root, "workflow timestamp baseline");
    await write(
      root,
      "server/internal/data/model/schema/item.go",
      [
        "package schema",
        "func (Item) Fields() []ent.Field {",
        "  return []ent.Field{",
        "    field.Time(\"due_at\").Optional().Nillable(),",
        "    field.Time(\"completed_at\").",
        "      Optional().",
        "      Nillable(),",
        "    field.Bool(\"critical_path\").Default(false),",
        "  }",
        "}",
        "",
      ].join("\n"),
    );
    await write(
      root,
      "server/internal/data/model/migrate/20260102000000_migrate.sql",
      [
        "ALTER TABLE items DROP COLUMN started_at;",
        "ALTER TABLE items DROP COLUMN closed_at;",
        "ALTER TABLE items ADD COLUMN critical_path boolean NOT NULL DEFAULT false;",
        "",
      ].join("\n"),
    );
    await write(root, "server/internal/data/model/migrate/atlas.sum", "h1:next\n");

    const result = evaluateDbGuard({ root, range: "HEAD...HEAD" });
    assert.equal(result.ok, true, JSON.stringify(result, null, 2));
  });
});

test("db guard keeps proof requirements when an add-drop field chain changed", async () => {
  await withRepository(async (root) => {
    await write(
      root,
      "server/internal/data/model/schema/item.go",
      "package schema\nfunc (Item) Fields() []ent.Field { return []ent.Field{field.Time(\"completed_at\").Optional()} }\n",
    );
    commitAll(root, "field chain baseline");
    await write(
      root,
      "server/internal/data/model/schema/item.go",
      "package schema\nfunc (Item) Fields() []ent.Field { return []ent.Field{field.String(\"completed_at\").Optional()} }\n",
    );
    await write(
      root,
      "server/internal/data/model/migrate/20260102000000_migrate.sql",
      "ALTER TABLE items ADD COLUMN unrelated text;\n",
    );
    await write(root, "server/internal/data/model/migrate/atlas.sum", "h1:next\n");

    const result = evaluateDbGuard({ root, range: "HEAD...HEAD" });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "schema-migration-proof-missing");
    assert(result.proofs[0].missingTokens.includes("completed_at"));
  });
});
