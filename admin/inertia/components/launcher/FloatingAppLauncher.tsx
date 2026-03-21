import classNames from 'classnames'
import {
  IconBrandNodejs,
  IconBooks,
  IconCalendarMonth,
  IconChefHat,
  IconChevronLeft,
  IconChevronRight,
  IconMessages,
  IconNotebook,
  IconRadio,
  IconSchool,
} from '@tabler/icons-react'

interface LauncherItem {
  key: string
  label: string
  icon: React.ReactNode
  onClick: () => void
}

interface FloatingAppLauncherProps {
  expanded: boolean
  onToggle: () => void
  items: LauncherItem[]
}

export const LAUNCHER_ICONS = {
  chat: <IconMessages className="h-6 w-6" />,
  kiwix: <IconBooks className="h-6 w-6" />,
  kolibri: <IconSchool className="h-6 w-6" />,
  flatnotes: <IconNotebook className="h-6 w-6" />,
  nodered: <IconBrandNodejs className="h-6 w-6" />,
  radio: <IconRadio className="h-6 w-6" />,
  datatools: <IconChefHat className="h-6 w-6" />,
  calendar: <IconCalendarMonth className="h-6 w-6" />,
}

export default function FloatingAppLauncher({
  expanded,
  onToggle,
  items,
}: FloatingAppLauncherProps) {
  if (items.length === 0) {
    return null
  }

  return (
    <div className="fixed bottom-6 right-6 z-40 flex items-center gap-3">
      <div
        className={classNames(
          'flex items-center gap-3 transition-all duration-300 ease-out',
          expanded ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-8 opacity-0'
        )}
      >
        {items.map((item, index) => (
          <button
            key={item.key}
            type="button"
            onClick={item.onClick}
            title={item.label}
            aria-label={item.label}
            className={classNames(
              'inline-flex h-14 w-14 items-center justify-center rounded-full border border-desert-stone-light/80 bg-desert-green text-white shadow-lg backdrop-blur-md transition-all duration-300 hover:-translate-y-0.5 hover:bg-desert-green/90 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-desert-green focus:ring-offset-2',
              expanded ? 'scale-100' : 'scale-90'
            )}
            style={{
              transitionDelay: expanded ? `${index * 45}ms` : '0ms',
            }}
          >
            {item.icon}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onToggle}
        className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-desert-stone-light/80 bg-desert-white/80 text-desert-green shadow-lg backdrop-blur-md transition-all duration-300 hover:bg-desert-white hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-desert-green focus:ring-offset-2"
        aria-label={expanded ? 'Hide quick app launchers' : 'Show quick app launchers'}
      >
        {expanded ? <IconChevronRight className="h-6 w-6" /> : <IconChevronLeft className="h-6 w-6" />}
      </button>
    </div>
  )
}
