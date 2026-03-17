import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'services'

  async up() {
    this.defer(async (db) => {
      await db
        .from(this.tableName)
        .where('service_name', 'nomad_cyberchef')
        .where('container_image', 'ghcr.io/gchq/cyberchef:10.19.4')
        .update({ container_image: 'ghcr.io/gchq/cyberchef:10.22.1' })
    })
  }

  async down() {
    this.defer(async (db) => {
      await db
        .from(this.tableName)
        .where('service_name', 'nomad_cyberchef')
        .where('container_image', 'ghcr.io/gchq/cyberchef:10.22.1')
        .update({ container_image: 'ghcr.io/gchq/cyberchef:10.19.4' })
    })
  }
}
