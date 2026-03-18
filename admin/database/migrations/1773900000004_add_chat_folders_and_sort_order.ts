import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'chat_sessions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('folder').nullable().after('model')
      table.integer('sort_order').notNullable().defaultTo(0).after('folder')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('folder')
      table.dropColumn('sort_order')
    })
  }
}
