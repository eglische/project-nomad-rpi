import { inject } from '@adonisjs/core'
import { ChatRequest, Ollama } from 'ollama'
import { NomadOllamaModel, OllamaRuntimeStatus } from '../../types/ollama.js'
import { DEFAULT_EMBEDDING_MODEL, DEFAULT_QUERY_REWRITE_MODEL, FALLBACK_RECOMMENDED_OLLAMA_MODELS } from '../../constants/ollama.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import logger from '@adonisjs/core/services/logger'
import axios from 'axios'
import { DownloadModelJob } from '#jobs/download_model_job'
import { SERVICE_NAMES } from '../../constants/service_names.js'
import transmit from '@adonisjs/transmit/services/main'
import Fuse, { IFuseOptions } from 'fuse.js'
import { BROADCAST_CHANNELS } from '../../constants/broadcast.js'
import env from '#start/env'
import { NOMAD_API_DEFAULT_BASE_URL } from '../../constants/misc.js'
import KVStore from '#models/kv_store'

const NOMAD_MODELS_API_PATH = '/api/v1/ollama/models'
const MODELS_CACHE_FILE = path.join(process.cwd(), 'storage', 'ollama-models-cache.json')
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours
const CHAT_MODEL_KEEP_ALIVE = '24h'
const HELPER_MODEL_KEEP_ALIVE = '24h'

@inject()
export class OllamaService {
  private ollama: Ollama | null = null
  private ollamaInitPromise: Promise<void> | null = null
  private prewarmPromise: Promise<void> | null = null

  constructor() { }

  private async _initializeOllamaClient() {
    if (!this.ollamaInitPromise) {
      this.ollamaInitPromise = (async () => {
        const dockerService = new (await import('./docker_service.js')).DockerService()
        const qdrantUrl = await dockerService.getServiceURL(SERVICE_NAMES.OLLAMA)
        if (!qdrantUrl) {
          throw new Error('Ollama service is not installed or running.')
        }
        this.ollama = new Ollama({ host: qdrantUrl })
      })()
    }
    return this.ollamaInitPromise
  }

  private async _ensureDependencies() {
    if (!this.ollama) {
      await this._initializeOllamaClient()
    }
  }

  /**
   * Downloads a model from the Ollama service with progress tracking. Where possible,
   * one should dispatch a background job instead of calling this method directly to avoid long blocking.
   * @param model Model name to download
   * @returns Success status and message
   */
  async downloadModel(model: string, progressCallback?: (percent: number) => void): Promise<{ success: boolean; message: string }> {
    try {
      await this._ensureDependencies()
      if (!this.ollama) {
        throw new Error('Ollama client is not initialized.')
      }

      // See if model is already installed
      const installedModels = await this.getModels()
      if (installedModels && installedModels.some((m) => m.name === model)) {
        logger.info(`[OllamaService] Model "${model}" is already installed.`)
        return { success: true, message: 'Model is already installed.' }
      }

      // Returns AbortableAsyncIterator<ProgressResponse>
      const downloadStream = await this.ollama.pull({
        model,
        stream: true,
      })

      for await (const chunk of downloadStream) {
        if (chunk.completed && chunk.total) {
          const percent = ((chunk.completed / chunk.total) * 100).toFixed(2)
          const percentNum = parseFloat(percent)

          this.broadcastDownloadProgress(model, percentNum)
          if (progressCallback) {
            progressCallback(percentNum)
          }
        }
      }

      logger.info(`[OllamaService] Model "${model}" downloaded successfully.`)
      return { success: true, message: 'Model downloaded successfully.' }
    } catch (error) {
      logger.error(
        `[OllamaService] Failed to download model "${model}": ${error instanceof Error ? error.message : error
        }`
      )
      return { success: false, message: 'Failed to download model.' }
    }
  }

  async dispatchModelDownload(modelName: string): Promise<{ success: boolean; message: string }> {
    try {
      logger.info(`[OllamaService] Dispatching model download for ${modelName} via job queue`)

      await DownloadModelJob.dispatch({
        modelName,
      })

      return {
        success: true,
        message:
          'Model download has been queued successfully. It will start shortly after Ollama and Open WebUI are ready (if not already).',
      }
    } catch (error) {
      logger.error(
        `[OllamaService] Failed to dispatch model download for ${modelName}: ${error instanceof Error ? error.message : error}`
      )
      return {
        success: false,
        message: 'Failed to queue model download. Please try again.',
      }
    }
  }

  public async getClient() {
    await this._ensureDependencies()
    return this.ollama!
  }

