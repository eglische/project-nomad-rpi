import { SystemService } from '#services/system_service'
import { ZimService } from '#services/zim_service'
import { CollectionManifestService } from '#services/collection_manifest_service'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { existsSync, readdirSync, readFileSync } from 'fs'

@inject()
export default class EasySetupController {
  constructor(
    private systemService: SystemService,
    private zimService: ZimService
  ) {}

  async index({ inertia }: HttpContext) {
    const services = await this.systemService.getServices({ installedOnly: false })
    return inertia.render('easy-setup/index', {
      system: {
        services: services,
      },
      radio: {
        rtlSdrDonglePresent: await this.detectRtlSdrDongle(),
      },
    })
  }

  async complete({ inertia }: HttpContext) {
    return inertia.render('easy-setup/complete')
  }

  async radioHardware({}: HttpContext) {
    return {
      rtlSdrDonglePresent: this.detectRtlSdrDongle(),
    }
  }

  async listCuratedCategories({}: HttpContext) {
    return await this.zimService.listCuratedCategories()
  }

  async refreshManifests({}: HttpContext) {
    const manifestService = new CollectionManifestService()
    const [zimChanged, mapsChanged, wikiChanged] = await Promise.all([
      manifestService.fetchAndCacheSpec('zim_categories'),
      manifestService.fetchAndCacheSpec('maps'),
      manifestService.fetchAndCacheSpec('wikipedia'),
    ])

    return {
      success: true,
      changed: {
        zim_categories: zimChanged,
        maps: mapsChanged,
        wikipedia: wikiChanged,
      },
    }
  }

  private detectRtlSdrDongle(): boolean {
    const usbDevicesPath = '/sys/bus/usb/devices'

    try {
      if (!existsSync(usbDevicesPath)) {
        return false
      }

      const deviceDirs = readdirSync(usbDevicesPath)

      for (const deviceDir of deviceDirs) {
        const devicePath = `${usbDevicesPath}/${deviceDir}`
        const vendorPath = `${devicePath}/idVendor`
        const productPath = `${devicePath}/idProduct`

        if (!existsSync(vendorPath) || !existsSync(productPath)) {
          continue
        }

        const vendor = readFileSync(vendorPath, 'utf-8').trim().toLowerCase()
        const product = readFileSync(productPath, 'utf-8').trim().toLowerCase()
        const manufacturer = existsSync(`${devicePath}/manufacturer`)
          ? readFileSync(`${devicePath}/manufacturer`, 'utf-8').trim().toLowerCase()
          : ''
        const productName = existsSync(`${devicePath}/product`)
          ? readFileSync(`${devicePath}/product`, 'utf-8').trim().toLowerCase()
          : ''

        const rtlByIds = vendor === '0bda' && ['2832', '2838'].includes(product)
        const rtlByText =
          manufacturer.includes('realtek') ||
          productName.includes('rtl2832') ||
          productName.includes('rtl2838') ||
          productName.includes('rtl-sdr') ||
          productName.includes('dvb-t')

        if (rtlByIds || rtlByText) {
          return true
        }
      }

      return false
    } catch {
      return false
    }
  }
}
