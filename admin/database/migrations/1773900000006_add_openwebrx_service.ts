import db from '@adonisjs/lucid/services/db'
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'services'

  async up() {
    const existing = await db
      .from(this.tableName)
      .where('service_name', 'nomad_openwebrx')
      .first()

    if (existing) {
      return
    }

    await db.table(this.tableName).insert({
      service_name: 'nomad_openwebrx',
      friendly_name: 'Spectrum Analyzer',
      powered_by: 'OpenWebRX+',
      display_order: 13,
      description: 'Raw SDR web receiver and signal analysis interface for spectrum browsing and protocol decoding',
      icon: 'IconAntennaBars5',
      container_image: 'slechev/openwebrxplus:latest',
      source_repo: 'https://www.openwebrx.de/',
      container_command: null,
      container_config: JSON.stringify({
        HostConfig: {
          RestartPolicy: { Name: 'unless-stopped' },
          Privileged: true,
          PortBindings: { '8073/tcp': [{ HostPort: '8500' }] },
          Binds: [
            `${process.env.NOMAD_STORAGE_PATH || '/opt/project-nomad/storage'}/openwebrx:/var/lib/openwebrx`,
            '/dev/bus/usb:/dev/bus/usb',
            '/run/udev:/run/udev:ro',
          ],
        },
        ExposedPorts: { '8073/tcp': {} },
      }),
      ui_location: '8500',
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
    await db.from(this.tableName).where('service_name', 'nomad_openwebrx').delete()
  }
}
