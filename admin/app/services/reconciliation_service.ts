import { inject } from '@adonisjs/core'
import { DockerService } from '#services/docker_service'
import { QueueService } from './queue_service.js'
import { SERVICE_NAMES } from '../../constants/service_names.js'
import Service from '#models/service'
import type { DiagnosticCheck, DiagnosticsResponse, ReconcileResponse } from '../../types/system.js'
import { constants as fsConstants } from 'node:fs'
import { access, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import axios from 'axios'
import os from 'node:os'
import { RunDownloadJob } from '#jobs/run_download_job'
import { ZimService } from '#services/zim_service'
import { getFileStatsIfExists } from '../utils/fs.js'
import type { RunDownloadJobParams } from '../../types/downloads.js'

@inject()
export class ReconciliationService {
  private lastAutoRunAt = 0
  private readonly autoCooldownMs = 2 * 60 * 1000
  private reconcilePromise: Promise<ReconcileResponse> | null = null

  constructor(
    private dockerService: DockerService,
    private queueService: QueueService
  ) {}

  async getDiagnostics(): Promise<DiagnosticsResponse> {
    const checks: DiagnosticCheck[] = []

    const dockerInfo = await this.checkDocker()
    checks.push(dockerInfo)

    const storage = await this.checkStorage()
    checks.push(storage)

    const serviceState = await this.checkInstalledServices()
    checks.push(serviceState)

    const ollama = await this.checkServiceReachability(
      SERVICE_NAMES.OLLAMA,
      '/api/tags',
      'AI Service Reachability',
      'The AI assistant and RAG indexing depend on Ollama being reachable.'
    )
    checks.push(ollama)

    const qdrant = await this.checkServiceReachability(
      SERVICE_NAMES.QDRANT,
      '/collections',
      'Vector Database Reachability',
      'Knowledge-base indexing and retrieval depend on Qdrant being reachable.'
    )
    checks.push(qdrant)

    const gpu = await this.checkGpu()
    checks.push(gpu)

    const queues = await this.checkQueues()
    checks.push(queues)

    const summary = checks.reduce(
      (acc, check) => {
        acc[check.status] += 1
        return acc
      },
      { ok: 0, info: 0, warn: 0, error: 0 } as DiagnosticsResponse['summary']
    )

    return {
      generatedAt: new Date().toISOString(),
      summary,
      checks,
    }
  }

  async reconcileNow(options: {
    reason?: 'manual' | 'periodic'
    resumeInstalledServices?: boolean
    retryFailedEmbeddings?: boolean
    retryFailedDownloads?: boolean
    force?: boolean
  } = {}): Promise<ReconcileResponse> {
    const reason = options.reason ?? 'manual'
    const force = options.force ?? reason === 'manual'

    if (!force && Date.now() - this.lastAutoRunAt < this.autoCooldownMs) {
      return {
        success: true,
        skipped: true,
        message: 'Reconciliation skipped because the cooldown window is still active.',
        actions: [],
      }
    }

    if (this.reconcilePromise) {
      return this.reconcilePromise
    }

    this.reconcilePromise = (async () => {
      const actions: string[] = []

      try {
        const queueNeedsAI = await this.hasAIQueueBacklog()

        // Always keep core sidecars alive when they exist.
        for (const containerName of ['nomad_dozzle', 'nomad_updater', 'nomad_disk_collector']) {
          const started = await this.startContainerIfStopped(containerName)
          if (started) actions.push(`Started ${containerName}`)
        }

        // Only auto-nudge AI dependencies when queues are blocked on them.
        if (queueNeedsAI) {
          for (const containerName of [SERVICE_NAMES.OLLAMA, SERVICE_NAMES.QDRANT]) {
            const started = await this.startContainerIfStopped(containerName)
            if (started) actions.push(`Started ${containerName} for AI queue recovery`)
          }
        }

        if (options.resumeInstalledServices) {
          const installed = await Service.query().where('installed', true)
          for (const service of installed) {
            const started = await this.startContainerIfStopped(service.service_name)
            if (started) actions.push(`Resumed ${service.service_name}`)
          }
        }

        if (options.retryFailedEmbeddings) {
          const retried = await this.retryFailedEmbeddingJobs(10)
          if (retried > 0) {
            actions.push(`Retried ${retried} failed embedding job${retried === 1 ? '' : 's'}`)
          }
        }

        if (options.retryFailedDownloads || reason === 'manual') {
          const downloadResult = await this.repairFailedDownloadJobs(20)
          if (downloadResult.retried > 0) {
            actions.push(`Retried ${downloadResult.retried} failed download job${downloadResult.retried === 1 ? '' : 's'}`)
          }
          if (downloadResult.requeued > 0) {
            actions.push(`Requeued ${downloadResult.requeued} moved-source download${downloadResult.requeued === 1 ? '' : 's'}`)
          }
          if (downloadResult.dismissed > 0) {
            actions.push(`Dismissed ${downloadResult.dismissed} stale download failure${downloadResult.dismissed === 1 ? '' : 's'}`)
          }
        }

        this.lastAutoRunAt = Date.now()

        return {
          success: true,
          message:
            actions.length > 0
              ? 'Nomad nudged blocked services and queues.'
              : 'Nomad checked the system and did not need to change anything.',
          actions,
        }
      } finally {
        this.reconcilePromise = null
      }
    })()

    return this.reconcilePromise
  }

  async retryFailedEmbeddingJobs(limit: number = 10): Promise<number> {
    const queue = this.queueService.getQueue('file-embeddings')
    const jobs = await queue.getJobs(['failed'], 0, Math.max(0, limit - 1), false)
    let retried = 0

    for (const job of jobs) {
      await job.retry()
      retried++
    }

    return retried
  }

  async repairFailedDownloadJobs(limit: number = 20): Promise<{
    retried: number
    requeued: number
    dismissed: number
  }> {
    const queue = this.queueService.getQueue('downloads')
    const jobs = await queue.getJobs(['failed'], 0, Math.max(0, limit - 1), false)
    const result = { retried: 0, requeued: 0, dismissed: 0 }
    const zimService = new ZimService(this.dockerService)

    for (const job of jobs) {
      const data = job.data as RunDownloadJobParams
      const reason = `${job.failedReason || ''}`.toLowerCase()

      if (data.filetype === 'zim' && reason.includes('404')) {
        const resolved = await zimService.resolveRemoteDownloadTarget(
          data.url,
          data.resourceMetadata?.resource_id,
          data.resourceMetadata?.version
        )

        if (resolved.changed) {
          const resolvedFilepath = join(dirname(data.filepath), resolved.filename)
          const existingResolvedJob = await RunDownloadJob.getByUrl(resolved.url)
          const resolvedStats = await getFileStatsIfExists(resolvedFilepath)

          if (existingResolvedJob || resolvedStats) {
            await job.remove()
            result.dismissed++
            continue
          }

          await RunDownloadJob.dispatch({
            ...data,
            url: resolved.url,
            filepath: resolvedFilepath,
            resourceMetadata: data.resourceMetadata
              ? {
                  ...data.resourceMetadata,
                  version: resolved.version || data.resourceMetadata.version,
                }
              : data.resourceMetadata,
          })
          await job.remove()
          result.requeued++
          continue
        }
      }

      if (reason.includes('stalled')) {
        await job.retry()
        result.retried++
      }
    }

    return result
  }

  private async hasAIQueueBacklog(): Promise<boolean> {
    const embedCounts = await this.queueService.getQueue('file-embeddings').getJobCounts(
      'waiting',
      'active',
      'delayed'
    )
    const modelCounts = await this.queueService.getQueue('model-downloads').getJobCounts(
      'waiting',
      'active',
      'delayed'
    )

    return (
      (embedCounts.waiting ?? 0) +
        (embedCounts.active ?? 0) +
        (embedCounts.delayed ?? 0) +
        (modelCounts.waiting ?? 0) +
        (modelCounts.active ?? 0) +
        (modelCounts.delayed ?? 0) >
      0
    )
  }

  private async checkDocker(): Promise<DiagnosticCheck> {
    try {
      await this.dockerService.docker.info()
      return {
        key: 'docker',
        title: 'Docker Engine',
        status: 'ok',
        summary: 'Docker is reachable from Nomad.',
        technicalDetails: ['Docker API responded successfully.'],
      }
    } catch (error) {
      return {
        key: 'docker',
        title: 'Docker Engine',
        status: 'error',
        summary: 'Nomad cannot talk to the Docker engine.',
        impact: 'Services cannot be installed, restarted, or diagnosed correctly.',
        suggestedAction: 'Check Docker on the host and restart the Nomad stack.',
        technicalDetails: [error instanceof Error ? error.message : String(error)],
        autoFixAction: null,
      }
    }
  }

  private async checkStorage(): Promise<DiagnosticCheck> {
    const target = '/app/storage'
    const probeFile = join(target, '.nomad-healthcheck.tmp')

    try {
      await access(target, fsConstants.W_OK)
      await writeFile(probeFile, `healthcheck ${new Date().toISOString()} ${os.hostname()}`)
      await rm(probeFile, { force: true })

      return {
        key: 'storage',
        title: 'Storage Mount',
        status: 'ok',
        summary: 'Nomad storage is mounted and writable.',
        technicalDetails: [target],
      }
    } catch (error) {
      return {
        key: 'storage',
        title: 'Storage Mount',
        status: 'error',
        summary: 'Nomad storage is missing or not writable.',
        impact: 'Downloads, logs, and indexing can fail or become inconsistent.',
        suggestedAction: 'Check the external storage mount and verify write permissions.',
        technicalDetails: [target, error instanceof Error ? error.message : String(error)],
        autoFixAction: null,
      }
    }
  }

  private async checkInstalledServices(): Promise<DiagnosticCheck> {
    const installedServices = await Service.query().where('installed', true)
    const containers = await this.dockerService.docker.listContainers({ all: true })
    const byName = new Map(containers.flatMap((container) => container.Names.map((name) => [name.replace('/', ''), container] as const)))

    const stopped = installedServices.filter((service) => {
      const container = byName.get(service.service_name)
      return !container || container.State !== 'running'
    })

    if (stopped.length === 0) {
      return {
        key: 'installed-services',
        title: 'Installed Services',
        status: 'ok',
        summary: 'All installed services are currently running.',
      }
    }

    return {
      key: 'installed-services',
      title: 'Installed Services',
      status: 'warn',
      summary: `${stopped.length} installed service${stopped.length === 1 ? '' : 's'} are stopped.`,
      impact: 'Features may appear installed in the UI but still be unavailable.',
      suggestedAction: 'Use “Resume Installed Services” to bring stopped containers back.',
      technicalDetails: stopped.map((service) => service.service_name),
      autoFixAction: 'resume-installed',
    }
  }

  private async checkServiceReachability(
    serviceName: string,
    path: string,
    title: string,
    impact: string
  ): Promise<DiagnosticCheck> {
    const url = await this.dockerService.getServiceURL(serviceName)
    const containerState = await this.getContainerState(serviceName)

    if (!containerState.exists || containerState.state !== 'running') {
      return {
        key: serviceName,
        title,
        status: 'warn',
        summary: `${serviceName} is not running.`,
        impact,
        suggestedAction: 'Run reconciliation to restart blocked backend services.',
        technicalDetails: [`Container state: ${containerState.state ?? 'missing'}`],
        autoFixAction: 'reconcile',
      }
    }

    if (!url) {
      return {
        key: serviceName,
        title,
        status: 'warn',
        summary: `Nomad could not determine a reachable URL for ${serviceName}.`,
        impact,
        suggestedAction: 'Run reconciliation and verify the container configuration.',
        technicalDetails: [`No URL could be derived for ${serviceName}.`],
        autoFixAction: 'reconcile',
      }
    }

    try {
      await axios.get(new URL(path, `${url}/`).toString(), { timeout: 5000 })
      return {
        key: serviceName,
        title,
        status: 'ok',
        summary: `${serviceName} responded successfully.`,
        technicalDetails: [url],
      }
    } catch (error) {
      return {
        key: serviceName,
        title,
        status: 'warn',
        summary: `${serviceName} is running but did not answer health checks.`,
        impact,
        suggestedAction: 'Run reconciliation. If the problem persists, inspect the service logs.',
        technicalDetails: [url, error instanceof Error ? error.message : String(error)],
        autoFixAction: 'reconcile',
      }
    }
  }

  private async checkGpu(): Promise<DiagnosticCheck> {
    const ollamaState = await this.getContainerState(SERVICE_NAMES.OLLAMA)

    if (!ollamaState.exists || ollamaState.state !== 'running') {
      return {
        key: 'gpu',
        title: 'GPU Access',
        status: 'info',
        summary: 'GPU checks were skipped because Ollama is not running.',
      }
    }

    try {
      const container = this.dockerService.docker.getContainer(SERVICE_NAMES.OLLAMA)
      const exec = await container.exec({
        Cmd: ['sh', '-lc', 'nvidia-smi -L'],
        AttachStdout: true,
        AttachStderr: true,
      })
      const stream = await exec.start({ hijack: false, stdin: false })
      const output = await new Promise<string>((resolve) => {
        let text = ''
        stream.on('data', (chunk: Buffer) => {
          text += chunk.toString()
        })
        stream.on('end', () => resolve(text.trim()))
      })
      const normalizedOutput = output.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim()

      if (!normalizedOutput || normalizedOutput.toLowerCase().includes('no devices found')) {
        return {
          key: 'gpu',
          title: 'GPU Access',
          status: 'warn',
          summary: 'Ollama is running, but no NVIDIA device was visible inside the container.',
          impact: 'AI inference may fall back to CPU and feel much slower than expected.',
          suggestedAction: 'Reinstall or restart the AI service and verify NVIDIA passthrough on the host.',
          technicalDetails: [normalizedOutput || 'No GPU devices reported by nvidia-smi.'],
        }
      }

      if (
        normalizedOutput &&
        !normalizedOutput.toLowerCase().includes('not found') &&
        !normalizedOutput.toLowerCase().includes('command not found')
      ) {
        return {
          key: 'gpu',
          title: 'GPU Access',
          status: 'ok',
          summary: 'Ollama can see an NVIDIA GPU.',
          technicalDetails: [normalizedOutput],
        }
      }
    } catch (error) {
      return {
        key: 'gpu',
        title: 'GPU Access',
        status: 'info',
        summary: 'Ollama is running without visible NVIDIA tooling.',
        impact: 'Inference may fall back to CPU depending on the current model and runtime.',
        suggestedAction: 'If AI feels slow, reinstall or restart the AI service and check GPU passthrough.',
        technicalDetails: [error instanceof Error ? error.message : String(error)],
      }
    }

    return {
      key: 'gpu',
      title: 'GPU Access',
      status: 'info',
      summary: 'Ollama is running, but GPU availability could not be confirmed.',
    }
  }

  private async checkQueues(): Promise<DiagnosticCheck> {
    const embedCounts = await this.queueService.getQueue('file-embeddings').getJobCounts(
      'waiting',
      'active',
      'delayed',
      'failed'
    )
    const downloadCounts = await this.queueService.getQueue('downloads').getJobCounts(
      'waiting',
      'active',
      'delayed',
      'failed'
    )
    const embedFailed = embedCounts.failed ?? 0
    const downloadFailed = downloadCounts.failed ?? 0
    const failedTotal = embedFailed + downloadFailed
    const backlogTotal =
      (embedCounts.waiting ?? 0) +
      (embedCounts.active ?? 0) +
      (embedCounts.delayed ?? 0) +
      (downloadCounts.waiting ?? 0) +
      (downloadCounts.active ?? 0) +
      (downloadCounts.delayed ?? 0)

    if (backlogTotal === 0 && failedTotal === 0) {
      return {
        key: 'queues',
        title: 'Background Queues',
        status: 'ok',
        summary: 'No queue backlog or failed jobs were detected.',
      }
    }

    return {
      key: 'queues',
      title: 'Background Queues',
      status: failedTotal > 0 ? 'warn' : 'info',
      summary: `${backlogTotal} queued/retrying jobs and ${failedTotal} failed jobs detected.`,
      impact: 'Downloads or indexing may take longer, and some items may need attention.',
      suggestedAction:
        failedTotal > 0
          ? 'Retry failed embedding jobs after Nomad has recovered its dependencies.'
          : 'Nomad will keep processing in the background.',
      technicalDetails: [
        `Embeddings: waiting=${embedCounts.waiting ?? 0}, active=${embedCounts.active ?? 0}, delayed=${embedCounts.delayed ?? 0}, failed=${embedCounts.failed ?? 0}`,
        `Downloads: waiting=${downloadCounts.waiting ?? 0}, active=${downloadCounts.active ?? 0}, delayed=${downloadCounts.delayed ?? 0}, failed=${downloadCounts.failed ?? 0}`,
      ],
      autoFixAction:
        downloadFailed > 0
          ? 'retry-failed-downloads'
          : failedTotal > 0
            ? 'retry-failed-embeddings'
            : 'reconcile',
    }
  }

  private async startContainerIfStopped(containerName: string): Promise<boolean> {
    const state = await this.getContainerState(containerName)
    if (!state.exists || state.state === 'running') {
      return false
    }

    try {
      await this.dockerService.docker.getContainer(containerName).start()
      return true
    } catch {
      return false
    }
  }

  private async getContainerState(containerName: string): Promise<{
    exists: boolean
    state?: string
  }> {
    const containers = await this.dockerService.docker.listContainers({ all: true })
    const container = containers.find((item) => item.Names.includes(`/${containerName}`))
    if (!container) {
      return { exists: false }
    }

    return {
      exists: true,
      state: container.State,
    }
  }
}
