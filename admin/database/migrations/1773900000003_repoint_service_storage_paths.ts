import { BaseSchema } from '@adonisjs/lucid/schema'

const LEGACY_STORAGE_PATH = '/opt/project-nomad/storage'

export default class extends BaseSchema {
  protected tableName = 'services'

  async up() {
    this.defer(async (db) => {
      const targetStoragePath = process.env.NOMAD_STORAGE_PATH || LEGACY_STORAGE_PATH
      if (targetStoragePath === LEGACY_STORAGE_PATH) {
        return
      }

      await db.rawQuery(
        `UPDATE ${this.tableName}
         SET container_config = REPLACE(container_config, ?, ?)
         WHERE container_config LIKE ?`,
        [LEGACY_STORAGE_PATH, targetStoragePath, `%${LEGACY_STORAGE_PATH}%`]
      )
    })
  }

  async down() {
    this.defer(async (db) => {
      const targetStoragePath = process.env.NOMAD_STORAGE_PATH || LEGACY_STORAGE_PATH
      if (targetStoragePath === LEGACY_STORAGE_PATH) {
        return
      }

      await db.rawQuery(
        `UPDATE ${this.tableName}
         SET container_config = REPLACE(container_config, ?, ?)
         WHERE container_config LIKE ?`,
        [targetStoragePath, LEGACY_STORAGE_PATH, `%${targetStoragePath}%`]
      )
    })
  }
}
