import { inject } from '@adonisjs/core'
import { QueueService } from './queue_service.js'
import { EmbedFileJob } from '#jobs/embed_file_job'
import { RunDownloadJob } from '#jobs/run_download_job'
import { DownloadModelJob } from '#jobs/download_model_job'
import type { Queue, Job } from 'bullmq'
import type { QueueActivityGroup, QueueActivityItem, SystemActivityResponse } from '../../types/activity.js'
import { basename } from 'node:path'

@inject()
export class ActivityService {
  constructor(private queueService: QueueService) {}

  async getSystemActivity(): Promise<SystemActivityResponse> {
    const embeddings = await this.getQueueActivity(this.queueService.getQueue(EmbedFileJob.queue), 'embeddings')
    const downloads = await this.getQueueActivity(this.queueService.getQueue(RunDownloadJob.queue), 'downloads')
    const modelDownloads = await this.getQueueActivity(
      this.queueService.getQueue(DownloadModelJob.queue),
      'model-downloads'
    )

    return {
      lastUpdated: new Date().toISOString(),
      hasBackgroundWork:
        embeddings.waiting + embeddings.active + embeddings.delayed +
        downloads.waiting + downloads.active + downloads.delayed +
        modelDownloads.waiting + modelDownloads.active + modelDownloads.delayed > 0,
      embeddings,
      downloads,
      modelDownloads,
    }
  }

  private async getQueueActivity(
    queue: Queue,
    kind: 'embeddings' | 'downloads' | 'model-downloads'
  ): Promise<QueueActivityGroup> {
    const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed')
    const [activeJobs, queuedJobs, failedJobs] = await Promise.all([
      queue.getJobs(['active'], 0, 4, false),
      queue.getJobs(['waiting', 'delayed'], 0, 4, false),
      queue.getJobs(['failed'], 0, 2, false),
    ])

    return {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      delayed: counts.delayed ?? 0,
      failed: counts.failed ?? 0,
      activeJobs: await Promise.all(activeJobs.map((job) => this.formatJob(job, kind))),
      queuedJobs: await Promise.all(queuedJobs.map((job) => this.formatJob(job, kind))),
      recentFailures: await Promise.all(failedJobs.map((job) => this.formatJob(job, kind))),
    }
  }

  private async formatJob(
    job: Job,
    kind: 'embeddings' | 'downloads' | 'model-downloads'
  ): Promise<QueueActivityItem> {
    const state = await job.getState()
    const progress = typeof job.progress === 'number'
      ? job.progress
      : Number.parseInt(job.progress?.toString?.() || '0', 10) || 0

    const normalizedStatus = this.normalizeStatus(state, job.data.status)

    if (kind === 'embeddings') {
      const failureInfo = this.classifyFailure(job.failedReason || job.data.error)
      return {
        jobId: job.id?.toString() || 'unknown',
        label: job.data.fileName || basename(job.data.filePath || 'Unknown file'),
        detail: job.data.filePath || undefined,
        progress,
        status: normalizedStatus,
        attemptsMade: job.attemptsMade,
        failedReason: job.failedReason || undefined,
        problemType: failureInfo.problemType,
        suggestedAction: failureInfo.suggestedAction,
      }
    }

    if (kind === 'downloads') {
      const failureInfo = this.classifyFailure(job.failedReason || job.data.error)
      return {
        jobId: job.id?.toString() || 'unknown',
        label: basename(job.data.filepath || '') || job.data.url || 'Download',
        detail: job.data.url || job.data.filepath || undefined,
        progress,
        status: state === 'active' ? 'downloading' : state,
        attemptsMade: job.attemptsMade,
        failedReason: job.failedReason || undefined,
        problemType: failureInfo.problemType,
        suggestedAction: failureInfo.suggestedAction,
      }
    }

    const failureInfo = this.classifyFailure(job.failedReason || job.data.error)
    return {
      jobId: job.id?.toString() || 'unknown',
      label: job.data.modelName || 'Model download',
      detail: 'Ollama model pull',
      progress,
      status: normalizedStatus,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason || undefined,
      problemType: failureInfo.problemType,
      suggestedAction: failureInfo.suggestedAction,
    }
  }

  private normalizeStatus(state: string, jobDataStatus?: string): string {
    if (state === 'delayed') return 'retrying'
    if (state === 'waiting') return 'waiting'
    if (state === 'active') return jobDataStatus === 'processing' ? 'processing' : 'active'
    if (state === 'failed') return 'failed'
    return jobDataStatus || state
  }

  private classifyFailure(reason?: string): Pick<QueueActivityItem, 'problemType' | 'suggestedAction'> {
    const normalized = (reason || '').toLowerCase()

    if (!normalized) {
      return { problemType: 'unknown', suggestedAction: undefined }
    }

    if (normalized.includes('404')) {
      return {
        problemType: 'source_missing',
        suggestedAction: 'The source URL no longer exists. Remove or replace this item with a newer source.',
      }
    }

    if (normalized.includes('stalled')) {
      return {
        problemType: 'stalled',
        suggestedAction: 'Retry the failed job after checking container health and available memory.',
      }
    }

    if (normalized.includes('fetch failed') || normalized.includes('service unavailable')) {
      return {
        problemType: 'dependency_unreachable',
        suggestedAction: 'Nomad will retry automatically. If it keeps failing, run diagnostics and resume blocked services.',
      }
    }

    return {
      problemType: 'unknown',
      suggestedAction: 'Open diagnostics for details and retry once the underlying issue is fixed.',
    }
  }
}
