import clsx from 'clsx'
import { Monitor, Moon, Sun } from 'lucide-react'
import { m } from 'motion/react'
import { useTheme } from 'next-themes'

export function ContentFooter() {
  const { theme, setTheme } = useTheme()

  const themeOptions = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'system', icon: Monitor, label: 'System' },
    { value: 'dark', icon: Moon, label: 'Dark' },
  ]
  const activeIndex = themeOptions.findIndex((option) => option.value === theme)

  return (
    <div className="mt-12 flex justify-end border-t border-zinc-200 pt-8 lg:mt-16 dark:border-zinc-800">
      <div className="bg-background-secondary border-border relative flex items-center gap-1 rounded-full border p-1">
        <m.div
          className="bg-background border-border/50 absolute rounded-full border"
          initial={false}
          animate={{
            x: activeIndex * 36, // 32px button width + 4px gap
            width: 32,
            height: 32,
          }}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 30,
          }}
        />
        {themeOptions.map((option) => (
          <button
            type="button"
            key={option.value}
            onClick={() => setTheme(option.value)}
            className={clsx(
              'relative z-10 rounded-full p-2 transition-colors',
              theme === option.value ? 'text-text' : 'text-text-secondary hover:text-text',
            )}
            aria-label={`Switch to ${option.label} theme`}
            title={option.label}
          >
            <option.icon className="h-4 w-4" />
          </button>
        ))}
      </div>
    </div>
  )
}
