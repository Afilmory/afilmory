import type { FC } from 'react'

export const WelcomeStep: FC = () => (
  <div className="space-y-8">
    <div>
      <h3 className="text-text mb-3 flex items-center gap-2 text-sm font-semibold">
        <i className="i-mingcute-compass-2-fill text-accent" />
        What happens next
      </h3>
      <p className="text-text-secondary text-sm leading-relaxed">
        We will create your first tenant, provision an administrator, and bootstrap super administrator access for
        emergency management.
      </p>
    </div>

    <div className="via-text/20 h-[0.5px] bg-linear-to-r from-transparent to-transparent" />

    <div>
      <h3 className="text-text mb-3 flex items-center gap-2 text-sm font-semibold">
        <i className="i-mingcute-shield-fill text-accent" />
        Requirements
      </h3>
      <ul className="text-text-secondary space-y-2 text-sm">
        <li className="flex items-start gap-2">
          <i className="i-mingcute-check-line text-accent mt-0.5 shrink-0" />
          <span>Ensure the core service can access email providers or authentication callbacks if configured.</span>
        </li>
        <li className="flex items-start gap-2">
          <i className="i-mingcute-check-line text-accent mt-0.5 shrink-0" />
          <span>
            Keep the terminal open to capture the super administrator credentials printed after initialization.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <i className="i-mingcute-check-line text-accent mt-0.5 shrink-0" />
          <span>Prepare OAuth credentials or continue without them; you can configure integrations later.</span>
        </li>
      </ul>
    </div>

    <div className="via-text/20 h-[0.5px] bg-linear-to-r from-transparent to-transparent" />

    <div>
      <h3 className="text-text mb-4 text-sm font-semibold">What we will collect</h3>
      <div className="grid gap-6 sm:grid-cols-3">
        <div>
          <p className="text-text text-sm font-semibold">Tenant profile</p>
          <p className="text-text-secondary mt-1.5 text-sm leading-relaxed">
            Workspace name, slug, and optional domain mapping.
          </p>
        </div>
        <div>
          <p className="text-text text-sm font-semibold">Admin account</p>
          <p className="text-text-secondary mt-1.5 text-sm leading-relaxed">
            Email, name, and secure password for the first administrator.
          </p>
        </div>
        <div>
          <p className="text-text text-sm font-semibold">Integrations</p>
          <p className="text-text-secondary mt-1.5 text-sm leading-relaxed">
            Optional OAuth, AI, and map provider credentials.
          </p>
        </div>
      </div>
    </div>
  </div>
)
