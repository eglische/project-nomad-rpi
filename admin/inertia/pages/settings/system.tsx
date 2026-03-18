import { useMemo, useState } from 'react'
import { Head } from '@inertiajs/react'
import { useQuery } from '@tanstack/react-query'
import SettingsLayout from '~/layouts/SettingsLayout'
import { DiagnosticCheck, DiagnosticsResponse, ReconcileResponse, SystemInformationResponse } from '../../../types/system'
import { QueueActivityGroup } from '../../../types/activity'
import { formatBytes } from '~/lib/util'
import CircularGauge from '~/components/systeminfo/CircularGauge'
import HorizontalBarChart from '~/components/HorizontalBarChart'
import InfoCard from '~/components/systeminfo/InfoCard'
import Alert from '~/components/Alert'
import StyledModal from '~/components/StyledModal'
import { useSystemInfo } from '~/hooks/useSystemInfo'
import { useNotifications } from '~/context/NotificationContext'
import { useModals } from '~/context/ModalContext'
import api from '~/lib/api'
import StatusCard from '~/components/systeminfo/StatusCard'
import { IconCpu, IconDatabase, IconServer, IconDeviceDesktop, IconComponents, IconAlertTriangle, IconClockHour4, IconLoader2, IconProgressCheck, IconX, IconChecks, IconRefresh, IconPlayerPlay, IconTool, IconInfoCircle, IconDownload } from '@tabler/icons-react'

