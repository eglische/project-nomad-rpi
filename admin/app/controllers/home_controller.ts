import { SystemService } from '#services/system_service'
import { RecoveryService } from '#services/recovery_service'
import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'

@inject()
export default class HomeController {
    constructor(
        private systemService: SystemService,
        private recoveryService: RecoveryService,
    ) { }

    async index({ response }: HttpContext) {
        // Redirect / to /home
        return response.redirect().toPath('/home');
    }

    async home({ inertia }: HttpContext) {
        const services = await this.systemService.getServices({ installedOnly: true });
        const recovery = await this.recoveryService.scan()
        return inertia.render('home', {
            system: {
                services,
                recovery,
            }
        })
    }

    async radio({ inertia }: HttpContext) {
        const services = await this.systemService.getServices({ installedOnly: false })
        return inertia.render('radio', {
            system: {
                services,
            },
        })
    }
}
