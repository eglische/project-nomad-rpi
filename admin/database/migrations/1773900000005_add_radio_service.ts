import db from '@adonisjs/lucid/services/db'
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'services'

  async up() {
    const existing = await db
      .from(this.tableName)
      .where('service_name', 'nomad_radio')
      .first()

    if (existing) {
      return
    }

    await db.table(this.tableName).insert({
      service_name: 'nomad_radio',
      friendly_name: 'Radio',
      powered_by: 'welle.io',
      display_order: 12,
      description: 'RTL-SDR powered DAB/DAB+ radio receiver with a browser UI for scanning and playback',
      icon: 'IconRadio',
      container_image: 'project-nomad-local/radio:latest',
      source_repo: 'https://github.com/AlbrechtL/welle.io',
      container_command: '-F rtl_sdr -w 8000 -c /config/welle-cli.ini',
      container_config: JSON.stringify({
        HostConfig: {
          RestartPolicy: { Name: 'unless-stopped' },
          Privileged: true,
          PortBindings: { '8000/tcp': [{ HostPort: '8400' }] },
          Binds: [
            `${process.env.NOMAD_STORAGE_PATH || '/opt/project-nomad/storage'}/radio:/config`,
            '/dev/bus/usb:/dev/bus/usb',
            '/run/udev:/run/udev:ro',
          ],
        },
        ExposedPorts: { '8000/tcp': {} },
      }),
      ui_location: '8400',
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
    await db.from(this.tableName).where('service_name', 'nomad_radio').delete()
  }
}
