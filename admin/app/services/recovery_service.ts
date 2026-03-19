import { inject } from '@adonisjs/core'
import env from '#start/env'
import Service from '#models/service'
import { DockerService } from '#services/docker_service'
import { SERVICE_NAMES } from '../../constants/service_names.js'
import type {
  RecoveryImportResponse,
  RecoveryScanResponse,
  RecoveryServiceCandidate,
} from '../../types/system.js'
import { access, readdir } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { join } from 'node:path'

type RecoverySignature = {
  serviceName: string
  relativePath: string
  detector: (absolutePath: string) => Promise<string[]>
}

@inject()
export class RecoveryService {
  private readonly storagePath = env.get('NOMAD_STORAGE_PATH', '/opt/project-nomad/storage')
  private readonly containerStorageFallback = '/app/storage'

  constructor(private dockerService: DockerService) {}

  async scan(): Promise<RecoveryScanResponse> {
    const runtimeStoragePath = await this.getRuntimeStoragePath()
    const projectRoot = join(runtimeStoragePath, '..')
    const previousNomadDataFound = await this.pathExists(projectRoot)
    const containers = await this.dockerService.docker.listContainers({ all: true })
    const services = await Service.query().where('is_dependency_service', false)
    const serviceMap = new Map(services.map((service) => [service.service_name, service]))

    const candidates = (
      await Promise.all(
        this.getSignatures().map(async (signature) => {
          const service = serviceMap.get(signature.serviceName)
          if (!service) return null

          const runtimeAbsolutePath = join(runtimeStoragePath, signature.relativePath)
          const absolutePath = join(this.storagePath, signature.relativePath)
          const evidence = await signature.detector(runtimeAbsolutePath)
          if (evidence.length === 0) return null

          const containerPresent = containers.some((container) =>
            container.Names.includes(`/${signature.serviceName}`)
          )

          let state: RecoveryServiceCandidate['state'] = 'recoverable'
          if (service.installed) {
            state = 'imported'
          } else if (service.installation_status === 'installing') {
            state = 'importing'
          }

          return {
            serviceName: service.service_name,
            friendlyName: service.friendly_name || service.service_name,
            description: service.description,
            storagePath: absolutePath,
            evidence,
            state,
            installed: service.installed,
            installationStatus: service.installation_status,
            containerPresent,
          } satisfies RecoveryServiceCandidate
        })
      )
    ).filter((candidate): candidate is RecoveryServiceCandidate => Boolean(candidate))

    return {
      generatedAt: new Date().toISOString(),
      storagePath: this.storagePath,
      previousNomadDataFound,
      hasRecoverableServices: candidates.some((candidate) => candidate.state === 'recoverable'),
      services: candidates,
    }
  }

  async importServices(serviceNames: string[]): Promise<RecoveryImportResponse> {
    const requested = Array.from(new Set(serviceNames.filter(Boolean)))
    const scan = await this.scan()
    const eligible = new Map(
      scan.services
        .filter((service) => service.state === 'recoverable')
        .map((service) => [service.serviceName, service])
    )
    const actions: string[] = []

    for (const serviceName of requested) {
      const candidate = eligible.get(serviceName)
      if (!candidate) {
        actions.push(`Skipped ${serviceName}: no recoverable data found`)
        continue
      }

      const service = await Service.query().where('service_name', serviceName).first()
      if (!service) {
        actions.push(`Skipped ${serviceName}: service definition not found`)
        continue
      }

      if (candidate.containerPresent) {
        if (await this.tryStartExistingContainer(serviceName)) {
          actions.push(`Reattached existing ${candidate.friendlyName} container`)
        } else {
          actions.push(`Marked ${candidate.friendlyName} as recovered from existing data`)
        }

        service.installed = true
        service.installation_status = 'idle'
        await service.save()
        continue
      }

      const result = await this.dockerService.createContainerPreflight(serviceName)
      if (result.success) {
        actions.push(`Started recovery import for ${candidate.friendlyName}`)
      } else {
        actions.push(`Could not import ${candidate.friendlyName}: ${result.message}`)
      }
    }

    return {
      success: true,
      message:
        actions.length > 0
          ? 'Recovery import reviewed the preserved data and applied the selected actions.'
          : 'No recoverable services were selected.',
      actions,
    }
  }

  private getSignatures(): RecoverySignature[] {
    return [
      {
        serviceName: SERVICE_NAMES.KIWIX,
        relativePath: 'zim',
        detector: async (absolutePath) => {
          const entries = await this.safeReadDir(absolutePath)
          const zimFiles = entries
            .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.zim'))
            .slice(0, 3)
            .map((entry) => `Found ${entry.name}`)
          return zimFiles
        },
      },
      {
        serviceName: SERVICE_NAMES.KOLIBRI,
        relativePath: 'kolibri',
        detector: async (absolutePath) => {
          return this.detectKnownEntries(absolutePath, [
            'db.sqlite3',
            'content',
            'log',
            'settings',
          ])
        },
      },
      {
        serviceName: SERVICE_NAMES.OLLAMA,
        relativePath: 'ollama',
        detector: async (absolutePath) => {
          return this.detectKnownEntries(absolutePath, ['models', 'manifests', 'blobs'])
        },
      },
      {
        serviceName: SERVICE_NAMES.FLATNOTES,
        relativePath: 'flatnotes',
        detector: async (absolutePath) => {
          return this.detectKnownEntries(absolutePath, ['flatnotes.db', 'data', 'uploads'])
        },
      },
    ]
  }

  private async detectKnownEntries(absolutePath: string, names: string[]): Promise<string[]> {
    const found: string[] = []

    for (const name of names) {
      if (await this.pathExists(join(absolutePath, name))) {
        found.push(`Found ${name}`)
      }
    }

    if (found.length > 0) {
      return found
    }

    const entries = await this.safeReadDir(absolutePath)
    const meaningfulEntries = entries
      .filter((entry) => !entry.name.startsWith('.'))
      .slice(0, 3)
      .map((entry) => `Found ${entry.name}`)

    return meaningfulEntries
  }

  private async tryStartExistingContainer(serviceName: string): Promise<boolean> {
    try {
      const result = await this.dockerService.affectContainer(serviceName, 'start')
      return result.success
    } catch {
      return false
    }
  }

  private async safeReadDir(absolutePath: string) {
    try {
      return await readdir(absolutePath, { withFileTypes: true })
    } catch {
      return []
    }
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await access(targetPath, fsConstants.F_OK)
      return true
    } catch {
      return false
    }
  }

  private async getRuntimeStoragePath(): Promise<string> {
    if (await this.pathExists(this.storagePath)) {
      return this.storagePath
    }

    if (await this.pathExists(this.containerStorageFallback)) {
      return this.containerStorageFallback
    }

    return this.storagePath
  }
}
