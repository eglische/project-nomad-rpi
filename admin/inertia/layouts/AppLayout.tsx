import { useEffect, useMemo, useState } from 'react'
import Footer from '~/components/Footer'
import ChatModal from '~/components/chat/ChatModal'
import { SERVICE_NAMES } from '../../constants/service_names'
import { Link, usePage } from '@inertiajs/react'
import {
  IconArrowLeft,
  IconExternalLink,
  IconPlus,
  IconX,
} from '@tabler/icons-react'
import classNames from 'classnames'
import { useQuery } from '@tanstack/react-query'
import api from '~/lib/api'
import type { ServiceSlim } from '../../types/services'
import { getServiceLink } from '~/lib/navigation'
import FloatingAppLauncher, {
  LAUNCHER_ICONS,
} from '~/components/launcher/FloatingAppLauncher'
import ExternalAppModal from '~/components/launcher/ExternalAppModal'

type QuickAppDefinition = {
  key: string
  label: string
  src: string
  launcherIcon?: React.ReactNode
  launcherMode?: 'modal' | 'tab' | 'browser'
  commandCenterEligible?: boolean
  commandCenterMode?: 'iframe' | 'browser'
}

type CommandCenterTab = {
  key: string
  label: string
  src: string
}

const COMMAND_CENTER_TABS_KEY = 'nomad.command-center-tabs'
const COMMAND_CENTER_ACTIVE_KEY = 'nomad.command-center-active-tab'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [launcherExpanded, setLauncherExpanded] = useState(false)
  const [externalAppKey, setExternalAppKey] = useState<string | null>(null)
  const [commandCenterTabs, setCommandCenterTabs] = useState<CommandCenterTab[]>([])
  const [activeCommandCenterTab, setActiveCommandCenterTab] = useState('home')
  const [showAddMenu, setShowAddMenu] = useState(false)
  const { url, props } = usePage<{ aiAssistantName?: string }>()
  const isHomePage = url === '/home'

  const { data: services } = useQuery<ServiceSlim[] | undefined>({
    queryKey: ['installed-services'],
    queryFn: () => api.getSystemServices(),
  })

  const aiAssistantName = props.aiAssistantName || 'AI Assistant'

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      const storedTabs = window.localStorage.getItem(COMMAND_CENTER_TABS_KEY)
      const storedActive = window.localStorage.getItem(COMMAND_CENTER_ACTIVE_KEY)
      if (storedTabs) {
        const parsed = JSON.parse(storedTabs) as CommandCenterTab[]
        setCommandCenterTabs(parsed)
      }
      if (storedActive) {
        setActiveCommandCenterTab(storedActive)
      }
    } catch (error) {
      console.error('Failed to restore command center tabs:', error)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(COMMAND_CENTER_TABS_KEY, JSON.stringify(commandCenterTabs))
  }, [commandCenterTabs])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(COMMAND_CENTER_ACTIVE_KEY, activeCommandCenterTab)
  }, [activeCommandCenterTab])

  const installedServices = services?.filter((service) => service.installed) || []
  const serviceByName = useMemo(
    () => new Map(installedServices.map((service) => [service.service_name, service])),
    [installedServices]
  )

  const radioInstalled =
    serviceByName.has(SERVICE_NAMES.RADIO) || serviceByName.has(SERVICE_NAMES.OPENWEBRX)

  const quickApps = useMemo(() => {
    const apps: QuickAppDefinition[] = []

    if (serviceByName.has(SERVICE_NAMES.OLLAMA)) {
      apps.push({
        key: 'chat',
        label: aiAssistantName,
        src: '/chat',
        launcherIcon: LAUNCHER_ICONS.chat,
        launcherMode: 'modal',
        commandCenterEligible: true,
        commandCenterMode: 'iframe',
      })
    }

    const kiwix = serviceByName.get(SERVICE_NAMES.KIWIX)
    if (kiwix?.ui_location) {
      apps.push({
        key: 'kiwix',
        label: kiwix.friendly_name || 'Information Library',
        src: getServiceLink(kiwix.ui_location),
        launcherIcon: LAUNCHER_ICONS.kiwix,
        launcherMode: 'modal',
        commandCenterEligible: true,
        commandCenterMode: 'iframe',
      })
    }

    const kolibri = serviceByName.get(SERVICE_NAMES.KOLIBRI)
    if (kolibri?.ui_location) {
      apps.push({
        key: 'kolibri',
        label: kolibri.friendly_name || 'Education Platform',
        src: getServiceLink(kolibri.ui_location),
        launcherIcon: LAUNCHER_ICONS.kolibri,
        launcherMode: 'browser',
        commandCenterEligible: false,
      })
    }

    const flatnotes = serviceByName.get(SERVICE_NAMES.FLATNOTES)
    if (flatnotes?.ui_location) {
      apps.push({
        key: 'flatnotes',
        label: flatnotes.friendly_name || 'Notes',
        src: getServiceLink(flatnotes.ui_location),
        launcherIcon: LAUNCHER_ICONS.flatnotes,
        launcherMode: 'modal',
        commandCenterEligible: true,
        commandCenterMode: 'iframe',
      })
    }

    const nodered = serviceByName.get(SERVICE_NAMES.NODERED)
    if (nodered?.ui_location) {
      apps.push({
        key: 'nodered',
        label: nodered.friendly_name || 'Node-RED',
        src: getServiceLink(nodered.ui_location),
        launcherIcon: LAUNCHER_ICONS.nodered,
        launcherMode: 'modal',
        commandCenterEligible: true,
        commandCenterMode: 'iframe',
      })
    }

    const cyberchef = serviceByName.get(SERVICE_NAMES.CYBERCHEF)
    if (cyberchef?.ui_location) {
      apps.push({
        key: 'datatools',
        label: cyberchef.friendly_name || 'Data Tools',
        src: getServiceLink(cyberchef.ui_location),
        launcherIcon: LAUNCHER_ICONS.datatools,
        launcherMode: 'modal',
        commandCenterEligible: true,
        commandCenterMode: 'iframe',
      })
    }

    if (radioInstalled) {
      apps.push({
        key: 'radio',
        label: 'Radio',
        src: '/radio',
        launcherIcon: LAUNCHER_ICONS.radio,
        launcherMode: 'browser',
        commandCenterEligible: true,
        commandCenterMode: 'iframe',
      })
    }

    apps.push({
      key: 'maps',
      label: 'Maps',
      src: '/maps',
      commandCenterEligible: true,
      commandCenterMode: 'iframe',
    })

    return apps
  }, [aiAssistantName, radioInstalled, serviceByName])

  const externalApp = quickApps.find((app) => app.key === externalAppKey) || null

  const commandCenterCandidates = quickApps.filter((app) => app.commandCenterEligible)

  const addCommandCenterTab = (app: QuickAppDefinition) => {
    if (!app.commandCenterEligible) return

    setCommandCenterTabs((current) => {
      if (current.some((tab) => tab.key === app.key)) {
        return current
      }
      return [...current, { key: app.key, label: app.label, src: app.src }]
    })
    setActiveCommandCenterTab(app.key)
    setShowAddMenu(false)
    setExternalAppKey(null)

    if (!isHomePage) {
      window.location.href = '/home'
    }
  }

  const removeCommandCenterTab = (key: string) => {
    setCommandCenterTabs((current) => current.filter((tab) => tab.key !== key))
    setActiveCommandCenterTab((current) => (current === key ? 'home' : current))
  }

  const launcherItems = quickApps
    .filter((app) => app.launcherIcon)
    .map((app) => ({
      key: app.key,
      label: app.label,
      icon: app.launcherIcon!,
      onClick: () => {
        if (app.key === 'chat') {
          setIsChatOpen(true)
          return
        }
        if (app.launcherMode === 'browser') {
          window.open(app.src, '_blank', 'noreferrer')
          return
        }
        if (app.launcherMode === 'tab') {
          addCommandCenterTab(app)
          return
        }
        setExternalAppKey(app.key)
      },
    }))

  return (
    <div className="min-h-screen flex flex-col">
      {
        window.location.pathname !== '/home' && (
          <Link href="/home" className="absolute top-60 md:top-48 left-4 flex items-center">
            <IconArrowLeft className="mr-2" size={24} />
            <p className="text-lg text-gray-600">Back to Home</p>
          </Link>
        )}
      <div
        className="p-2 flex gap-2 flex-col items-center justify-center cursor-pointer"
        onClick={() => (window.location.href = '/home')}
      >
        <img src="/project_nomad_logo.png" alt="Project Nomad Logo" className="h-40 w-40" />
        <h1 className="text-5xl font-bold text-desert-green">Command Center</h1>
      </div>
      <hr className={
        classNames(
          "text-desert-green font-semibold h-[1.5px] bg-desert-green border-none",
          window.location.pathname !== '/home' ? "mt-12 md:mt-0" : "mt-0"
        )} />
      {isHomePage && (
        <div className="border-b border-desert-stone-light bg-desert-white/80 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveCommandCenterTab('home')}
              className={classNames(
                'rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                activeCommandCenterTab === 'home'
                  ? 'border-desert-green bg-desert-green text-white'
                  : 'border-desert-stone-light bg-white text-desert-green'
              )}
            >
              Home
            </button>
            {commandCenterTabs.map((tab) => (
              <div
                key={tab.key}
                className={classNames(
                  'flex items-center rounded-full border transition-colors',
                  activeCommandCenterTab === tab.key
                    ? 'border-desert-green bg-desert-green text-white'
                    : 'border-desert-stone-light bg-white text-desert-green'
                )}
              >
                <button
                  type="button"
                  onClick={() => setActiveCommandCenterTab(tab.key)}
                  className="px-4 py-2 text-sm font-medium"
                >
                  {tab.label}
                </button>
                <button
                  type="button"
                  onClick={() => removeCommandCenterTab(tab.key)}
                  className="pr-3"
                  aria-label={`Close ${tab.label}`}
                >
                  <IconX size={14} />
                </button>
              </div>
            ))}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAddMenu((current) => !current)}
                className="inline-flex items-center gap-2 rounded-full border border-desert-stone-light bg-white px-4 py-2 text-sm font-medium text-desert-green transition-colors hover:bg-desert-beige-light"
              >
                <IconPlus size={16} />
                Add
              </button>
              {showAddMenu && (
                <div className="absolute left-0 top-12 z-40 min-w-64 rounded-xl border border-desert-stone-light bg-white p-2 shadow-xl">
                  {commandCenterCandidates.map((app) => (
                    <button
                      key={app.key}
                      type="button"
                      onClick={() => addCommandCenterTab(app)}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-desert-green transition-colors hover:bg-desert-beige-light"
                    >
                      <span>{app.label}</span>
                      {commandCenterTabs.some((tab) => tab.key === app.key) && (
                        <span className="text-xs opacity-70">Open</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {activeCommandCenterTab !== 'home' && (
              <a
                href={commandCenterTabs.find((tab) => tab.key === activeCommandCenterTab)?.src}
                target="_blank"
                rel="noreferrer"
                className="ml-auto inline-flex items-center gap-2 rounded-full border border-desert-stone-light bg-white px-4 py-2 text-sm font-medium text-desert-green transition-colors hover:bg-desert-beige-light"
              >
                <IconExternalLink size={16} />
                Open Active Tab In Browser
              </a>
            )}
          </div>
        </div>
      )}
      <div className="flex-1 w-full bg-desert">
        {isHomePage ? (
          <div className="h-full">
            <div className={activeCommandCenterTab === 'home' ? 'block h-full' : 'hidden h-full'}>
              {children}
            </div>
            {commandCenterTabs.map((tab) => (
              <div
                key={tab.key}
                className={activeCommandCenterTab === tab.key ? 'block h-full' : 'hidden h-full'}
              >
                <iframe
                  src={tab.src}
                  title={tab.label}
                  className="h-[calc(100vh-17rem)] w-full border-0 bg-white"
                />
              </div>
            ))}
          </div>
        ) : (
          children
        )}
      </div>
      <Footer />

      <FloatingAppLauncher
        expanded={launcherExpanded}
        onToggle={() => setLauncherExpanded((current) => !current)}
        items={launcherItems}
      />

      <ChatModal
        open={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        onSendToCommandCenter={() =>
          addCommandCenterTab({
            key: 'chat',
            label: aiAssistantName,
            src: '/chat',
            commandCenterEligible: true,
            commandCenterMode: 'iframe',
          })
        }
      />

      {externalApp && (
        <ExternalAppModal
          open={Boolean(externalApp)}
          onClose={() => setExternalAppKey(null)}
          title={externalApp.label}
          src={externalApp.src}
          onSendToCommandCenter={
            externalApp.commandCenterEligible
              ? () => addCommandCenterTab(externalApp)
              : undefined
          }
        />
      )}
    </div>
  )
}