  public async getRuntimeStatus(): Promise<OllamaRuntimeStatus> {
    try {
      await this._ensureDependencies()
      if (!this.ollama) {
        return { available: false, loadedModels: [], gpuMemoryUsedBytes: 0 }
      }

      const ps = await this.ollama.ps()
      const loadedModels = (ps.models || []).map((model) => ({
        name: model.name,
        size: Number(model.size || 0),
        sizeVramBytes: Number(model.size_vram || 0),
        until: model.expires_at ? new Date(model.expires_at).toISOString() : undefined,
      }))

      let gpuMemoryUsedBytes = 0

      try {
        const dockerService = new (await import('./docker_service.js')).DockerService()
        const container = dockerService.docker.getContainer(SERVICE_NAMES.OLLAMA)
        const exec = await container.exec({
          Cmd: [
            'sh',
            '-lc',
            'nvidia-smi --query-compute-apps=process_name,used_memory --format=csv,noheader,nounits 2>/dev/null || true',
          ],
          AttachStdout: true,
          AttachStderr: true,
        })
        const stream = await exec.start({ hijack: false, stdin: false })
        const output = await new Promise<string>((resolve) => {
          let text = ''
          stream.on('data', (chunk: Buffer) => {
            text += chunk.toString()
          })
          stream.on('end', () => resolve(text))
        })

        gpuMemoryUsedBytes = output
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .filter((line) => line.toLowerCase().includes('ollama'))
          .reduce((total, line) => {
            const parts = line.split(',').map((part) => part.trim())
            const memoryMiB = Number.parseInt(parts[1] || '0', 10)
            if (Number.isFinite(memoryMiB) && memoryMiB > 0) {
              return total + memoryMiB * 1024 * 1024
            }
            return total
          }, 0)
      } catch {
        gpuMemoryUsedBytes = 0
      }

      return {
        available: true,
        loadedModels,
        gpuMemoryUsedBytes,
      }
    } catch {
      return {
        available: false,
        loadedModels: [],
        gpuMemoryUsedBytes: 0,
      }
    }
  }

  public async chat(chatRequest: ChatRequest & { stream?: boolean }) {
    await this._ensureDependencies()
    if (!this.ollama) {
      throw new Error('Ollama client is not initialized.')
    }
    await this.ensureChatModelResidency(chatRequest.model)
    const keepAlive = await this.getChatModelKeepAlive(chatRequest.model)
    return await this.ollama.chat({
      ...chatRequest,
      ...(keepAlive !== undefined ? { keep_alive: keepAlive } : {}),
      stream: false,
    })
  }

  public async chatStream(chatRequest: ChatRequest) {
    await this._ensureDependencies()
    if (!this.ollama) {
      throw new Error('Ollama client is not initialized.')
    }
    await this.ensureChatModelResidency(chatRequest.model)
    const keepAlive = await this.getChatModelKeepAlive(chatRequest.model)
    return await this.ollama.chat({
      ...chatRequest,
      ...(keepAlive !== undefined ? { keep_alive: keepAlive } : {}),
      stream: true,
    })
  }

