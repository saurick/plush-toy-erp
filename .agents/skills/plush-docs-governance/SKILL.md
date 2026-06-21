---
name: plush-docs-governance
description: Project-specific documentation governance for /Users/simon/projects/plush-toy-erp. Use when Codex reviews, creates, renames, reorganizes, simplifies, or updates plush ERP Markdown docs, README files, docs inventory, progress.md, customer docs, reference/archive docs, project guidance, AGENTS.md docs rules, Markdown metadata/frontmatter, tables, classification matrices, architecture layers, validation levels, test shapes, Mermaid diagrams, flowcharts, state diagrams, architecture diagrams, decision diagrams, reader paths, quick starts, conclusion-first structure, or copyable commands, or when the user mentions 文档治理, docs, AGENTS, 文档清单, 中文文件名, 真源, frontmatter, metadata, progress归档, reference不是正式真源, 信息密度高, 心智负担, 一眼看不懂, 简洁易用, 美观, 表格, 矩阵, 架构层级, 验证层级, 测试形态, 跳转到指定位置, 流程图, 状态图, 架构图, 读者路径, 结论前置, 命令可复制, or asks whether docs guidance should become reusable.
---

# Plush Docs Governance

Use this skill to keep plush-toy-erp docs useful for humans and safe as project truth. It covers both governance and reading experience: current source of truth, inventory sync, Chinese filenames, low information density, reader paths, conclusion-first structure, clear section anchors, copyable commands, diagrams that reduce understanding cost, and links to exact relevant locations.

## Workflow

1. Snapshot scope and worktree.
   - Run `git status --short` before editing.
   - Classify the task as docs-only, docs-adjacent, or behavior-changing.
   - If runtime, schema, API, RBAC, menu, deployment, or test behavior changes are required, stop treating it as docs-only and follow the relevant project workflow too.

2. Read the docs truth chain.
   - Always read project `AGENTS.md` for rules, but treat it as protected project-level governance.
   - Read `docs/当前真源与交接顺序.md` before making current-state claims.
   - Read `docs/文档清单.md` when adding, deleting, renaming, reclassifying, or changing the stated purpose/title of long-lived Markdown.
   - Read the nearest directory `README.md` for the touched docs area when it exists.
   - Treat `docs/reference/**` as external input and `docs/archive/**` plus `progress.md` as historical/process evidence, not current runtime truth.

3. Protect `AGENTS.md`.
   - Ordinary docs cleanup should read `AGENTS.md`, not edit it.
   - Edit `AGENTS.md` only when the user explicitly asks to change long-term rules, governance, prohibited actions, required workflows, or repository-wide doc policy.
   - Keep `AGENTS.md` concise and rule-focused. Do not move ordinary product explanations, process notes, roadmap detail, or page-level prose into it.
   - When editing `AGENTS.md`, verify the new rule belongs at project level instead of a product doc, architecture doc, deployment doc, test strategy, hook, or QA script.
   - In the final response, explicitly say whether `AGENTS.md` was only read or actually changed.

4. Decide metadata and frontmatter deliberately.
   - Do not add Markdown frontmatter or metadata by default.
   - Before adding or changing metadata, identify the real consumer: docs viewer, generator, search index, build script, publishing tool, or human-maintained inventory.
   - If the project already has a registry, docs index, seed config, or viewer config as the source of truth, update that source instead of inventing parallel Markdown frontmatter.
   - Keep human-readable H1, headings, and `docs/文档清单.md` aligned with any metadata that is truly required.

5. Design for human reading first.
   - Start ordinary docs with purpose, scope, current truth, main path, and acceptance or verification.
   - Give readers a path near the top: who should read this, where to start, and what they can do after reading.
   - Put the current conclusion, status, main path, required commands, and risk boundary before history or detailed evidence.
   - Keep high-risk restrictions in `AGENTS.md`, governance docs, hooks, or QA scripts instead of copying negative lists into every ordinary doc.
   - Make headings scannable. A reader should know what each section does from the H2/H3 list.
   - Prefer Chinese main headings with stable English anchors or technical terms where useful.
   - Avoid front-loading history, internal IDs, stage labels, or capability anchors when the document is meant for human scanning.
   - Use open-source and large-company documentation patterns as information architecture only: Quick start, Concepts, How-to, Reference, Troubleshooting, FAQ, Changelog. Keep the actual process lightweight for personal development.
   - When docs involve classification matrices, separate architecture layers, validation levels, test shapes, and evidence environments. Do not call `T0-T8` project architecture layers; treat them as validation levels. Keep detailed test selection in `docs/product/自动化测试策略.md` or the `plush-test-governance` skill, and link there instead of duplicating the full testing policy.

