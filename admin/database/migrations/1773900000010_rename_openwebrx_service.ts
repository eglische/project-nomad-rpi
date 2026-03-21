import db from '@adonisjs/lucid/services/db'
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'services'

  async up() {
    await db
      .from(this.tableName)
      .where('service_name', 'nomad_openwebrx')
      .update({
        friendly_name: 'FM/AM Radio Receiver Interface',
        description:
          'Raw SDR web receiver interface for FM, AM, airband, and general analog spectrum listening',
        updated_at: new Date(),
      })
  }

  async down() {
    await db
      .from(this.tableName)
      .where('service_name', 'nomad_openwebrx')
      .update({
        friendly_name: 'Spectrum Analyzer',
        description:
          'Raw SDR web receiver and signal analysis interface for spectrum browsing and protocol decoding',
        updated_at: new Date(),
      })
  }
}
