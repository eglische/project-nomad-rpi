import db from '@adonisjs/lucid/services/db'
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'services'

  async up() {
    const existing = await db.from(this.tableName).where('service_name', 'nomad_mosquitto').first()

    if (existing) {
      return
    }

    await db.table(this.tableName).insert({
      service_name: 'nomad_mosquitto',
      friendly_name: 'Mosquitto',
      powered_by: 'Eclipse Mosquitto',
      display_order: 15,
      description: 'Lightweight MQTT broker for local message routing, automation, and integrations',
      icon: 'IconBroadcast',
      container_image: 'eclipse-mosquitto:2.0.21',
      source_repo: 'https://github.com/eclipse-mosquitto/mosquitto',
      container_command: null,
      container_config: JSON.stringify({
        HostConfig: {
          RestartPolicy: { Name: 'unless-stopped' },
          PortBindings: { '1883/tcp': [{ HostPort: '1883' }] },
          Binds: [
            `${process.env.NOMAD_STORAGE_PATH || '/opt/project-nomad/storage'}/mosquitto/data:/mosquitto/data`,
            `${process.env.NOMAD_STORAGE_PATH || '/opt/project-nomad/storage'}/mosquitto/log:/mosquitto/log`,
          ],
        },
        ExposedPorts: { '1883/tcp': {} },
      }),
      ui_location: '',
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
    await db.from(this.tableName).where('service_name', 'nomad_mosquitto').delete()
  }
}
