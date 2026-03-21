import db from '@adonisjs/lucid/services/db'
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'services'

  async up() {
    const existing = await db.from(this.tableName).where('service_name', 'nomad_nodered').first()

    if (existing) {
      return
    }

    await db.table(this.tableName).insert({
      service_name: 'nomad_nodered',
      friendly_name: 'Node-RED',
      powered_by: 'Node-RED',
      display_order: 14,
      description: 'Flow-based automation and integration workspace with a browser editor',
      icon: 'IconBrandNodejs',
      container_image: 'nodered/node-red:4.1.1',
      source_repo: 'https://github.com/node-red/node-red',
      container_command: null,
      container_config: JSON.stringify({
        HostConfig: {
          RestartPolicy: { Name: 'unless-stopped' },
          PortBindings: { '1880/tcp': [{ HostPort: '1880' }] },
          Binds: [
            `${process.env.NOMAD_STORAGE_PATH || '/opt/project-nomad/storage'}/nodered:/data`,
          ],
        },
        ExposedPorts: { '1880/tcp': {} },
      }),
      ui_location: '1880',
      installed: false,
      installation_status: 'idle',
      is_dependency_service: false,
      depends_on: null,
      metadata: null,
      available_update_version: null,
      update_checked_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    })
  }

  async down() {
    await db.from(this.tableName).where('service_name', 'nomad_nodered').delete()
  }
}
