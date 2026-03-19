import { useEffect, useMemo, useState } from 'react'
import { IconDatabaseImport, IconFolderOpen, IconRefreshAlert } from '@tabler/icons-react'
import StyledModal from '~/components/StyledModal'
import type { RecoveryScanResponse } from '../../../types/system'

type RecoveryModalProps = {
  open: boolean
  recovery?: RecoveryScanResponse
  loading?: boolean
  onClose: () => void
  onConfirm: (serviceNames: string[]) => Promise<void> | void
}

export default function RecoveryModal(props: RecoveryModalProps) {
  const recoverableServices = useMemo(
    () => (props.recovery?.services || []).filter((service) => service.state === 'recoverable'),
    [props.recovery]
  )
  const [selectedServices, setSelectedServices] = useState<string[]>([])

  useEffect(() => {
    if (!props.open) return
    setSelectedServices(recoverableServices.map((service) => service.serviceName))
  }, [props.open, recoverableServices])

  return (
    <StyledModal
      title="Recover Previous Project N.O.M.A.D. Data"
      open={props.open}
      onCancel={props.onClose}
      onConfirm={() => props.onConfirm(selectedServices)}
      onClose={props.onClose}
      cancelText="Close"
      confirmText="Import Selected"
      confirmLoading={Boolean(props.loading)}
      icon={<IconDatabaseImport className="h-10 w-10 text-desert-green" />}
    >
      <div className="space-y-4 text-left">
        <p className="text-sm text-desert-stone-dark">
          Nomad found preserved app data on <span className="font-semibold text-desert-green">{props.recovery?.storagePath}</span>.
          Importing here reconnects the existing data to the current install. It does not format the disk.
        </p>

        {recoverableServices.length === 0 ? (
          <div className="rounded-xl border border-desert-stone-light bg-desert-sand/35 px-4 py-4">
            <p className="text-sm font-medium text-desert-green">No recoverable services are waiting right now.</p>
            <p className="mt-1 text-xs text-desert-stone-dark">
              If you already imported them, Nomad will keep using the preserved data as normal.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {recoverableServices.map((service) => {
              const checked = selectedServices.includes(service.serviceName)

              return (
                <label
                  key={service.serviceName}
                  className="block rounded-xl border border-desert-stone-light bg-desert-sand/35 px-4 py-4 cursor-pointer"
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-desert-stone-light text-desert-green focus:ring-desert-green"
                      checked={checked}
                      onChange={(event) => {
                        if (event.target.checked) {
                          setSelectedServices((current) => [...current, service.serviceName])
                        } else {
                          setSelectedServices((current) =>
                            current.filter((item) => item !== service.serviceName)
                          )
                        }
                      }}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-desert-green">{service.friendlyName}</p>
                        <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                          preserved data found
                        </span>
                      </div>
                      {service.description && (
                        <p className="mt-1 text-xs text-desert-stone-dark">{service.description}</p>
                      )}
                      <div className="mt-3 flex items-start gap-2 text-xs text-desert-stone-dark">
                        <IconFolderOpen className="mt-0.5 h-4 w-4 shrink-0" />
                        <span className="break-all">{service.storagePath}</span>
                      </div>
                      {service.evidence.length > 0 && (
                        <div className="mt-2 rounded-lg bg-white/70 px-3 py-2">
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-desert-green">
                            What Nomad found
                          </p>
                          <div className="space-y-1">
                            {service.evidence.map((detail) => (
                              <p key={`${service.serviceName}-${detail}`} className="text-xs text-desert-stone-dark">
                                {detail}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </label>
              )
            })}
          </div>
        )}

        <div className="rounded-xl border border-desert-stone-light bg-white/70 px-4 py-3">
          <div className="flex items-start gap-2">
            <IconRefreshAlert className="mt-0.5 h-4 w-4 text-desert-green shrink-0" />
            <p className="text-xs text-desert-stone-dark">
              If a service was previously installed, this reconnects it using the same Docker install logic as a normal app install. Existing files stay on the preserved drive.
            </p>
          </div>
        </div>
      </div>
    </StyledModal>
  )
}
