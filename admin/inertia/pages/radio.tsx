import { Head } from '@inertiajs/react'
import { useMemo, useState } from 'react'
import { IconAntennaBars5, IconBroadcast, IconLoader2, IconRadio } from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import AppLayout from '~/layouts/AppLayout'
import StyledButton from '~/components/StyledButton'
import Alert from '~/components/Alert'
import api from '~/lib/api'
import { ServiceSlim } from '../../types/services'
import { SERVICE_NAMES } from '../../constants/service_names'

type LaunchTarget = typeof SERVICE_NAMES.RADIO | typeof SERVICE_NAMES.OPENWEBRX

export default function RadioPage(props: { system: { services: ServiceSlim[] } }) {
  const [loadingTarget, setLoadingTarget] = useState<LaunchTarget | null>(null)
  const { data: services, refetch } = useQuery({
    queryKey: ['radio-launch-services'],
    queryFn: () => api.getServices(),
    initialData: props.system.services,
    refetchInterval: loadingTarget ? 1500 : false,
  })

  const radioService = useMemo(
    () => services.find((service) => service.service_name === SERVICE_NAMES.RADIO) ?? null,
    [services]
  )
  const openWebRxService = useMemo(
    () => services.find((service) => service.service_name === SERVICE_NAMES.OPENWEBRX) ?? null,
    [services]
  )

  async function launchService(serviceName: LaunchTarget, port: number) {
    setLoadingTarget(serviceName)
    try {
      const service = services.find((entry) => entry.service_name === serviceName)
      if (!service?.installed) {
        const installResponse = await api.installService(serviceName)
        if (!installResponse?.success) {
          throw new Error(installResponse?.message || `Failed to install ${serviceName}`)
        }
      } else {
        const startResponse = await api.affectService(serviceName, 'start')
        if (!startResponse?.success) {
          throw new Error(startResponse?.message || `Failed to start ${serviceName}`)
        }
      }

      const deadline = Date.now() + 60000
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 1500))
        const result = await refetch()
        const refreshed = (result.data ?? services).find((entry) => entry.service_name === serviceName)
        if (refreshed?.status === 'running' || refreshed?.status === 'created') {
          window.location.href = `http://${window.location.hostname}:${port}`
          return
        }
      }

      throw new Error('Service did not become ready in time.')
    } finally {
      setLoadingTarget(null)
    }
  }

  return (
    <AppLayout>
      <Head title="Radio" />
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="rounded-3xl border border-desert-stone/40 bg-white/90 p-8 shadow-sm">
          <div className="mb-6 flex items-center gap-4">
            <div className="rounded-2xl bg-desert-sand-light p-4 text-desert-green">
              <IconRadio size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-semibold text-desert-night">Radio</h1>
              <p className="mt-1 text-sm text-desert-stone-dark">
                Choose the SDR tool you want to use. Since both apps share one RTL-SDR dongle,
                launching one will stop the other first.
              </p>
            </div>
          </div>

          <Alert
            title="Single-dongle handoff"
            type="info"
            variant="soft"
            className="mb-8"
          >
            Radio/DAB+ and Spectrum Analyzer cannot use the same RTL-SDR at the same time.
            Project N.O.M.A.D. will hand the device over automatically when you launch one.
          </Alert>

          <div className="grid gap-6 md:grid-cols-2">
            <section className="rounded-2xl border border-desert-stone/30 bg-desert-sand-light/40 p-6">
              <div className="mb-4 flex items-center gap-3">
                <IconBroadcast className="text-desert-green" size={26} />
                <div>
                  <h2 className="text-xl font-semibold text-desert-night">Open Radio / DAB+</h2>
                  <p className="text-sm text-desert-stone-dark">
                    Browser-based DAB/DAB+ receiver powered by welle-cli.
                  </p>
                </div>
              </div>
              <p className="mb-6 text-sm text-desert-stone-dark">
                Best for station listening and DAB-focused workflows.
              </p>
              <StyledButton
                variant="primary"
                className="w-full"
                loading={loadingTarget === SERVICE_NAMES.RADIO}
                icon={loadingTarget === SERVICE_NAMES.RADIO ? undefined : 'IconPlayerPlay'}
                onClick={() => launchService(SERVICE_NAMES.RADIO, 8400)}
              >
                {loadingTarget === SERVICE_NAMES.RADIO ? 'Launching Radio...' : 'Open Radio / DAB+'}
              </StyledButton>
              {loadingTarget === SERVICE_NAMES.RADIO && (
                <p className="mt-3 flex items-center gap-2 text-sm text-desert-stone-dark">
                  <IconLoader2 className="animate-spin" size={16} />
                  Stopping the analyzer if needed, then preparing the Radio endpoint.
                </p>
              )}
            </section>

            <section className="rounded-2xl border border-desert-stone/30 bg-desert-sand-light/40 p-6">
              <div className="mb-4 flex items-center gap-3">
                <IconAntennaBars5 className="text-desert-green" size={26} />
                <div>
                  <h2 className="text-xl font-semibold text-desert-night">Open Spectrum Analyzer</h2>
                  <p className="text-sm text-desert-stone-dark">
                    OpenWebRX+ raw SDR receiver and signal analysis frontend.
                  </p>
                </div>
              </div>
              <p className="mb-6 text-sm text-desert-stone-dark">
                Best for spectrum browsing, signal hunting, and later decoder-oriented workflows.
              </p>
              <StyledButton
                variant="primary"
                className="w-full"
                loading={loadingTarget === SERVICE_NAMES.OPENWEBRX}
                icon={loadingTarget === SERVICE_NAMES.OPENWEBRX ? undefined : 'IconPlayerPlay'}
                onClick={() => launchService(SERVICE_NAMES.OPENWEBRX, 8500)}
              >
                {loadingTarget === SERVICE_NAMES.OPENWEBRX
                  ? 'Launching Spectrum Analyzer...'
                  : 'Open Spectrum Analyzer'}
              </StyledButton>
              {loadingTarget === SERVICE_NAMES.OPENWEBRX && (
                <p className="mt-3 flex items-center gap-2 text-sm text-desert-stone-dark">
                  <IconLoader2 className="animate-spin" size={16} />
                  Stopping the radio receiver if needed, then preparing OpenWebRX+.
                </p>
              )}
            </section>
          </div>

          <div className="mt-8 grid gap-3 text-sm text-desert-stone-dark md:grid-cols-2">
            <div>
              <span className="font-medium text-desert-night">Radio status:</span>{' '}
              {radioService?.status || 'unknown'}
            </div>
            <div>
              <span className="font-medium text-desert-night">Spectrum Analyzer status:</span>{' '}
              {openWebRxService?.status || 'unknown'}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
