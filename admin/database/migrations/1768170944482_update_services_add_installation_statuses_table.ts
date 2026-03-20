import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'services'

  async up() {
    const hasInstallationStatus = await this.schema.hasColumn(this.tableName, 'installation_status')
    if (hasInstallationStatus) {
      return
    }

    this.schema.alterTable(this.tableName, (table) => {
      table.string('installation_status').defaultTo('idle').notNullable()
    })
  }

  async down() {
    const hasInstallationStatus = await this.schema.hasColumn(this.tableName, 'installation_status')
    if (!hasInstallationStatus) {
      return
    }

    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('installation_status')
    })
  }
}
