import {
  IconAntennaBars5,
  IconBolt,
  IconHelp,
  IconMapRoute,
  IconPlus,
  IconRadio,
  IconSettings,
  IconWifiOff,
} from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { Head } from '@inertiajs/react'
import { useQuery } from '@tanstack/react-query'
import AppLayout from '~/layouts/AppLayout'
import { getServiceLink } from '~/lib/navigation'
import { ServiceSlim } from '../../types/services'
import DynamicIcon, { DynamicIconName } from '~/components/DynamicIcon'
import { useUpdateAvailable } from '~/hooks/useUpdateAvailable'
import { useSystemSetting } from '~/hooks/useSystemSetting'
import Alert from '~/components/Alert'
import { SERVICE_NAMES } from '../../constants/service_names'
import type { RecoveryScanResponse } from '../../types/system'
import api from '~/lib/api'
import RecoveryModal from '~/components/system/RecoveryModal'
import { useNotifications } from '~/context/NotificationContext'

// Maps is a Core Capability (display_order: 4)
const MAPS_ITEM = {
  label: 'Maps',
  to: '/maps',
  target: '',
  description: 'View offline maps',
  icon: <IconMapRoute size={48} />,
  installed: true,
  displayOrder: 4,
  poweredBy: null,
}

const RADIO_TILE_SERVICES = new Set([SERVICE_NAMES.RADIO, SERVICE_NAMES.OPENWEBRX])

const RADIO_ITEM = {
  label: 'Radio',
  to: '/radio',
  target: '',
  description: 'Launch the radio receiver or spectrum analyzer for the RTL-SDR dongle',
  icon: (
    <div className="flex items-center gap-1">
      <IconRadio size={32} />
      <IconAntennaBars5 size={28} />
    </div>
  ),
  installed: true,
  displayOrder: 13,
  poweredBy: null,
}

// System items shown after all apps
const SYSTEM_ITEMS = [
  {
    label: 'Easy Setup',
    to: '/easy-setup',
    target: '',
    description:
      'Not sure where to start? Use the setup wizard to quickly configure your N.O.M.A.D.!',
    icon: <IconBolt size={48} />,
    installed: true,
    displayOrder: 50,
    poweredBy: null,
  },
  {
    label: 'Install Apps',
    to: '/settings/apps',
    target: '',
    description: 'Not seeing your favorite app? Install it here!',
    icon: <IconPlus size={48} />,
    installed: true,
    displayOrder: 51,
    poweredBy: null,
  },
  {
    label: 'Docs',
    to: '/docs/home',
    target: '',
    description: 'Read Project N.O.M.A.D. manuals and guides',
    icon: <IconHelp size={48} />,
    installed: true,
    displayOrder: 52,
    poweredBy: null,
  },
  {
    label: 'Settings',
    to: '/settings/system',
    target: '',
    description: 'Configure your N.O.M.A.D. settings',
    icon: <IconSettings size={48} />,
    installed: true,
    displayOrder: 53,
    poweredBy: null,
  },
]

interface DashboardItem {
  label: string
  to: string
  target: string
  description: string
  icon: React.ReactNode
  installed: boolean
  displayOrder: number
  poweredBy: string | null
}

