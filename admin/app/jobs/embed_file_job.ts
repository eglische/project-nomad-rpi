import { Job } from 'bullmq'
import { QueueService } from '#services/queue_service'
import { EmbedJobWithProgress } from '../../types/rag.js'
import { RagService } from '#services/rag_service'
import { DockerService } from '#services/docker_service'
import { OllamaService } from '#services/ollama_service'
import { createHash } from 'crypto'
import logger from '@adonisjs/core/services/logger'
import axios from 'axios'
import { SERVICE_NAMES } from '../../constants/service_names.js'

export interface EmbedFileJobParams {
  filePath: string
  fileName: string
  fileSize?: number
  // Batch processing for large ZIM files
  batchOffset?: number  // Current batch offset (for ZIM files)
  totalArticles?: number // Total articles in ZIM (for progress tracking)
  isFinalBatch?: boolean // Whether this is the last batch (prevents premature deletion)
}

export class EmbedFileJob {
  static get queue() {
    return 'file-embeddings'
  }

  static get key() {
    return 'embed-file'
  }

  static getJobId(filePath: string): string {
    return createHash('sha256').update(filePath).digest('hex').slice(0, 16)
  }

  async handle(job: Job) {
    const { filePath, fileName, batchOffset, totalArticles } = job.data as EmbedFileJobParams

    const isZimBatch = batchOffset !== undefined
    const batchInfo = isZimBatch ? ` (batch offset: ${batchOffset})` : ''
    logger.info(`[EmbedFileJob] Starting embedding process for: ${fileName}${batchInfo}`)

    const dockerService = new DockerService()
    const ollamaService = new OllamaService()
    const ragService = new RagService(dockerService, ollamaService)

    try {
      // Check if Ollama and Qdrant services are ready
      let existingModels
      try {
        existingModels = await ollamaService.getModels()
      } catch (error) {
        throw await this.buildActionableDependencyError(dockerService, error)
      }
      if (!existingModels) {
        logger.warn('[EmbedFileJob] Ollama service not ready yet. Will retry...')
        throw new Error('Ollama service not ready yet')
      }

      const qdrantUrl = await dockerService.getServiceURL('nomad_qdrant')
      if (!qdrantUrl) {
        logger.warn('[EmbedFileJob] Qdrant service not ready yet. Will retry...')
        throw new Error('Qdrant service not ready yet')
      }
      try {
        await axios.get(new URL('/collections', `${qdrantUrl}/`).toString(), { timeout: 5000 })
      } catch (error) {
        throw new Error(
          `Qdrant service unavailable. Nomad will retry automatically once it becomes reachable. ${error instanceof Error ? error.message : error}`
        )
      }

      logger.info(`[EmbedFileJob] Services ready. Processing file: ${fileName}`)

      // Update progress starting
      await job.updateProgress(5)
      await job.updateData({
        ...job.data,
        status: 'processing',
        startedAt: job.data.startedAt || Date.now(),
      })

      logger.info(`[EmbedFileJob] Processing file: ${filePath}`)

      // Progress callback: maps service-reported 0-100% into the 5-95% job range
      const onProgress = async (percent: number) => {
        await job.updateProgress(Math.min(95, Math.round(5 + percent * 0.9)))
      }

      // Process and embed the file
      // Only allow deletion if explicitly marked as final batch
      const allowDeletion = job.data.isFinalBatch === true
      const result = await ragService.processAndEmbedFile(
        filePath,
        allowDeletion,
        batchOffset,
        onProgress
      )

      if (!result.success) {
        logger.error(`[EmbedFileJob] Failed to process file ${fileName}: ${result.message}`)
        throw new Error(result.message)
      }

      // For ZIM files with batching, check if more batches are needed
      if (result.hasMoreBatches) {
        const nextOffset = (batchOffset || 0) + (result.articlesProcessed || 0)
        logger.info(
          `[EmbedFileJob] Batch complete. Dispatching next batch at offset ${nextOffset}`
        )

        // Dispatch next batch (not final yet)
        await EmbedFileJob.dispatch({
          filePath,
          fileName,
          batchOffset: nextOffset,
          totalArticles: totalArticles || result.totalArticles,
          isFinalBatch: false, // Explicitly not final
        })

        // Calculate progress based on articles processed
        const progress = totalArticles
          ? Math.round((nextOffset / totalArticles) * 100)
          : 50

        await job.updateProgress(progress)
        await job.updateData({
          ...job.data,
          status: 'batch_completed',
          lastBatchAt: Date.now(),
          chunks: (job.data.chunks || 0) + (result.chunks || 0),
        })

        return {
          success: true,
          fileName,
          filePath,
          chunks: result.chunks,
          hasMoreBatches: true,
          nextOffset,
          message: `Batch embedded ${result.chunks} chunks, next batch queued`,
        }
      }

      // Final batch or non-batched file - mark as complete
      const totalChunks = (job.data.chunks || 0) + (result.chunks || 0)
      await job.updateProgress(100)
      await job.updateData({
        ...job.data,
        status: 'completed',
        completedAt: Date.now(),
        chunks: totalChunks,
      })

      const batchMsg = isZimBatch ? ` (final batch, total chunks: ${totalChunks})` : ''
      logger.info(
        `[EmbedFileJob] Successfully embedded ${result.chunks} chunks from file: ${fileName}${batchMsg}`
      )

      return {
        success: true,
        fileName,
        filePath,
        chunks: result.chunks,
        message: `Successfully embedded ${result.chunks} chunks`,
      }
    } catch (error) {
      const actionableError = await this.buildActionableError(dockerService, error)
      logger.error(`[EmbedFileJob] Error embedding file ${fileName}:`, actionableError)

      await job.updateData({
        ...job.data,
        status: 'failed',
        failedAt: Date.now(),
        error: actionableError.message,
        errorType: actionableError.type,
        suggestedAction: actionableError.suggestedAction,
      })

      throw actionableError
    }
  }

