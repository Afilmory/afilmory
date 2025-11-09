import { Monitor, Moon, Sun } from 'lucide-react'
import { m } from 'motion/react'
import { useTheme } from 'next-themes'

interface DocumentMetaProps {
  createdAt?: string
  lastModified?: string
}

export function DocumentFooter({ createdAt, lastModified }: DocumentMetaProps) {
  const { theme, setTheme } = useTheme()

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString)
      return new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Asia/Shanghai',
      }).format(date)
    } catch {
      return dateString
    }
  }
  const themeOptions = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'system', icon: Monitor, label: 'System' },
    { value: 'dark', icon: Moon, label: 'Dark' },
  ]
  const activeIndex = themeOptions.findIndex((option) => option.value === theme)

  return (
    <div className="border-separator mt-12 border-t pt-4 lg:mt-16">
      <div className="flex justify-between py-1">
        {!createdAt && !lastModified ? (
          <div />
        ) : (
          <table
            className="text-sm"
            style={{
              width: 'auto',
              minWidth: 0,
              margin: '0 0',
              border: 'none',
              background: 'transparent',
            }}
          >
            <tbody>
              {createdAt && (
                <tr>
                  <td
                    style={{
                      padding: '0',
                      border: 'none',
                      background: 'transparent',
                    }}
                    className="text-text-secondary pr-4 align-top font-medium whitespace-nowrap"
                  >
                    Created At
                  </td>
                  <td
                    style={{
                      padding: '0',
                      border: 'none',
                      background: 'transparent',
                    }}
                  >
                    <time dateTime={createdAt} className="text-text-secondary rounded px-2 py-1 font-mono text-xs">
                      {formatDate(createdAt)}
                    </time>
                  </td>
                </tr>
              )}
              {lastModified && (
                <tr>
                  <td
                    style={{
                      padding: '0',
                      border: 'none',
                      background: 'transparent',
                    }}
                    className="text-text-secondary pr-4 align-top font-medium whitespace-nowrap"
                  >
                    Last Modified
                  </td>
                  <td
                    style={{
                      padding: '0',
                      border: 'none',
                      background: 'transparent',
                    }}
                  >
                    <time dateTime={lastModified} className="text-text-secondary rounded px-2 py-1 font-mono text-xs">
                      {formatDate(lastModified)}
                    </time>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        <div className="bg-background-secondary border-border relative flex items-center gap-1 rounded-full border p-1">
          <m.div
            className="bg-background border-border/50 absolute rounded-full border shadow-sm"
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
              className={`relative z-10 rounded-full p-2 transition-colors ${
                theme === option.value ? 'text-text' : 'text-text-secondary hover:text-text'
              }`}
              aria-label={`Switch to ${option.label} theme`}
              title={option.label}
            >
              <option.icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
