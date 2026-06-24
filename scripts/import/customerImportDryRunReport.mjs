import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

async function writeJson(filePath, data) {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

export async function writeDryRunPackage({
  outDir,
  formats,
  sourcePath,
  existingPath,
  command,
  data,
}) {
  await mkdir(outDir, { recursive: true })
  if (formats.has('json')) {
    await writeJson(path.join(outDir, 'source-references.json'), data.sourceReferences)
    await writeJson(path.join(outDir, 'normalized-rows.json'), data.normalizedRows)
    await writeJson(path.join(outDir, 'candidates.json'), data.candidates)
    await writeJson(path.join(outDir, 'unresolved-queue.json'), data.unresolvedQueue)
    await writeJson(path.join(outDir, 'duplicates.json'), data.duplicates)
    await writeJson(path.join(outDir, 'conflicts.json'), data.conflicts)
    await writeJson(path.join(outDir, 'forbidden-auto-import.json'), data.forbiddenAutoImport)
    await writeJson(path.join(outDir, 'validation-summary.json'), data.validationSummary)
  }
  if (formats.has('md')) {
    await writeFile(
      path.join(outDir, 'dry-run-report.md'),
      renderMarkdownReport({
        sourcePath,
        existingPath,
        outDir,
        command,
        data,
      }),
      'utf8'
    )
  }
}

function renderMarkdownReport({ sourcePath, existingPath, outDir, command, data }) {
  const summary = data.validationSummary
  const candidateRows = Object.entries(summary.candidateCountsByAction)
    .map(([action, count]) => `| ${action} | ${count} |`)
    .join('\n')
  const unresolvedRows = Object.entries(summary.unresolvedCountsBySeverity)
    .map(([severity, count]) => `| ${severity} | ${count} |`)
    .join('\n')
  const forbiddenList =
    data.forbiddenAutoImport.length === 0
      ? '- None'
      : data.forbiddenAutoImport
          .slice(0, 20)
          .map(
            (item) =>
              `- ${item.sourceReference}: ${item.forbiddenTarget} (${item.boundary})`
          )
          .join('\n')
  const duplicateList =
    data.duplicates.length === 0
      ? '- None'
      : data.duplicates
          .slice(0, 20)
          .map(
            (item) =>
              `- ${item.targetModel} ${item.duplicateType} ${item.key}: ${item.reason}`
          )
          .join('\n')
  const conflictList =
    data.conflicts.length === 0
      ? '- None'
      : data.conflicts
          .slice(0, 20)
          .map((item) => `- ${item.targetModel} ${item.key}: ${item.reason}`)
          .join('\n')

  return `# Yoyoosun Customer Import Dry-run Report

## Command

\`\`\`bash
${command ?? 'node scripts/import/customerImportDryRun.mjs ...'}
\`\`\`

## Inputs

- Source snapshot: \`${sourcePath}\`
- Existing snapshot: \`${existingPath}\`
- Output directory: \`${outDir}\`

## Summary

| Metric | Value |
|---|---:|
| totalSources | ${summary.totalSources} |
| normalizedRows | ${summary.normalizedRows} |
| forbiddenCount | ${summary.forbiddenCount} |
| duplicateCount | ${summary.duplicateCount} |
| conflictCount | ${summary.conflictCount} |
| blockerCount | ${summary.blockerCount} |
| canProceedToManualReview | ${summary.canProceedToManualReview} |
| canExecuteRealImport | ${summary.canExecuteRealImport} |

## Candidate Counts

| actionCandidate | count |
|---|---:|
${candidateRows}

## Unresolved Counts

| severity | count |
|---|---:|
${unresolvedRows}

## Forbidden Auto-import Summary

${forbiddenList}

## Duplicate Summary

${duplicateList}

## Conflict Summary

${conflictList}

## No real import

No real import is executed by this dry-run package. The tool does not connect to a database, does not write formal V1 tables, does not write \`business_records\`, does not create SQL, and does not modify schema, API, UI, seedData, or docs registry. \`canExecuteRealImport\` is always \`false\`.

## Next manual review steps

1. Review \`unresolved-queue.json\` and resolve block / defer / review items manually.
2. Review \`duplicates.json\` and \`conflicts.json\` before any future loader design.
3. Confirm \`forbidden-auto-import.json\` remains excluded from real import.
4. Only a separate future implementation task may design or implement real import execution with backup, rollback, idempotency, validation, and customer sign-off.
`
}