6. Reduce documentation density by meaning.
   - Delete or move repeated background, stale process notes, duplicated warnings, hidden task history, and explanations that do not change reader action.
   - Split large docs when the main surface stops being quickly scannable. Keep the main doc as route/index/summary and move evidence or long detail to a linked detail doc.
   - Choose the expression shape by the information type, not by decoration:
     - Use tables for short comparable facts, status inventories, responsibility matrices, path lists, field/API/config comparisons, command catalogs, acceptance criteria, risk registers, and docs classification.
     - Use numbered lists for ordered procedures, troubleshooting paths, migration sequences, release steps, and verification steps.
     - Use code blocks for commands, config, SQL, API examples, and minimal reproducible snippets.
     - Use short paragraphs under clear headings for principles, rationale, boundaries, and caveats.
     - Use nearby links and section anchors when readers need to jump from a summary to an exact truth source, detailed design, command, acceptance section, risk boundary, prototype, or product/architecture doc.
     - Use Mermaid or simple diagrams only when a visual structure makes Workflow / Fact boundaries, state transitions, module layers, data flow, deployment paths, doc truth chains, or decision trees easier to understand than prose.
   - Make important commands copyable and result-oriented: include the working directory or command context, the expected success signal, and where to troubleshoot failures when that is useful.
   - Do not force long prose, workflows, or FAQ content into tables just for visual neatness.
   - Do not stack tables, diagrams, and links for visual polish alone. Each structure should answer a reader question or reduce lookup cost.
   - Do not import heavy company process by default. Avoid mandatory RFC/ADR templates, approval checklists, or broad doc taxonomies unless the repo already uses them or the user explicitly asks.

7. Add diagrams when they reduce understanding cost.
   - Prefer Mermaid or a simple structure diagram for complex flows, state machines, system layers, module dependencies, user-to-backend sequences, deployment paths, document truth chains, and decision trees.
   - Do not add diagrams mechanically. If a short list or table is clearer, use that instead.
   - Diagrams are reading aids, not new truth. Keep the authoritative wording in the surrounding doc and make sure the diagram matches current code, formal docs, schema, migration, tests, and the project truth index.
   - Give each non-trivial diagram a short lead-in or follow-up sentence explaining what question the diagram answers.
   - Keep diagrams compact enough to scan. Split large diagrams by workflow, layer, or decision if one diagram becomes dense.
   - Use stable, human-readable node labels. Avoid internal IDs as the first visible signal unless the diagram is specifically for maintainers.
   - After adding or changing Mermaid, check fenced code blocks, Mermaid syntax shape, node labels, anchors, and surrounding text for consistency.

8. Maintain jumpability and cross-links.
   - For key truth, commands, acceptance, risks, next steps, and related docs, provide links to the most specific stable section practical.
   - Keep section titles stable when other docs or tools link to them. If a title must change, search for old anchors and update incoming links.
   - Use explicit nearby links instead of expecting readers to infer where details live.
   - Prefer one routing/index section over repeated copies of the same explanation across multiple docs.

9. Apply plush naming and inventory rules.
   - Active long-lived Markdown defaults to Chinese filenames. Keep English anchors in H1, metadata, body, or `docs/文档清单.md`.
   - Do not mechanically rename `README.md`, `AGENTS.md`, `CHANGELOG.md`, `docs/reference/**`, `docs/archive/**`, generated files, externally stable links, code package names, API paths, table names, config keys, or status keys.
   - When adding, deleting, renaming, or reclassifying long-lived Markdown, update `docs/文档清单.md` and relevant directory README files in the same round.
   - If only body wording changes and title/purpose/path/classification remain accurate, `docs/文档清单.md` usually does not need an update.

10. Sync related surfaces.
   - Search the repo for renamed paths, old titles, old customer keys, old anchors, and old terminology before calling the change complete.
   - If docs are surfaced through dev-only viewers, prototypes, tests, scripts, or generated indexes, update those references together.
   - When formal docs change after code/runtime behavior changes, update `progress.md` if the repo rule requires it and check whether `docs/当前真源与交接顺序.md`, product docs, architecture docs, web/server/scripts README, or test strategy need matching updates.
   - Before updating `progress.md`, check its size. If it is at or above 600 lines or 80KB, archive older entries first according to project rules, preserving active items, unfinished items, risks, and a traceable archive index.

11. Validate with scans.
   - Use targeted `rg` checks for old paths, stale headings, stale anchors, English-only active titles where Chinese readability is expected, and broken internal references that can be detected by text search.
   - For Mermaid changes, include a targeted scan or syntax-oriented check for Mermaid fenced blocks and any anchors or labels referenced by surrounding text.
   - Run `git diff --check`.
   - For docs-only changes, do not run migrations or unrelated heavy runtime tests unless the touched docs/scripts require them.
   - For rename or viewer/test changes, run the relevant repo tests or scripts named by the project docs.

## Deliverable Standard

When answering, report:

- Verdict if the user asked whether the docs direction is reasonable.
- Whether `AGENTS.md` was read only or changed, and why.
- What docs were created, renamed, deleted, simplified, split, or re-linked.
- What diagrams were added, updated, or intentionally skipped, and why.
- Whether metadata/frontmatter was intentionally added, changed, or skipped.
- Whether `docs/文档清单.md`, nearby README files, anchors, references, and `progress.md` needed updates, including whether `progress.md` size/archiving was checked.
- Which scans or validation commands passed.
- What remains intentionally out of scope, especially runtime behavior, schema, RBAC, deployment, customer raw evidence, archive/reference rewriting, and broad directory reorganization.