  static async listActiveJobs(): Promise<EmbedJobWithProgress[]> {
    const queueService = new QueueService()
    const queue = queueService.getQueue(this.queue)
    const jobs = await queue.getJobs(['waiting', 'active', 'delayed'])

    return jobs.map((job) => ({
      jobId: job.id!.toString(),
      fileName: (job.data as EmbedFileJobParams).fileName,
      filePath: (job.data as EmbedFileJobParams).filePath,
      progress: typeof job.progress === 'number' ? job.progress : 0,
      status: ((job.data as any).status as string) ?? 'waiting',
    }))
  }

  static async getByFilePath(filePath: string): Promise<Job | undefined> {
    const queueService = new QueueService()
    const queue = queueService.getQueue(this.queue)
    const jobId = this.getJobId(filePath)
    return await queue.getJob(jobId)
  }

  static async dispatch(params: EmbedFileJobParams) {
    const queueService = new QueueService()
    const queue = queueService.getQueue(this.queue)
    const jobId = this.getJobId(params.filePath)

    try {
      const job = await queue.add(this.key, params, {
        jobId,
        attempts: 30,
        backoff: {
          type: 'fixed',
          delay: 60000, // Check every 60 seconds for service readiness
        },
        removeOnComplete: { count: 50 }, // Keep last 50 completed jobs for history
        removeOnFail: { count: 20 } // Keep last 20 failed jobs for debugging
      })

      logger.info(`[EmbedFileJob] Dispatched embedding job for file: ${params.fileName}`)

      return {
        job,
        created: true,
        jobId,
        message: `File queued for embedding: ${params.fileName}`,
      }
    } catch (error) {
      if (error.message && error.message.includes('job already exists')) {
        const existing = await queue.getJob(jobId)
        logger.info(`[EmbedFileJob] Job already exists for file: ${params.fileName}`)
        return {
          job: existing,
          created: false,
          jobId,
          message: `Embedding job already exists for: ${params.fileName}`,
        }
      }
      throw error
    }
  }

  static async getStatus(filePath: string): Promise<{
    exists: boolean
    status?: string
    progress?: number
    chunks?: number
    error?: string
  }> {
    const job = await this.getByFilePath(filePath)

    if (!job) {
      return { exists: false }
    }

    const state = await job.getState()
    const data = job.data

    return {
      exists: true,
      status: data.status || state,
      progress: typeof job.progress === 'number' ? job.progress : undefined,
      chunks: data.chunks,
      error: data.error,
    }
  }

  private async buildActionableDependencyError(dockerService: DockerService, error: unknown): Promise<Error> {
    const ollamaState = await this.getContainerState(dockerService, SERVICE_NAMES.OLLAMA)
    if (!ollamaState.exists || ollamaState.state !== 'running') {
      return new Error('Ollama service unavailable. Nomad will retry automatically once the AI service is running again.')
    }

    return new Error(
      `Ollama API unavailable. Nomad will retry automatically. ${error instanceof Error ? error.message : error}`
    )
  }

  private async buildActionableError(
    dockerService: DockerService,
    error: unknown
  ): Promise<Error & { type?: string; suggestedAction?: string }> {
    const message = error instanceof Error ? error.message : String(error)
    const lower = message.toLowerCase()
    const actionable = new Error(message) as Error & { type?: string; suggestedAction?: string }

    if (lower.includes('ollama')) {
      actionable.type = 'dependency_unreachable'
      actionable.suggestedAction = 'Run diagnostics or resume blocked AI services.'
      return actionable
    }

    if (lower.includes('qdrant')) {
      actionable.type = 'dependency_unreachable'
      actionable.suggestedAction = 'Run diagnostics or resume the vector database service.'
      return actionable
    }

    if (lower.includes('stalled')) {
      actionable.type = 'stalled'
      actionable.suggestedAction = 'Retry the failed job once the system is healthy.'
      return actionable
    }

    if (lower.includes('fetch failed')) {
      const ollamaState = await this.getContainerState(dockerService, SERVICE_NAMES.OLLAMA)
      const qdrantState = await this.getContainerState(dockerService, SERVICE_NAMES.QDRANT)

      if (!ollamaState.exists || ollamaState.state !== 'running') {
        actionable.message = 'Ollama service unavailable. Nomad will retry automatically once the AI service is running again.'
        actionable.type = 'dependency_unreachable'
        actionable.suggestedAction = 'Resume blocked AI services from System Settings.'
        return actionable
      }

      if (!qdrantState.exists || qdrantState.state !== 'running') {
        actionable.message = 'Qdrant service unavailable. Nomad will retry automatically once the vector database is running again.'
        actionable.type = 'dependency_unreachable'
        actionable.suggestedAction = 'Resume blocked AI services from System Settings.'
        return actionable
      }

      actionable.message = 'A dependency request failed during indexing. Nomad will retry automatically, but diagnostics can help identify the blocking service.'
      actionable.type = 'dependency_unreachable'
      actionable.suggestedAction = 'Run diagnostics and check the Health & Help section.'
      return actionable
    }

    actionable.type = 'unknown'
    actionable.suggestedAction = 'Open diagnostics for more detail and retry once the issue is resolved.'
    return actionable
  }

  private async getContainerState(dockerService: DockerService, containerName: string): Promise<{
    exists: boolean
    state?: string
  }> {
    const containers = await dockerService.docker.listContainers({ all: true })
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