function DiagnosticsCard(props: {
  check: DiagnosticCheck
  actionLoading?: string | null
  onAction: (action: NonNullable<DiagnosticCheck['autoFixAction']>) => Promise<void>
}) {
  const tone = {
    ok: {
      chip: 'bg-desert-olive/15 text-desert-olive',
      border: 'border-desert-olive/30',
    },
    info: {
      chip: 'bg-desert-green/10 text-desert-green',
      border: 'border-desert-green/20',
    },
    warn: {
      chip: 'bg-amber-100 text-amber-900',
      border: 'border-amber-200',
    },
    error: {
      chip: 'bg-red-100 text-red-800',
      border: 'border-red-200',
    },
  }[props.check.status]

  return (
    <div className={`rounded-xl border bg-desert-white px-5 py-5 shadow-sm ${tone.border}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${tone.chip}`}>
            {props.check.status}
          </div>
          <h3 className="mt-3 text-lg font-semibold text-desert-green">{props.check.title}</h3>
          <p className="mt-2 text-sm text-desert-stone-dark">{props.check.summary}</p>
          {props.check.impact && (
            <p className="mt-2 text-sm text-desert-stone-dark">
              <span className="font-semibold text-desert-green">Impact:</span> {props.check.impact}
            </p>
          )}
          {props.check.suggestedAction && (
            <p className="mt-2 text-sm text-desert-stone-dark">
              <span className="font-semibold text-desert-green">What to do:</span> {props.check.suggestedAction}
            </p>
          )}
        </div>
        {props.check.autoFixAction && (
          <button
            type="button"
            onClick={() => props.onAction(props.check.autoFixAction!)}
            disabled={props.actionLoading === props.check.autoFixAction}
            className="inline-flex items-center gap-2 rounded-lg border border-desert-green bg-desert-green px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-desert-green-dark disabled:opacity-60"
          >
            <IconTool className={`h-4 w-4 ${props.actionLoading === props.check.autoFixAction ? 'animate-spin' : ''}`} />
            {props.actionLoading === props.check.autoFixAction ? 'Working...' : 'Try Fix'}
          </button>
        )}
      </div>
      {props.check.technicalDetails && props.check.technicalDetails.length > 0 && (
        <div className="mt-4 rounded-lg bg-desert-sand/35 px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-desert-green">Technical Details</p>
          <div className="space-y-1">
            {props.check.technicalDetails.map((detail) => (
              <p key={detail} className="text-xs text-desert-stone-dark break-all">{detail}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function LiveQueueCard(props: {
  title: string
  subtitle: string
  group: QueueActivityGroup
  accent: string
}) {
  const summaryItems = [
    {
      label: 'Working now',
      value: props.group.active,
      icon: <IconLoader2 className="w-4 h-4" />,
      tone: 'text-desert-green bg-desert-green/10',
    },
    {
      label: 'Queued',
      value: props.group.waiting + props.group.delayed,
      icon: <IconClockHour4 className="w-4 h-4" />,
      tone: 'text-desert-sunset bg-desert-sunset/10',
    },
    {
      label: 'Failed',
      value: props.group.failed,
      icon: <IconX className="w-4 h-4" />,
      tone: 'text-red-700 bg-red-100',
    },
  ]

  return (
    <div className="bg-desert-white rounded-lg p-6 border border-desert-stone-light shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h3 className="text-lg font-semibold text-desert-green">{props.title}</h3>
          <p className="text-sm text-desert-stone-dark mt-1">{props.subtitle}</p>
        </div>
        <div className={`h-2.5 w-2.5 rounded-full ${props.accent}`} />
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        {summaryItems.map((item) => (
          <div key={item.label} className="rounded-xl border border-desert-stone-light/70 px-3 py-3 bg-desert-sand/40">
            <div className={`inline-flex items-center gap-2 rounded-full px-2 py-1 text-xs font-medium ${item.tone}`}>
              {item.icon}
              {item.label}
            </div>
            <div className="mt-2 text-2xl font-bold text-desert-green">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        {props.group.activeJobs.length > 0 && (
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-desert-green mb-2">
              <IconProgressCheck className="w-4 h-4" />
              Active now
            </div>
            <div className="space-y-3">
              {props.group.activeJobs.map((job) => (
                <div key={job.jobId} className="rounded-xl border border-desert-stone-light/70 bg-white/70 px-4 py-3">
                  <HorizontalBarChart
                    items={[
                      {
                        label: job.label,
                        value: job.progress,
                        total: '100%',
                        used: `${job.progress}%`,
                        type: job.status,
                      },
                    ]}
                  />
                  {(job.detail || job.failedReason) && (
                    <p className="mt-2 text-xs text-desert-stone-dark break-all">
                      {job.detail || job.failedReason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {props.group.queuedJobs.length > 0 && (
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-desert-green mb-2">
              <IconClockHour4 className="w-4 h-4" />
              Next up
            </div>
            <div className="space-y-2">
              {props.group.queuedJobs.map((job) => (
                <div key={job.jobId} className="rounded-xl border border-desert-stone-light/70 bg-desert-sand/40 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-desert-green">{job.label}</p>
                      {job.detail && (
                        <p className="text-xs text-desert-stone-dark break-all mt-1">{job.detail}</p>
                      )}
                    </div>
                    <span className="text-xs uppercase tracking-wide text-desert-stone-dark">
                      {job.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {props.group.recentFailures.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-900 mb-2">
              <IconAlertTriangle className="w-4 h-4" />
              Recent problems
            </div>
            <div className="space-y-2">
              {props.group.recentFailures.map((job) => (
                <div key={job.jobId}>
                  <p className="text-sm font-medium text-amber-900">{job.label}</p>
                  {job.failedReason && (
                    <p className="text-xs text-amber-800 mt-1">{job.failedReason}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {props.group.activeJobs.length === 0 &&
          props.group.queuedJobs.length === 0 &&
          props.group.recentFailures.length === 0 && (
            <p className="text-sm text-desert-stone-dark">
              Nothing is happening in this queue right now.
            </p>
          )}
      </div>
    </div>
  )
}

export default function SettingsPage(props: {
  system: { info: SystemInformationResponse | undefined }
}) {
  const { data: info } = useSystemInfo({
    initialData: props.system.info,
  })
  const { addNotification } = useNotifications()
  const { openModal, closeAllModals } = useModals()
  const { data: activity } = useQuery({
    queryKey: ['system-activity'],
    queryFn: () => api.getSystemActivity(),
    refetchInterval: 2000,
  })
  const { data: diagnostics, refetch: refetchDiagnostics, isFetching: diagnosticsRefreshing } = useQuery({
    queryKey: ['system-diagnostics'],
    queryFn: () => api.getSystemDiagnostics(),
    refetchInterval: 15000,
  })

  const [gpuBannerDismissed, setGpuBannerDismissed] = useState(() => {
    try {
      return localStorage.getItem('nomad:gpu-banner-dismissed') === 'true'
    } catch {
      return false
    }
  })
  const [reinstalling, setReinstalling] = useState(false)
  const [systemActionLoading, setSystemActionLoading] = useState<string | null>(null)

  const handleDismissGpuBanner = () => {
    setGpuBannerDismissed(true)
    try {
      localStorage.setItem('nomad:gpu-banner-dismissed', 'true')
    } catch {}
  }

  const handleForceReinstallOllama = () => {
    openModal(
      <StyledModal
        title="Reinstall AI Assistant?"
        onConfirm={async () => {
          closeAllModals()
          setReinstalling(true)
          try {
            const response = await api.forceReinstallService('nomad_ollama')
            if (!response || !response.success) {
              throw new Error(response?.message || 'Force reinstall failed')
            }
            addNotification({
              message: 'AI Assistant is being reinstalled with GPU support. This page will reload shortly.',
              type: 'success',
            })
            try { localStorage.removeItem('nomad:gpu-banner-dismissed') } catch {}
            setTimeout(() => window.location.reload(), 5000)
          } catch (error) {
            addNotification({
              message: `Failed to reinstall: ${error instanceof Error ? error.message : 'Unknown error'}`,
              type: 'error',
            })
            setReinstalling(false)
          }
        }}
        onCancel={closeAllModals}
        open={true}
        confirmText="Reinstall"
        cancelText="Cancel"
      >
        <p className="text-gray-700">
          This will recreate the AI Assistant container with GPU support enabled.
          Your downloaded models will be preserved. The service will be briefly
          unavailable during reinstall.
        </p>
      </StyledModal>,
      'gpu-health-force-reinstall-modal'
    )
  }

  const handleDiagnosticAction = async (action: NonNullable<DiagnosticCheck['autoFixAction']>) => {
    setSystemActionLoading(action)
    try {
      let response: ReconcileResponse | undefined

      if (action === 'reconcile') {
        response = await api.reconcileSystem()
      } else if (action === 'resume-installed') {
        response = await api.resumeInstalledServices()
      } else if (action === 'retry-failed-embeddings') {
        response = await api.retryFailedEmbeddingJobs()
      } else if (action === 'retry-failed-downloads') {
        response = await api.retryFailedDownloadJobs()
      }

      if (!response?.success) {
        throw new Error(response?.message || 'System action failed')
      }

      addNotification({
        message:
          response.actions && response.actions.length > 0
            ? `${response.message} ${response.actions.join(' • ')}`
            : response.message,
        type: 'success',
      })

      await Promise.all([refetchDiagnostics()])
    } catch (error) {
      addNotification({
        message: error instanceof Error ? error.message : 'System action failed',
        type: 'error',
      })
    } finally {
      setSystemActionLoading(null)
    }
  }

  // Use (total - available) to reflect actual memory pressure.
  // mem.used includes reclaimable buff/cache on Linux, which inflates the number.
  const memoryUsed = info?.mem.total && info?.mem.available != null
    ? info.mem.total - info.mem.available
    : info?.mem.used || 0
  const memoryUsagePercent = info?.mem.total
    ? ((memoryUsed / info.mem.total) * 100).toFixed(1)
    : 0

  const swapUsagePercent = info?.mem.swaptotal
    ? ((info.mem.swapused / info.mem.swaptotal) * 100).toFixed(1)
    : 0

  const uptimeSeconds = info?.uptime.uptime || 0
  const uptimeDays = Math.floor(uptimeSeconds / 86400)
  const uptimeHours = Math.floor((uptimeSeconds % 86400) / 3600)
  const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60)
  const uptimeDisplay = uptimeDays > 0
    ? `${uptimeDays}d ${uptimeHours}h ${uptimeMinutes}m`
    : uptimeHours > 0
      ? `${uptimeHours}h ${uptimeMinutes}m`
      : `${uptimeMinutes}m`

  const liveStatusMessage = useMemo(() => {
    if (!activity) {
      return 'Checking live background work...'
    }

    const totalActive = activity.embeddings.active + activity.downloads.active + activity.modelDownloads.active
    const totalQueued = activity.embeddings.waiting + activity.embeddings.delayed + activity.downloads.waiting + activity.downloads.delayed + activity.modelDownloads.waiting + activity.modelDownloads.delayed
    const totalFailed = activity.embeddings.failed + activity.downloads.failed + activity.modelDownloads.failed

    if (totalActive === 0 && totalQueued === 0 && totalFailed === 0) {
      return 'No background activity detected.'
    }

    const parts = []
    if (totalActive > 0) parts.push(`${totalActive} active`)
    if (totalQueued > 0) parts.push(`${totalQueued} queued`)
    if (totalFailed > 0) parts.push(`${totalFailed} failed`)
    return `${parts.join(' • ')}`
  }, [activity])

  const diagnosticsSummary = useMemo(() => {
    const counts = diagnostics?.summary || { ok: 0, info: 0, warn: 0, error: 0 }
    if (counts.error > 0) return `${counts.error} critical issues need attention`
    if (counts.warn > 0) return `${counts.warn} warnings detected`
    if (counts.info > 0) return `${counts.info} informational checks`
    return 'All diagnostic checks are healthy'
  }, [diagnostics])

  // Build storage display items - fall back to fsSize when disk array is empty
  // (Same approach as Easy Setup wizard fix from PR #90)
  const validDisks = info?.disk?.filter((d) => d.totalSize > 0) || []
  let storageItems: {
    label: string
    value: number
    total: string
    used: string
    subtext: string
  }[] = []
  if (validDisks.length > 0) {
    storageItems = validDisks.map((disk) => ({
      label: disk.name || 'Unknown',
      value: disk.percentUsed || 0,
      total: disk.totalSize ? formatBytes(disk.totalSize) : 'N/A',
      used: disk.totalUsed ? formatBytes(disk.totalUsed) : 'N/A',
      subtext: `${formatBytes(disk.totalUsed || 0)} / ${formatBytes(disk.totalSize || 0)}`,
    }))
  } else if (info?.fsSize && info.fsSize.length > 0) {
    // Deduplicate by size (same physical disk mounted in multiple places shows identical sizes)
    const seen = new Set<number>()
    const uniqueFs = info.fsSize.filter((fs) => {
      if (fs.size <= 0 || seen.has(fs.size)) return false
      seen.add(fs.size)
      return true
    })
    // Prefer real block devices (/dev/), exclude virtual filesystems (efivarfs, tmpfs, etc.)
    const realDevices = uniqueFs.filter((fs) => fs.fs.startsWith('/dev/'))
    const displayFs = realDevices.length > 0 ? realDevices : uniqueFs
    storageItems = displayFs.map((fs) => ({
      label: fs.fs || 'Unknown',
      value: fs.use || 0,
      total: formatBytes(fs.size),
      used: formatBytes(fs.used),
      subtext: `${formatBytes(fs.used)} / ${formatBytes(fs.size)}`,
    }))
  }

  return (
    <SettingsLayout>
      <Head title="System Information" />
      <div className="xl:pl-72 w-full">
        <main className="px-6 lg:px-12 py-6 lg:py-8">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-desert-green mb-2">System Information</h1>
            <p className="text-desert-stone-dark">
              Real-time monitoring and diagnostics • Last updated: {new Date().toLocaleString()} •
              Refreshing data every 30 seconds
            </p>
          </div>
          {Number(memoryUsagePercent) > 90 && (
            <div className="mb-6">
              <Alert
                type="error"
                title="Very High Memory Usage Detected"
                message="System memory usage exceeds 90%. Performance degradation may occur."
                variant="bordered"
              />
            </div>
          )}
          <section className="mb-12">
            <div className="flex flex-col gap-3 mb-6">
              <h2 className="text-2xl font-bold text-desert-green flex items-center gap-2">
                <div className="w-1 h-6 bg-desert-green" />
                Health &amp; Help
              </h2>
              <div className="rounded-xl border border-desert-stone-light bg-desert-white px-4 py-4 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-sm font-medium text-desert-green">{diagnosticsSummary}</p>
                    <p className="mt-1 text-xs text-desert-stone-dark">
                      Nomad checks storage, Docker, AI dependencies, GPU visibility, queue health, and stopped services.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => handleDiagnosticAction('reconcile')}
                      disabled={systemActionLoading !== null}
                      className="inline-flex items-center gap-2 rounded-lg border border-desert-green bg-desert-green px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-desert-green-dark disabled:opacity-60"
                    >
                      <IconRefresh className={`h-4 w-4 ${systemActionLoading === 'reconcile' ? 'animate-spin' : ''}`} />
                      Soft Fix
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDiagnosticAction('resume-installed')}
                      disabled={systemActionLoading !== null}
                      className="inline-flex items-center gap-2 rounded-lg border border-desert-stone-light bg-white px-3 py-2 text-sm font-medium text-desert-green transition-colors hover:bg-desert-sand disabled:opacity-60"
                    >
                      <IconPlayerPlay className="h-4 w-4" />
                      Resume Installed Services
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDiagnosticAction('retry-failed-embeddings')}
                      disabled={systemActionLoading !== null}
                      className="inline-flex items-center gap-2 rounded-lg border border-desert-stone-light bg-white px-3 py-2 text-sm font-medium text-desert-green transition-colors hover:bg-desert-sand disabled:opacity-60"
                    >
                      <IconChecks className="h-4 w-4" />
                      Retry Failed Embeddings
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDiagnosticAction('retry-failed-downloads')}
                      disabled={systemActionLoading !== null}
                      className="inline-flex items-center gap-2 rounded-lg border border-desert-stone-light bg-white px-3 py-2 text-sm font-medium text-desert-green transition-colors hover:bg-desert-sand disabled:opacity-60"
                    >
                      <IconDownload className="h-4 w-4" />
                      Retry Failed Downloads
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-desert-stone-dark">
                  <IconInfoCircle className="h-4 w-4" />
                  {diagnosticsRefreshing ? 'Refreshing diagnostics...' : `Updated ${diagnostics?.generatedAt ? new Date(diagnostics.generatedAt).toLocaleString() : 'just now'}`}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {(diagnostics?.checks || []).map((check) => (
                <DiagnosticsCard
                  key={check.key}
                  check={check}
                  actionLoading={systemActionLoading}
                  onAction={handleDiagnosticAction}
                />
              ))}
            </div>
          </section>
          <section className="mb-12">
            <div className="flex flex-col gap-3 mb-6">
              <h2 className="text-2xl font-bold text-desert-green flex items-center gap-2">
                <div className="w-1 h-6 bg-desert-green" />
                Live Activity
              </h2>
              <div className="rounded-xl border border-desert-stone-light bg-desert-white px-4 py-3 shadow-sm">
                <p className="text-sm font-medium text-desert-green">{liveStatusMessage}</p>
                <p className="text-xs text-desert-stone-dark mt-1">
                  This updates automatically so users can see what Nomad is doing and spot failures without opening logs.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <LiveQueueCard
                title="Knowledge Base Indexing"
                subtitle="Embedding and indexing files for RAG search."
                group={activity?.embeddings ?? {
                  waiting: 0,
                  active: 0,
                  delayed: 0,
                  failed: 0,
                  activeJobs: [],
                  queuedJobs: [],
                  recentFailures: [],
                }}
                accent="bg-desert-green"
              />
              <LiveQueueCard
                title="Content Downloads"
                subtitle="ZIM, map, and content files moving onto local storage."
                group={activity?.downloads ?? {
                  waiting: 0,
                  active: 0,
                  delayed: 0,
                  failed: 0,
                  activeJobs: [],
                  queuedJobs: [],
                  recentFailures: [],
                }}
                accent="bg-desert-sunset"
              />
              <LiveQueueCard
                title="Model Downloads"
                subtitle="Ollama model pulls and retries."
                group={activity?.modelDownloads ?? {
                  waiting: 0,
                  active: 0,
                  delayed: 0,
                  failed: 0,
                  activeJobs: [],
                  queuedJobs: [],
                  recentFailures: [],
                }}
                accent="bg-desert-olive"
              />
            </div>
          </section>
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-desert-green mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-desert-green" />
              Resource Usage
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              <div className="bg-desert-white rounded-lg p-6 border border-desert-stone-light shadow-sm hover:shadow-lg transition-shadow">
                <CircularGauge
                  value={info?.currentLoad.currentLoad || 0}
                  label="CPU Usage"
                  size="lg"
                  variant="cpu"
                  subtext={`${info?.cpu.cores || 0} cores`}
                  icon={<IconCpu className="w-8 h-8" />}
                />
              </div>
              <div className="bg-desert-white rounded-lg p-6 border border-desert-stone-light shadow-sm hover:shadow-lg transition-shadow">
                <CircularGauge
                  value={Number(memoryUsagePercent)}
                  label="Memory Usage"
                  size="lg"
                  variant="memory"
                  subtext={`${formatBytes(memoryUsed)} / ${formatBytes(info?.mem.total || 0)}`}
                  icon={<IconDatabase className="w-8 h-8" />}
                />
              </div>
              <div className="bg-desert-white rounded-lg p-6 border border-desert-stone-light shadow-sm hover:shadow-lg transition-shadow">
                <CircularGauge
                  value={Number(swapUsagePercent)}
                  label="Swap Usage"
                  size="lg"
                  variant="disk"
                  subtext={`${formatBytes(info?.mem.swapused || 0)} / ${formatBytes(info?.mem.swaptotal || 0)}`}
                  icon={<IconServer className="w-8 h-8" />}
                />
              </div>
            </div>
          </section>
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-desert-green mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-desert-green" />
              System Details
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <InfoCard
                title="Operating System"
                icon={<IconDeviceDesktop className="w-6 h-6" />}
                variant="elevated"
                data={[
                  { label: 'Distribution', value: info?.os.distro },
                  { label: 'Kernel Version', value: info?.os.kernel },
                  { label: 'Architecture', value: info?.os.arch },
                  { label: 'Hostname', value: info?.os.hostname },
                  { label: 'Platform', value: info?.os.platform },
                ]}
              />
              <InfoCard
                title="Processor"
                icon={<IconCpu className="w-6 h-6" />}
                variant="elevated"
                data={[
                  { label: 'Manufacturer', value: info?.cpu.manufacturer },
                  { label: 'Brand', value: info?.cpu.brand },
                  { label: 'Cores', value: info?.cpu.cores },
                  { label: 'Physical Cores', value: info?.cpu.physicalCores },
                  {
                    label: 'Virtualization',
                    value: info?.cpu.virtualization ? 'Enabled' : 'Disabled',
                  },
                ]}
              />
              {info?.gpuHealth?.status === 'passthrough_failed' && !gpuBannerDismissed && (
                <div className="lg:col-span-2">
                  <Alert
                    type="warning"
                    variant="bordered"
                    title="GPU Not Accessible to AI Assistant"
                    message="Your system has an NVIDIA GPU, but the AI Assistant can't access it. AI is running on CPU only, which is significantly slower."
                    dismissible={true}
                    onDismiss={handleDismissGpuBanner}
                    buttonProps={{
                      children: 'Fix: Reinstall AI Assistant',
                      icon: 'IconRefresh',
                      variant: 'action',
                      size: 'sm',
                      onClick: handleForceReinstallOllama,
                      loading: reinstalling,
                      disabled: reinstalling,
                    }}
                  />
                </div>
              )}
              {info?.graphics?.controllers && info.graphics.controllers.length > 0 && (
                <InfoCard
                  title="Graphics"
                  icon={<IconComponents className="w-6 h-6" />}
                  variant="elevated"
                  data={info.graphics.controllers.map((gpu, i) => {
                    const prefix = info.graphics.controllers.length > 1 ? `GPU ${i + 1} ` : ''
                    return [
                      { label: `${prefix}Model`, value: gpu.model },
                      { label: `${prefix}Vendor`, value: gpu.vendor },
                      { label: `${prefix}VRAM`, value: gpu.vram ? `${gpu.vram} MB` : 'N/A' },
                    ]
                  }).flat()}
                />
              )}
            </div>
          </section>
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-desert-green mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-desert-green" />
              Memory Allocation
            </h2>
            <div className="bg-desert-white rounded-lg p-8 border border-desert-stone-light shadow-sm hover:shadow-lg transition-shadow">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
                <div className="text-center">
                  <div className="text-3xl font-bold text-desert-green mb-1">
                    {formatBytes(info?.mem.total || 0)}
                  </div>
                  <div className="text-sm text-desert-stone-dark uppercase tracking-wide">
                    Total RAM
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-desert-green mb-1">
                    {formatBytes(memoryUsed)}
                  </div>
                  <div className="text-sm text-desert-stone-dark uppercase tracking-wide">
                    Used RAM
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-desert-green mb-1">
                    {formatBytes(info?.mem.available || 0)}
                  </div>
                  <div className="text-sm text-desert-stone-dark uppercase tracking-wide">
                    Available RAM
                  </div>
                </div>
              </div>
              <div className="relative h-12 bg-desert-stone-lighter rounded-lg overflow-hidden border border-desert-stone-light">
                <div
                  className="absolute left-0 top-0 h-full bg-desert-orange transition-all duration-1000"
                  style={{ width: `${memoryUsagePercent}%` }}
                ></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-bold text-desert-white drop-shadow-md z-10">
                    {memoryUsagePercent}% Utilized
                  </span>
                </div>
              </div>
            </div>
          </section>
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-desert-green mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-desert-green" />
              Storage Devices
            </h2>

            <div className="bg-desert-white rounded-lg p-8 border border-desert-stone-light shadow-sm hover:shadow-lg transition-shadow">
              {storageItems.length > 0 ? (
                <HorizontalBarChart
                  items={storageItems}
                  progressiveBarColor={true}
                  statuses={[
                    {
                      label: 'Normal',
                      min_threshold: 0,
                      color_class: 'bg-desert-olive',
                    },
                    {
                      label: 'Warning - Usage High',
                      min_threshold: 75,
                      color_class: 'bg-desert-orange',
                    },
                    {
                      label: 'Critical - Disk Almost Full',
                      min_threshold: 90,
                      color_class: 'bg-desert-red',
                    },
                  ]}
                />
              ) : (
                <div className="text-center text-desert-stone-dark py-8">
                  No storage devices detected
                </div>
              )}
            </div>
          </section>
          <section>
            <h2 className="text-2xl font-bold text-desert-green mb-6 flex items-center gap-2">
              <div className="w-1 h-6 bg-desert-green" />
              System Status
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatusCard title="System Uptime" value={uptimeDisplay} />
              <StatusCard title="CPU Cores" value={info?.cpu.cores || 0} />
              <StatusCard title="Storage Devices" value={storageItems.length} />
            </div>
          </section>
        </main>
      </div>
    </SettingsLayout>
  )
}