  public async loadChatModel(modelName: string): Promise<{ success: boolean; message: string }> {
    try {
      await this._ensureDependencies()
      if (!this.ollama) {
        throw new Error('Ollama client is not initialized.')
      }

      const installedModels = await this.getModels(true)
      const isInstalled = installedModels?.some((model) => model.name === modelName)
      if (!isInstalled) {
        return {
          success: false,
          message: `Model ${modelName} is not installed.`,
        }
      }

      await this.prewarmConfiguredHelperModels()
      await this.unloadNonHelperModelsExcept(modelName)
      await this.ollama.generate({
        model: modelName,
        prompt: '',
        stream: false,
        keep_alive: CHAT_MODEL_KEEP_ALIVE,
      })

      return {
        success: true,
        message: `Model ${modelName} is loaded and ready.`,
      }
    } catch (error) {
      logger.error(
        `[OllamaService] Failed to load chat model "${modelName}": ${error instanceof Error ? error.message : error}`
      )
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to load model.',
      }
    }
  }

  public async prewarmConfiguredModels(): Promise<void> {
    if (this.prewarmPromise) {
      return this.prewarmPromise
    }

    this.prewarmPromise = (async () => {
      try {
        await this._ensureDependencies()
        if (!this.ollama) {
          return
        }

        await this.prewarmConfiguredHelperModels()

        const installedModels = await this.getModels()
        if (!installedModels || installedModels.length === 0) {
          return
        }

        const targets = await this.getConfiguredChatPrewarmTargets(installedModels.map((model) => model.name))
        for (const targetModel of targets) {
          logger.info(`[OllamaService] Prewarming chat model: ${targetModel}`)
          await this.ollama.generate({
            model: targetModel,
            prompt: '',
            stream: false,
            keep_alive: CHAT_MODEL_KEEP_ALIVE,
          })
        }
      } catch (error) {
        logger.warn(
          `[OllamaService] Failed to prewarm configured models: ${error instanceof Error ? error.message : error}`
        )
      } finally {
        this.prewarmPromise = null
      }
    })()

    return this.prewarmPromise
  }

  public async prewarmConfiguredChatModel(): Promise<void> {
    return this.prewarmConfiguredModels()
  }

  public async getConfiguredHelperTextModel(): Promise<string> {
    return (await KVStore.getValue('ollama.helperTextModel')) || DEFAULT_QUERY_REWRITE_MODEL
  }

  public async getConfiguredEmbeddingModel(): Promise<string> {
    return (await KVStore.getValue('ollama.helperEmbeddingModel')) || DEFAULT_EMBEDDING_MODEL
  }

  public async getConfiguredHelperModels(): Promise<string[]> {
    const helperTextModel = await this.getConfiguredHelperTextModel()
    const helperEmbeddingModel = await this.getConfiguredEmbeddingModel()
    return [...new Set([helperTextModel, helperEmbeddingModel].filter(Boolean))]
  }

  public async getConfiguredDefaultChatModel(): Promise<string | null> {
    return (await KVStore.getValue('ollama.defaultChatModel')) || null
  }

  private async getConfiguredChatPrewarmTargets(installedModelNames: string[]): Promise<string[]> {
    const targets: string[] = []
    const defaultChatModel = await this.getConfiguredDefaultChatModel()
    const prewarmDefaultChatModel = await KVStore.getValue('ollama.prewarmDefaultChatModel')
    if (prewarmDefaultChatModel !== false && defaultChatModel && installedModelNames.includes(defaultChatModel)) {
      targets.push(defaultChatModel)
    }

    const selectedModel = await KVStore.getValue('chat.lastModel')
    const prewarmOnBoot = await KVStore.getValue('ollama.prewarmOnBoot')
    if (prewarmOnBoot !== false && selectedModel && installedModelNames.includes(selectedModel)) {
      targets.push(selectedModel)
    }

    return [...new Set(targets)]
  }

  private async prewarmConfiguredHelperModels(): Promise<void> {
    const prewarmHelperModels = await KVStore.getValue('ollama.prewarmHelperModels')
    if (prewarmHelperModels === false) {
      return
    }

    const allModels = await this.getModels(true)
    const installedNames = new Set((allModels || []).map((model) => model.name))
    const helperTextModel = await this.getConfiguredHelperTextModel()
    const embeddingModel = await this.getConfiguredEmbeddingModel()

    if (installedNames.has(helperTextModel)) {
      logger.info(`[OllamaService] Prewarming helper text model: ${helperTextModel}`)
      await this.ollama!.generate({
        model: helperTextModel,
        prompt: 'Warm.',
        stream: false,
        options: {
          num_predict: 1,
          temperature: 0,
        },
        keep_alive: HELPER_MODEL_KEEP_ALIVE,
      })
    }

    if (installedNames.has(embeddingModel)) {
      logger.info(`[OllamaService] Prewarming helper embedding model: ${embeddingModel}`)
      await this.ollama!.embed({
        model: embeddingModel,
        input: 'warmup',
        keep_alive: HELPER_MODEL_KEEP_ALIVE,
      })
    }
  }

  private async ensureChatModelResidency(modelName: string): Promise<void> {
    if (!this.ollama || !modelName) {
      return
    }

    await this.prewarmConfiguredHelperModels()
    await this.unloadNonHelperModelsExcept(modelName)
  }

  private async unloadNonHelperModelsExcept(modelName: string): Promise<void> {
    if (!this.ollama) {
      return
    }

    const helperModels = new Set(await this.getConfiguredHelperModels())
    const runtime = await this.ollama.ps()
    const loadedModels = runtime.models || []
    const keepLoaded = new Set([modelName, ...helperModels])

    for (const loadedModel of loadedModels) {
      if (keepLoaded.has(loadedModel.name)) {
        continue
      }

      try {
        logger.info(`[OllamaService] Unloading inactive chat model: ${loadedModel.name}`)
        await this.ollama.generate({
          model: loadedModel.name,
          prompt: '',
          stream: false,
          keep_alive: 0,
        })
      } catch (error) {
        logger.warn(
          `[OllamaService] Failed to unload model ${loadedModel.name}: ${error instanceof Error ? error.message : error}`
        )
      }
    }
  }

  private async getChatModelKeepAlive(modelName?: string): Promise<string | number | undefined> {
    if (!modelName) {
      return undefined
    }

    const keepModelWarm = await KVStore.getValue('ollama.keepModelWarm')
    if (keepModelWarm === false) {
      return undefined
    }

    const selectedModel = await KVStore.getValue('chat.lastModel')
    if (!selectedModel || selectedModel !== modelName) {
      return undefined
    }

    return CHAT_MODEL_KEEP_ALIVE
  }

  public async checkModelHasThinking(modelName: string): Promise<boolean> {
    await this._ensureDependencies()
    if (!this.ollama) {
      throw new Error('Ollama client is not initialized.')
    }

    const modelInfo = await this.ollama.show({
      model: modelName,
    })

    return modelInfo.capabilities.includes('thinking')
  }

  public async deleteModel(modelName: string) {
    await this._ensureDependencies()
    if (!this.ollama) {
      throw new Error('Ollama client is not initialized.')
    }

    return await this.ollama.delete({
      model: modelName,
    })
  }

  public async getModels(includeEmbeddings = false) {
    await this._ensureDependencies()
    if (!this.ollama) {
      throw new Error('Ollama client is not initialized.')
    }
    const response = await this.ollama.list()
    if (includeEmbeddings) {
      return response.models
    }
    // Filter out embedding models
    return response.models.filter((model) => !model.name.includes('embed'))
  }

  async getAvailableModels(
    { sort, recommendedOnly, query, limit, force }: { sort?: 'pulls' | 'name'; recommendedOnly?: boolean, query: string | null, limit?: number, force?: boolean } = {
      sort: 'pulls',
      recommendedOnly: false,
      query: null,
      limit: 15,
    }
  ): Promise<{ models: NomadOllamaModel[], hasMore: boolean } | null> {
    try {
      const models = await this.retrieveAndRefreshModels(sort, force)
      if (!models) {
        // If we fail to get models from the API, return the fallback recommended models
        logger.warn(
          '[OllamaService] Returning fallback recommended models due to failure in fetching available models'
        )
        return {
          models: FALLBACK_RECOMMENDED_OLLAMA_MODELS,
          hasMore: false
        }
      }

      if (!recommendedOnly) {
        const filteredModels = query ? this.fuseSearchModels(models, query) : models
        return {
          models: filteredModels.slice(0, limit || 15),
          hasMore: filteredModels.length > (limit || 15)
        }
      }

      // If recommendedOnly is true, only return the first three models (if sorted by pulls, these will be the top 3)
      const sortedByPulls = sort === 'pulls' ? models : this.sortModels(models, 'pulls')
      const firstThree = sortedByPulls.slice(0, 3)

      // Only return the first tag of each of these models (should be the most lightweight variant)
      const recommendedModels = firstThree.map((model) => {
        return {
          ...model,
          tags: model.tags && model.tags.length > 0 ? [model.tags[0]] : [],
        }
      })

      if (query) {
        const filteredRecommendedModels = this.fuseSearchModels(recommendedModels, query)
        return {
          models: filteredRecommendedModels,
          hasMore: filteredRecommendedModels.length > (limit || 15)
        }
      }

      return {
        models: recommendedModels,
        hasMore: recommendedModels.length > (limit || 15)
      }
    } catch (error) {
      logger.error(
        `[OllamaService] Failed to get available models: ${error instanceof Error ? error.message : error}`
      )
      return null
    }
  }

  private async retrieveAndRefreshModels(
    sort?: 'pulls' | 'name',
    force?: boolean
  ): Promise<NomadOllamaModel[] | null> {
    try {
      if (!force) {
        const cachedModels = await this.readModelsFromCache()
        if (cachedModels) {
          logger.info('[OllamaService] Using cached available models data')
          return this.sortModels(cachedModels, sort)
        }
      } else {
        logger.info('[OllamaService] Force refresh requested, bypassing cache')
      }

      logger.info('[OllamaService] Fetching fresh available models from API')

      const baseUrl = env.get('NOMAD_API_URL') || NOMAD_API_DEFAULT_BASE_URL
      const fullUrl = new URL(NOMAD_MODELS_API_PATH, baseUrl).toString()

      const response = await axios.get(fullUrl)
      if (!response.data || !Array.isArray(response.data.models)) {
        logger.warn(
          `[OllamaService] Invalid response format when fetching available models: ${JSON.stringify(response.data)}`
        )
        return null
      }

      const rawModels = response.data.models as NomadOllamaModel[]

      // Filter out tags where cloud is truthy, then remove models with no remaining tags
      const noCloud = rawModels
        .map((model) => ({
          ...model,
          tags: model.tags.filter((tag) => !tag.cloud),
        }))
        .filter((model) => model.tags.length > 0)

      await this.writeModelsToCache(noCloud)
      return this.sortModels(noCloud, sort)
    } catch (error) {
      logger.error(
        `[OllamaService] Failed to retrieve models from Nomad API: ${error instanceof Error ? error.message : error
        }`
      )
      return null
    }
  }

  private async readModelsFromCache(): Promise<NomadOllamaModel[] | null> {
    try {
      const stats = await fs.stat(MODELS_CACHE_FILE)
      const cacheAge = Date.now() - stats.mtimeMs

      if (cacheAge > CACHE_MAX_AGE_MS) {
        logger.info('[OllamaService] Cache is stale, will fetch fresh data')
        return null
      }

      const cacheData = await fs.readFile(MODELS_CACHE_FILE, 'utf-8')
      const models = JSON.parse(cacheData) as NomadOllamaModel[]

      if (!Array.isArray(models)) {
        logger.warn('[OllamaService] Invalid cache format, will fetch fresh data')
        return null
      }

      return models
    } catch (error) {
      // Cache doesn't exist or is invalid
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn(
          `[OllamaService] Error reading cache: ${error instanceof Error ? error.message : error}`
        )
      }
      return null
    }
  }

  private async writeModelsToCache(models: NomadOllamaModel[]): Promise<void> {
    try {
      await fs.mkdir(path.dirname(MODELS_CACHE_FILE), { recursive: true })
      await fs.writeFile(MODELS_CACHE_FILE, JSON.stringify(models, null, 2), 'utf-8')
      logger.info('[OllamaService] Successfully cached available models')
    } catch (error) {
      logger.warn(
        `[OllamaService] Failed to write models cache: ${error instanceof Error ? error.message : error}`
      )
    }
  }

  private sortModels(models: NomadOllamaModel[], sort?: 'pulls' | 'name'): NomadOllamaModel[] {
    if (sort === 'pulls') {
      // Sort by estimated pulls (it should be a string like "1.2K", "500", "4M" etc.)
      models.sort((a, b) => {
        const parsePulls = (pulls: string) => {
          const multiplier = pulls.endsWith('K')
            ? 1_000
            : pulls.endsWith('M')
              ? 1_000_000
              : pulls.endsWith('B')
                ? 1_000_000_000
                : 1
          return parseFloat(pulls) * multiplier
        }
        return parsePulls(b.estimated_pulls) - parsePulls(a.estimated_pulls)
      })
    } else if (sort === 'name') {
      models.sort((a, b) => a.name.localeCompare(b.name))
    }

    // Always sort model.tags by the size field in descending order
    // Size is a string like '75GB', '8.5GB', '2GB' etc. Smaller models first
    models.forEach((model) => {
      if (model.tags && Array.isArray(model.tags)) {
        model.tags.sort((a, b) => {
          const parseSize = (size: string) => {
            const multiplier = size.endsWith('KB')
              ? 1 / 1_000
              : size.endsWith('MB')
                ? 1 / 1_000_000
                : size.endsWith('GB')
                  ? 1
                  : size.endsWith('TB')
                    ? 1_000
                    : 0 // Unknown size format
            return parseFloat(size) * multiplier
          }
          return parseSize(a.size) - parseSize(b.size)
        })
      }
    })

    return models
  }

  private broadcastDownloadProgress(model: string, percent: number) {
    transmit.broadcast(BROADCAST_CHANNELS.OLLAMA_MODEL_DOWNLOAD, {
      model,
      percent,
      timestamp: new Date().toISOString(),
    })
    logger.info(`[OllamaService] Download progress for model "${model}": ${percent}%`)
  }

  private fuseSearchModels(models: NomadOllamaModel[], query: string): NomadOllamaModel[] {
    const options: IFuseOptions<NomadOllamaModel> = {
      ignoreDiacritics: true,
      keys: ['name', 'description', 'tags.name'],
      threshold: 0.3, // lower threshold for stricter matching
    }

    const fuse = new Fuse(models, options)

    return fuse.search(query).map(result => result.item)
  }
}
