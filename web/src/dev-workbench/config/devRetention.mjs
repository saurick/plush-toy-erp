export const RETENTION_STATES = Object.freeze({
  retained: { label: '保留中', color: 'success' },
  protected: { label: '受保护', color: 'processing' },
  cleaned: { label: '已清理', color: 'default' },
  cleaning: { label: '清理待核对', color: 'warning' },
  eligible: { label: '待轮换', color: 'warning' },
  unverified: { label: '待核对', color: 'warning' },
})

export function versionRetention(version, summary) {
  return (
    summary?.retention?.versions?.find(
      (item) => item.gitSha === version.gitSha
    ) ?? null
  )
}

export function retainedBackupRows(summary, environment) {
  return (summary?.backups ?? [])
    .filter((item) => item.environment === environment)
    .sort(
      (a, b) =>
        Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
        a.id.localeCompare(b.id)
    )
}
