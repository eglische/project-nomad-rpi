import db from '@adonisjs/lucid/services/db'
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'services'

  async up() {
    const service = await db
      .from(this.tableName)
      .where('service_name', 'nomad_openwebrx')
      .first()

    if (!service?.container_config) {
      return
    }

    const parsed =
      typeof service.container_config === 'string'
        ? JSON.parse(service.container_config)
        : service.container_config
    const existingEnv = Array.isArray(parsed.Env) ? parsed.Env.filter(Boolean) : []
    const envMap = new Map<string, string>()

    for (const entry of existingEnv) {
      if (typeof entry !== 'string') {
        continue
      }
      const separatorIndex = entry.indexOf('=')
      if (separatorIndex === -1) {
        continue
      }
      envMap.set(entry.slice(0, separatorIndex), entry.slice(separatorIndex + 1))
    }

    envMap.set('TZ', envMap.get('TZ') || 'Europe/Madrid')
    envMap.set('OPENWEBRX_ADMIN_USER', envMap.get('OPENWEBRX_ADMIN_USER') || 'admin')
    envMap.set(
      'OPENWEBRX_ADMIN_PASSWORD',
      envMap.get('OPENWEBRX_ADMIN_PASSWORD') || 'password'
    )

    if (!parsed.HostConfig) {
      parsed.HostConfig = {}
    }

    const binds = Array.isArray(parsed.HostConfig.Binds) ? parsed.HostConfig.Binds : []
    const storageRoot = process.env.NOMAD_STORAGE_PATH || '/opt/project-nomad/storage'
    const configBind = `${storageRoot}/openwebrx-config:/etc/openwebrx`

    parsed.HostConfig.Binds = [
      configBind,
      ...binds.filter((bind: unknown) => bind !== configBind),
    ]
    parsed.Env = Array.from(envMap.entries()).map(([key, value]) => `${key}=${value}`)

    await db
      .from(this.tableName)
      .where('service_name', 'nomad_openwebrx')
      .update({
        container_config: JSON.stringify(parsed),
        updated_at: new Date(),
      })
  }

  async down() {
    const service = await db
      .from(this.tableName)
      .where('service_name', 'nomad_openwebrx')
      .first()

    if (!service?.container_config) {
      return
    }

    const parsed =
      typeof service.container_config === 'string'
        ? JSON.parse(service.container_config)
        : service.container_config
    const env = Array.isArray(parsed.Env) ? parsed.Env : []
    const storageRoot = process.env.NOMAD_STORAGE_PATH || '/opt/project-nomad/storage'
    const configBind = `${storageRoot}/openwebrx-config:/etc/openwebrx`

    parsed.Env = env.filter((entry: unknown) => {
      if (typeof entry !== 'string') {
        return false
      }
      return !entry.startsWith('TZ=') &&
        !entry.startsWith('OPENWEBRX_ADMIN_USER=') &&
        !entry.startsWith('OPENWEBRX_ADMIN_PASSWORD=')
    })

    if (parsed.HostConfig?.Binds && Array.isArray(parsed.HostConfig.Binds)) {
      parsed.HostConfig.Binds = parsed.HostConfig.Binds.filter(
        (bind: unknown) => bind !== configBind
      )
    }

    await db
      .from(this.tableName)
      .where('service_name', 'nomad_openwebrx')
      .update({
        container_config: JSON.stringify(parsed),
        updated_at: new Date(),
      })
  }
}
