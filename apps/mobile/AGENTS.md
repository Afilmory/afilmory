# Mobile App Agent Guidelines

## Agent Testing

Use the **Local** application variant for Simulator-based Agent Testing unless the task explicitly
requires validating production-only capabilities.

| Property | Local Agent Testing value |
| --- | --- |
| App name | `Afilmory Local` |
| Bundle identifier | `app.afilmory.local` |
| URL scheme | `afilmory-local` |
| Default API | `http://localhost:1841` |
| Authentication | Local password account |

- Build it with `pnpm --filter @afilmory/mobile ios:local`.
- Start the local Core service before testing authentication or API-backed flows. A connection
  failure to port `1841` means the app selected the correct environment but the backend is not
  running.
- Confirm that the Simulator target is `Afilmory Local`; the production `Afilmory` app may be
  installed at the same time and must not be used accidentally.
- The Local variant carries only its default Keychain access group so native sessions survive an
  app relaunch. Do not attempt Sign in with Apple in the Local variant. Push notifications, Share
  Extension, widgets, Live Activities, and StoreKit sponsorship are also production-only.
- Debug builds may temporarily change the API environment from Lab. Reset it to **Local** after a
  custom-environment test so later Agent Testing starts from the variant default.
- Treat `apps/mobile/Afilmory.xcodeproj` as generated output. Make persistent project changes in
  `apps/mobile/project.yml`, then run `pnpm --filter @afilmory/mobile native:generate`.
- The deployment target is iOS 18. APIs introduced after iOS 18 must be guarded with availability
  checks and provide an iOS 18 fallback.

## Verification

Before launching either application variant in Simulator, start the memory guard in a separate
terminal and keep it alive for the complete runtime verification:

```bash
pnpm --filter @afilmory/mobile native:memory-guard -- --limit-gib 30 --log /tmp/afilmory-memory-guard.log
```

The guard samples the Simulator app's physical memory footprint every 0.5 seconds. Reaching 30 GiB
terminates the app and makes the verification fail. Start the guard before `simctl launch`, retain
its log as verification evidence, and stop it only after the app has been terminated. CoreSimulator
does not expose a per-app kernel hard limit, so this watchdog is mandatory for Agent Testing.

Run the smallest relevant checks first:

```bash
pnpm --filter @afilmory/mobile native:generate
pnpm --filter @afilmory/mobile native:test
```

For Local runtime changes, perform at least one Simulator build and verify that requests target
`localhost:1841`.

Use `pnpm --filter @afilmory/mobile ios:production` only when the task explicitly requires running
the production application or validating production-only integrations.
