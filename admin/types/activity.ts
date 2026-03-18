export type QueueActivityItem = {
  jobId: string
  label: string
  detail?: string
  progress: number
  status: string
  attemptsMade?: number
  failedReason?: string
  problemType?: 'dependency_unreachable' | 'source_missing' | 'stalled' | 'unknown'
  suggestedAction?: string
}

export type QueueActivityGroup = {
  waiting: number
  active: number
  delayed: number
  failed: number
  activeJobs: QueueActivityItem[]
  queuedJobs: QueueActivityItem[]
  recentFailures: QueueActivityItem[]
}

export type SystemActivityResponse = {
  lastUpdated: string
  hasBackgroundWork: boolean
  embeddings: QueueActivityGroup
  downloads: QueueActivityGroup
  modelDownloads: QueueActivityGroup
}