export default function Home(props: {
  system: {
    services: ServiceSlim[]
    recovery: RecoveryScanResponse
  }
}) {
  const items: DashboardItem[] = []
  const updateInfo = useUpdateAvailable();
  const { addNotification } = useNotifications()
  const [recoveryModalOpen, setRecoveryModalOpen] = useState(false)
  const [recoveryLoading, setRecoveryLoading] = useState(false)
  const { data: recovery, refetch: refetchRecovery } = useQuery({
    queryKey: ['system-recovery-home'],
    queryFn: () => api.getSystemRecovery(),
    initialData: props.system.recovery,
    refetchInterval: 30000,
  })

  // Check if user has visited Easy Setup
  const { data: easySetupVisited } = useSystemSetting({
    key: 'ui.hasVisitedEasySetup'
  })
  const shouldHighlightEasySetup = easySetupVisited?.value ? easySetupVisited?.value !== 'true' : false
  const hasRecoverableServices = Boolean(recovery?.hasRecoverableServices)

  useEffect(() => {
    if (hasRecoverableServices) {
      setRecoveryModalOpen(true)
    }
  }, [hasRecoverableServices])

  // Add installed services (non-dependency services only)
  const hasInstalledRadioTool = props.system.services.some(
    (service) => service.installed && RADIO_TILE_SERVICES.has(service.service_name)
  )

  props.system.services
    .filter((service) => service.installed && service.ui_location)
    .filter((service) => !RADIO_TILE_SERVICES.has(service.service_name))
    .forEach((service) => {
      items.push({
        label: service.friendly_name || service.service_name,
        to: service.ui_location ? getServiceLink(service.ui_location) : '#',
        target: '_blank',
        description:
          service.description ||
          `Access the ${service.friendly_name || service.service_name} application`,
        icon: service.icon ? (
          <DynamicIcon icon={service.icon as DynamicIconName} className="!size-12" />
        ) : (
          <IconWifiOff size={48} />
        ),
        installed: service.installed,
        displayOrder: service.display_order ?? 100,
        poweredBy: service.powered_by ?? null,
      })
    })

  if (hasInstalledRadioTool) {
    items.push(RADIO_ITEM)
  }

  // Add Maps as a Core Capability
  items.push(MAPS_ITEM)

  // Add system items
  items.push(...SYSTEM_ITEMS)

  // Sort all items by display order
  items.sort((a, b) => a.displayOrder - b.displayOrder)

  return (
    <AppLayout>
      <Head title="Command Center" />
      <RecoveryModal
        open={recoveryModalOpen}
        recovery={recovery}
        loading={recoveryLoading}
        onClose={() => setRecoveryModalOpen(false)}
        onConfirm={async (serviceNames) => {
          if (serviceNames.length === 0) {
            setRecoveryModalOpen(false)
            return
          }

          setRecoveryLoading(true)
          try {
            const response = await api.importRecoveredServices(serviceNames)
            if (!response?.success) {
              throw new Error(response?.message || 'Recovery import failed')
            }

            addNotification({
              message:
                response.actions.length > 0
                  ? `${response.message} ${response.actions.join(' • ')}`
                  : response.message,
              type: 'success',
            })
            setRecoveryModalOpen(false)
            await refetchRecovery()
          } catch (error) {
            addNotification({
              message: error instanceof Error ? error.message : 'Recovery import failed',
              type: 'error',
            })
          } finally {
            setRecoveryLoading(false)
          }
        }}
      />
      {
        updateInfo?.updateAvailable && (
          <div className='flex justify-center items-center p-4 w-full'>
            <Alert
              title="An update is available for Project N.O.M.A.D.!"
              type="info-inverted"
              variant="solid"
              className="w-full"
              buttonProps={{
                variant: 'primary',
                children: 'Go to Settings',
                icon: 'IconSettings',
                onClick: () => {
                  window.location.href = '/settings/update'
                },
              }}
            />
          </div>
        )
      }
      {hasRecoverableServices && (
        <div className="flex justify-center items-center px-4 pb-0 w-full">
          <Alert
            title="Previous Project N.O.M.A.D. data found"
            message="Nomad found preserved app data on your external storage. Use recovery to reconnect the services without wiping the drive."
            type="warning"
            variant="bordered"
            className="w-full"
            buttonProps={{
              variant: 'primary',
              children: 'Open Recovery',
              icon: 'IconDatabaseImport',
              onClick: () => setRecoveryModalOpen(true),
            }}
          />
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
        {items.map((item) => {
          const isEasySetup = item.label === 'Easy Setup'
          const shouldHighlight = isEasySetup && shouldHighlightEasySetup

          return (
            <a key={item.label} href={item.to} target={item.target}>
              <div className="relative rounded border-desert-green border-2 bg-desert-green hover:bg-transparent hover:text-black text-white transition-colors shadow-sm h-48 flex flex-col items-center justify-center cursor-pointer text-center px-4">
                {shouldHighlight && (
                  <span className="absolute top-2 right-2 flex items-center justify-center">
                    <span
                      className="animate-ping absolute inline-flex w-16 h-6 rounded-full bg-desert-orange-light opacity-75"
                      style={{ animationDuration: '1.5s' }}
                    ></span>
                    <span className="relative inline-flex items-center rounded-full px-2.5 py-1 bg-desert-orange-light text-xs font-semibold text-white shadow-sm">
                      Start here!
                    </span>
                  </span>
                )}
                <div className="flex items-center justify-center mb-2">{item.icon}</div>
                <h3 className="font-bold text-2xl">{item.label}</h3>
                {item.poweredBy && <p className="text-sm opacity-80">Powered by {item.poweredBy}</p>}
                <p className="xl:text-lg mt-2">{item.description}</p>
              </div>
            </a>
          )
        })}
      </div>
    </AppLayout>
  )
}
