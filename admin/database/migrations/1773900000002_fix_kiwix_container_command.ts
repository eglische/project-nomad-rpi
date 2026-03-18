import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'services'

  async up() {
    await this.db
      .from(this.tableName)
        .where('service_name', 'nomad_kiwix_server')
      .update({
        container_command: '/data/*.zim --address=all',
      })
  }

  async down() {
    await this.db
      .from(this.tableName)
        .where('service_name', 'nomad_kiwix_server')
      .update({
        container_command: '*.zim --address=all',
      })
  }
}
