import { Systeminformation } from 'systeminformation'

export type GpuHealthStatus = {
  status: 'ok' | 'passthrough_failed' | 'no_gpu' | 'ollama_not_installed'
  hasNvidiaRuntime: boolean
  ollamaGpuAccessible: boolean
}

export type SystemInformationResponse = {
  cpu: Systeminformation.CpuData
  mem: Systeminformation.MemData
  os: Systeminformation.OsData
  disk: NomadDiskInfo[]
  currentLoad: Systeminformation.CurrentLoadData
  fsSize: Systeminformation.FsSizeData[]
  uptime: Systeminformation.TimeData
  graphics: Systeminformation.GraphicsData
  gpuHealth?: GpuHealthStatus
}

// Type inferrence is not working properly with usePage and shared props, so we define this type manually
export type UsePageProps = {
  appVersion: string
  environment: string
}

export type LSBlockDevice = {
  name: string
  size: string
  type: string
  model: string | null
  serial: string | null
  vendor: string | null
  rota: boolean | null
  tran: string | null
  children?: LSBlockDevice[]
}

export type NomadDiskInfoRaw = {
  diskLayout: {
    blockdevices: LSBlockDevice[]
  }
  fsSize: {
    fs: string
    size: number
    used: number
    available: number
    use: number
    mount: string
  }[]
}

export type NomadDiskInfo = {
  name: string
  model: string
  vendor: string
  rota: boolean
  tran: string
  size: string
  totalUsed: number
  totalSize: number
  percentUsed: number
  filesystems: {
    fs: string
    mount: string
    used: number
    size: number
    percentUsed: number
  }[]
}

export type SystemUpdateStatus = {
  stage: 'idle' | 'starting' | 'pulling' | 'pulled' | 'recreating' | 'complete' | 'error'
  progress: number
  message: string
  timestamp: string
}

export type DiagnosticStatus = 'ok' | 'info' | 'warn' | 'error'

export type DiagnosticCheck = {
  key: string
  title: string
  status: DiagnosticStatus
  summary: string
  impact?: string
  suggestedAction?: string
  technicalDetails?: string[]
  autoFixAction?: 'reconcile' | 'resume-installed' | 'retry-failed-embeddings' | 'retry-failed-downloads' | null
}

export type DiagnosticsResponse = {
  generatedAt: string
  summary: {
    ok: number
    info: number
    warn: number
    error: number
  }
  checks: DiagnosticCheck[]
}

export type ReconcileResponse = {
  success: boolean
  message: string
  actions: string[]
  skipped?: boolean
}

export type CheckLatestVersionResult = {
  success: boolean,
  updateAvailable: boolean,
  currentVersion: string,
  latestVersion: string,
  message?: string
}
