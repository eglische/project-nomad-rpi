import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react'
import { IconExternalLink, IconX } from '@tabler/icons-react'

interface ExternalAppModalProps {
  open: boolean
  onClose: () => void
  title: string
  src: string
  onSendToCommandCenter?: () => void
}

export default function ExternalAppModal({
  open,
  onClose,
  title,
  src,
  onSendToCommandCenter,
}: ExternalAppModalProps) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-black/30 backdrop-blur-sm transition-opacity data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in"
      />

      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel
          transition
          className="relative flex h-[85vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl transition-all data-[closed]:scale-95 data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in"
        >
          <div className="flex items-center justify-between border-b border-desert-stone-light/70 bg-desert-green px-5 py-3 text-white">
            <h2 className="text-lg font-semibold">{title}</h2>
            <div className="flex items-center gap-2">
              {onSendToCommandCenter && (
                <button
                  type="button"
                  onClick={onSendToCommandCenter}
                  className="inline-flex items-center gap-2 rounded-full border border-desert-beige-light/60 bg-desert-beige px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-desert-beige-dark"
                >
                  Send To Command Center
                </button>
              )}
              <a
                href={src}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-desert-beige-light/60 bg-desert-beige px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-desert-beige-dark"
              >
                <IconExternalLink size={16} />
                Open In Tab
              </a>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-desert-beige-light/60 bg-desert-beige text-white transition-colors hover:bg-desert-beige-dark"
                aria-label={`Close ${title}`}
              >
                <IconX size={18} />
              </button>
            </div>
          </div>

          <iframe
            src={src}
            title={title}
            className="h-full w-full bg-desert"
          />
        </DialogPanel>
      </div>
    </Dialog>
  )
}
