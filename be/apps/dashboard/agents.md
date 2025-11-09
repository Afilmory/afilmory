# agents.md

Guidance for AI code agents working in this repository. This document codifies project-specific rules, patterns, and safe operations. When in doubt or on conflict, prefer the actual codebase.

Scope:

- Stack: Vite + React 19 + TypeScript, TailwindCSS v4, Radix UI, Jotai, TanStack Query, Framer Motion (LazyMotion), React Router with vite-plugin-route-builder.
- Package manager: pnpm (required). See package.json for script names and versions.

Core commands:

- Development: pnpm dev
- Build: pnpm build
- Preview: pnpm serve
- Lint: pnpm lint
- Format: pnpm format

Repository rules (must follow):

- Never edit auto-generated files (e.g., src/generated-routes.ts). Add/rename files under src/pages/ to affect routing.
- Use the path alias ~/ for all src imports (configured in tsconfig).
- Use Framer Motion’s LazyMotion with m._ components only. Do not use motion._ directly.
- Prefer Spring presets from @afilmory/utils for animations.
- Use the Pastel color system classes instead of raw Tailwind colors.
- Follow component organization:
  - Base UI primitives -> src/components/ui/
  - App-shared (non-domain) -> src/components/common/
  - Feature/domain modules -> src/modules/<domain>/
- State management via Jotai with helpers from ~/lib/jotai. Atoms live in src/atoms/.
- Do not rely on the global location object. Use the stable router utilities (~/atoms/route) or React Router hooks through the StableRouterProvider.
- Keep JSX self-closing where applicable; adhere to eslint-config-hyoban and Prettier settings.

Routing and layouts:

- File-based routing via vite-plugin-route-builder.
  - Sync routes: \*.sync.tsx (no code-splitting)
  - Async routes: \*.tsx (lazy loaded)
  - Layout files: layout.tsx within a segment; render children via <Outlet />
- Example segment structure (do not edit src/generated-routes.ts directly):
  - src/pages/(main)/index.sync.tsx -> root route
  - src/pages/(main)/about.sync.tsx -> /about
  - src/pages/(main)/settings/layout.tsx -> wraps /settings subtree

Providers:

- Root providers are composed in src/providers/root-providers.tsx and include:
  - LazyMotion + MotionConfig
  - TanStack QueryClientProvider
  - Jotai Provider with a global store
  - Event, Context menu, and settings sync providers
  - StableRouterProvider to stabilize routing data and navigation
  - ModalContainer and Toaster
- Add new cross-cutting providers here, keeping order and side effects in mind.

Animation rules:

- Always use m.\* components imported from motion/react.
- Prefer transitions from Spring presets for consistency and bundle efficiency.

Example (animation):

```
import { m } from 'motion/react'
import { Spring } from '@afilmory/utils'

export function AnimatedCard(props: { children?: React.ReactNode }) {
  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={Spring.presets.smooth}
      className="rounded-lg bg-fill shadow-sm p-4"
    >
      {props.children}
    </m.div>
  )
}
```

Jotai patterns:

- Use createAtomHooks and createAtomAccessor from ~/lib/jotai for consistent access, hooks, and selectors.
- Keep atoms in src/atoms/; co-locate selectors next to atoms when domain-specific.

Example (atom + hooks):

```
import { atom } from 'jotai'
import { createAtomHooks, createAtomAccessor } from '~/lib/jotai'

const baseCounterAtom = atom(0)

// Typed hooks: [atomRef, useAtomHook, useValue, useSetter, get, set]
export const [
  counterAtom,
  useCounter,
  useCounterValue,
  useSetCounter,
  getCounter,
  setCounter,
] = createAtomHooks(baseCounterAtom)

// Optional: selectors
export const useIsEven = () => {
  const value = useCounterValue() // read-only value hook
  return value % 2 === 0
}
```

Stable routing patterns:

- Read-only route data and stable navigate are provided via ~/atoms/route and set by src/providers/stable-router-provider.tsx.
- Prefer useReadonlyRouteSelector for reading route state without causing re-renders.
- Prefer getStableRouterNavigate for imperative navigation outside React components.

Example (route utilities):

```
import { useReadonlyRouteSelector, getStableRouterNavigate } from '~/atoms/route'

export function RouteAwareComponent() {
  const pathname = useReadonlyRouteSelector((r) => r.location.pathname)
  const params = useReadonlyRouteSelector((r) => r.params)
  const navigate = getStableRouterNavigate()

  const goHome = () => navigate('/', { replace: true })

  return (
    <div className="text-text">
      <div>Pathname: {pathname}</div>
      <div>Params JSON: {JSON.stringify(params)}</div>
      <button className="btn" onClick={goHome}>Go Home</button>
    </div>
  )
}
```

UI components:

- **Prefer using `@afilmory/ui` components** for all common UI elements:
  - Form elements: `Input`, `Textarea`, `Label`, `FormError`, `FormHelperText`
  - Buttons: `Button`
  - Layout: `ScrollArea`
  - Others: `Checkbox`, `Switch`, `Modal`, `Tooltip`, etc.
- Compose primitives for feature-level components under src/modules/<domain>/.
- Use the Pastel color tokens (e.g., text-text, bg-background, border-border, bg-fill, bg-accent).

UI Component Import Pattern:

```tsx
// ✅ Preferred: Import from @afilmory/ui
import { Input, Label, FormError, Button, ScrollArea } from '@afilmory/ui'

// ❌ Avoid: Manual inline styling for common elements
;<input className="w-full rounded-lg border..." />
```

Example (simple page using primitives):

```
import { Button } from '@afilmory/ui'
import { Divider } from '@afilmory/ui'
import { Tooltip, TooltipContent, TooltipTrigger } from '@afilmory/ui'

export const Component = () => {
  return (
    <section className="px-6 py-10 text-text">
      <h1 className="text-2xl font-semibold">About</h1>
      <p className="mt-2 text-text-secondary">This is a template page.</p>

      <Divider className="my-6" />

      <Tooltip>
        <TooltipTrigger>
          <Button variant="primary">Hover me</Button>
        </TooltipTrigger>
        <TooltipContent>
          <span>Tooltip content</span>
        </TooltipContent>
      </Tooltip>
    </section>
  )
}
```

UI Design Guidelines:

This dashboard follows a **linear design language** with clean lines and subtle gradients. The design emphasizes simplicity and clarity without rounded corners or heavy visual effects.

Core Design Principles:

- **Hierarchical rounding**:
  - Main page containers: Sharp edges with linear gradient borders
  - Interactive elements (inputs, buttons, cards): `rounded-lg` for approachable feel
- **Linear gradient borders**: Use subtle gradient borders for main container separation
- **Minimal backgrounds**: Use solid colors (`bg-background`, `bg-background-tertiary`)
- **Clean typography**: Clear hierarchy with appropriate font sizes
- **Subtle interactions**: Focus rings and hover states with minimal animation

Form Elements (Inputs, Textareas, Selects):

- **Shape**: Use `rounded-lg` for subtle rounded corners (NOT sharp edges, NOT heavy rounding like `rounded-xl`)
- **Background**: Use `bg-background` for standard inputs
- **Border**: Use `border border-fill-tertiary` for default state
- **Padding**: Standard padding is `px-3 py-2` for inputs
- **Text Size**: Use `text-sm` for consistency
- **Text Colors**:
  - Input text: `text-text`
  - Placeholder: `placeholder:text-text-tertiary/70`
  - Labels: `text-text` with `font-medium`
- **Focus State**:
  - Remove default outline: `focus:outline-none`
  - Add focus ring: `focus:ring-2 focus:ring-accent/40`
- **Error State**:
  - Border: `border-red/60`
  - Focus ring: `focus:ring-red/30`
  - Error message: `text-xs text-red` with `mt-1` spacing
- **Transitions**: Use `transition-all duration-200` for smooth interactions

Example (using UI components):

```tsx
import { Input, Label, FormError } from '@afilmory/ui'
;<div className="space-y-2">
  <Label htmlFor="field-id">Field Label</Label>
  <Input id="field-id" type="text" placeholder="Enter value..." error={!!errors.field} />
  <FormError>{errors.field}</FormError>
</div>
```

Example (manual styling):

```tsx
<div>
  <label htmlFor="field-id" className="block text-sm font-medium text-text mb-2">
    Field Label
  </label>
  <input
    id="field-id"
    type="text"
    className={cx(
      'w-full rounded-lg border border-fill-tertiary bg-background',
      'px-3 py-2 text-sm text-text placeholder:text-text-tertiary/70',
      'focus:outline-none focus:ring-2 focus:ring-accent/40',
      'transition-all duration-200',
      hasError && 'border-red/60 focus:ring-red/30',
    )}
    placeholder="Enter value..."
  />
  {error && <p className="mt-1 text-xs text-red">{error}</p>}
</div>
```

Example (textarea using UI components):

```tsx
import { Textarea, Label, FormError } from '@afilmory/ui'
;<div className="space-y-2">
  <Label htmlFor="description">Description</Label>
  <Textarea id="description" rows={3} placeholder="Enter description..." error={!!errors.description} />
  <FormError>{errors.description}</FormError>
</div>
```

Example (manual textarea):

```tsx
<textarea
  className={cx(
    'w-full rounded-lg border border-fill-tertiary bg-background',
    'px-3 py-2 text-sm text-text placeholder:text-text-tertiary/70',
    'focus:outline-none focus:ring-2 focus:ring-accent/40',
    'transition-all duration-200',
  )}
  rows={3}
  placeholder="Enter description..."
/>
```

Buttons:

- **Shape**: Use `rounded-lg` for subtle rounded corners (consistent with form elements)
- **Padding**: Standard is `px-6 py-2.5` for medium buttons
- **Text Size**: Use `text-sm` with `font-medium`
- **Primary Button**:
  - Background: `bg-accent`
  - Text: `text-white`
  - Hover: `hover:bg-accent/90`
  - Focus: `focus:outline-none focus:ring-2 focus:ring-accent/40`
  - Active: `active:scale-[0.98]` for subtle press feedback
- **Secondary/Ghost Button**:
  - Background: `bg-transparent`
  - Text: `text-text-secondary`
  - Hover: `hover:text-text hover:bg-fill/50`
  - **NO borders** for ghost buttons
- **Transitions**: Use `transition-all duration-200`

Example (primary button):

```tsx
<button
  type="submit"
  className={cx(
    'rounded-lg px-6 py-2.5',
    'bg-accent text-white font-medium text-sm',
    'transition-all duration-200',
    'hover:bg-accent/90',
    'active:scale-[0.98]',
    'focus:outline-none focus:ring-2 focus:ring-accent/40',
  )}
>
  Submit
</button>
```

Example (ghost button):

```tsx
<button
  type="button"
  className={cx(
    'rounded-lg px-6 py-2.5',
    'text-sm font-medium text-text-secondary',
    'hover:text-text hover:bg-fill/50',
    'transition-all duration-200',
  )}
>
  Cancel
</button>
```

Cards and Containers:

- **Shape**:
  - **Main page containers** (e.g., OnboardingWizard): **NO rounded corners** - use sharp edges with linear gradient borders
  - **Inner content cards** (e.g., form sections, review cards): Use `rounded-lg` for visual hierarchy
- **Borders**:
  - Main containers: Use linear gradient borders
  - Inner cards: Use `border border-fill-tertiary`
- **Dividers**: Use horizontal gradient dividers for section separation
  - Example: `<div className="h-[0.5px] bg-linear-to-r from-transparent via-text/20 to-transparent" />`
- **Backgrounds**: Use solid colors (`bg-background`, `bg-background-tertiary`)
- **Spacing**: Use consistent padding (e.g., `p-6`, `p-8`, `p-12` depending on size)

Linear Gradient Border Pattern:

```tsx
<div className="relative bg-background-tertiary">
  {/* Top border */}
  <div className="absolute left-0 top-0 right-0 h-[0.5px] bg-linear-to-r from-transparent via-text to-transparent" />

  {/* Right border */}
  <div className="absolute top-0 right-0 bottom-0 w-[0.5px] bg-linear-to-b from-transparent via-text to-transparent" />

  {/* Bottom border */}
  <div className="absolute left-0 bottom-0 right-0 h-[0.5px] bg-linear-to-r from-transparent via-text to-transparent" />

  {/* Left border */}
  <div className="absolute top-0 left-0 bottom-0 w-[0.5px] bg-linear-to-b from-transparent via-text to-transparent" />

  <div className="p-12">{/* Content */}</div>
</div>
```

Fixed Height Container with ScrollArea Pattern:

For pages with fixed-height containers (e.g., full-page modals, wizards), use the three-section layout:

```tsx
import { ScrollArea } from '@afilmory/ui'
;<div className="flex h-[85vh] flex-col">
  {/* Fixed header - won't scroll */}
  <div className="shrink-0">
    <Header />
    <div className="h-[0.5px] bg-linear-to-r from-transparent via-text/20 to-transparent" />
  </div>

  {/* Scrollable content area */}
  <div className="flex-1 overflow-hidden">
    <ScrollArea rootClassName="h-full" viewportClassName="h-full">
      <section className="p-12">{/* Your content here */}</section>
    </ScrollArea>
  </div>

  {/* Fixed footer - won't scroll, always at bottom */}
  <div className="shrink-0">
    <div className="h-[0.5px] bg-linear-to-r from-transparent via-text/20 to-transparent" />
    <Footer />
  </div>
</div>
```

**Key points:**

- Use `flex h-full flex-col` on the parent container
- `shrink-0` on header and footer prevents them from compressing
- `flex-1 overflow-hidden` on scroll container takes remaining space
- `ScrollArea` with `rootClassName="h-full" viewportClassName="h-full"` ensures proper scrolling
- Fixed height (e.g., `h-[85vh]`) on the outermost container

Interactive States:

- **Hover**: Subtle background or color changes with `duration-200` transitions
- **Focus**: Always include focus rings (`focus:ring-2 focus:ring-accent/40`)
- **Active/Press**: Use `active:scale-[0.98]` for tactile feedback on clickable elements
- **Disabled**: Add `opacity-70` and `cursor-default` or `cursor-not-allowed`

Spacing and Layout:

- **Form Fields**: Use `mb-6` between form fields, `mb-8` before submit buttons
- **Grid Layouts**: Use `gap-5` for form grids (e.g., `grid gap-5 md:grid-cols-2`)
- **Sections**: Use `space-y-6` for vertical spacing in forms

Typography:

- **Headings**: Use semantic sizes (e.g., `text-3xl font-bold` for page titles)
- **Body Text**: Default is `text-sm` for forms and UI elements
- **Labels**: `text-sm font-medium text-text`
- **Helper Text**: `text-xs text-text-tertiary` with `mt-2` spacing
- **Error Messages**: `text-xs text-red` with `mt-1` spacing

Do NOT:

- ❌ Use heavy rounding (`rounded-xl`, `rounded-2xl`, `rounded-full`) - use `rounded-lg` for form elements and cards
- ❌ Use sharp edges (no rounding) on form elements - always use `rounded-lg` for inputs, buttons, and cards
- ❌ Mix rounding styles - main page containers are sharp, all interactive elements use `rounded-lg`
- ❌ Use heavy borders or box shadows - use subtle linear gradients instead
- ❌ Use animated bottom borders or underlines on inputs (outdated pattern)
- ❌ Use large padding (`py-3`, `py-4`) on standard inputs - stick to `py-2` or `py-2.5`
- ❌ Use `border-separator` - use `border-fill-tertiary` instead
- ❌ Skip focus states - always include `focus:ring-2 focus:ring-accent/40`
- ❌ Use complex hover effects with gradients - keep it simple with opacity/color changes
- ❌ Mix design patterns - maintain consistency with existing components
- ❌ Add borders to ghost buttons - they should be borderless

Color system:

- Use the Pastel-based semantic tokens:
  - Semantic: text-text, bg-background, border-border
  - Application: bg-accent, bg-primary, text-accent
  - Fill: bg-fill, bg-fill-secondary
  - Material: bg-material-medium, bg-material-opaque
- Respect dark mode and contrast variants; prefer data-contrast attributes when applicable.

File-based routing quickstart:

- Add a synchronous page:
  - Create src/pages/(main)/new-page.sync.tsx -> route /new-page
- Add a lazy page:
  - Create src/pages/(main)/lazy.tsx -> route /lazy (code-split)
- Add a layout:
  - Create src/pages/(main)/settings/layout.tsx including <Outlet />
- The route graph is generated into src/generated-routes.ts; do not edit it manually.

TanStack Query:

- Use a shared QueryClient (~/lib/query-client) via RootProviders.
- Keep query keys structured and co-locate query hooks with modules.

Modal and toast:

- Use Modal from ~/components/ui/modal and sonner Toaster already wired in RootProviders.
- Prefer declarative patterns; use the provided Modal.present helper when needed.

Common agent playbook:

1. Create a new feature module:

- Place domain-specific components under src/modules/<domain>/.
- If it needs a page, create it under src/pages/<segment>/.
- Add routes via file creation; do not modify src/generated-routes.ts.

2. Add state for a feature:

- Create an atom in src/atoms/<feature>.ts.
- Expose hooks via createAtomHooks. Avoid exporting raw atoms unless necessary.

3. Add animated UI:

- Use m._ components with Spring presets. Do not import motion._.

4. Add a provider:

- Edit src/providers/root-providers.tsx to insert it near related providers.
- Ensure it’s side-effect free on import and respects React 19 rules.

5. Navigation and route state:

- Read-only selections via useReadonlyRouteSelector for stable, selective reads.
- Imperative navigation outside components via getStableRouterNavigate.

6. Styling:

- Use Pastel tokens. Avoid raw Tailwind colors unless necessary.

Linting, formatting, and quality:

- Run pnpm lint and pnpm format to conform to eslint-config-hyoban and Prettier.
- Ensure TS passes in builds (pnpm build runs type checks via Vite + TS).

Do not:

- Do not edit auto-generated route files.
- Do not use motion.\* directly.
- Do not bypass providers by re-creating QueryClient or Jotai store; use the shared instances.
- Do not use window.location directly; use routing utilities.
- Do not introduce ad-hoc color tokens that bypass the Pastel system.

Troubleshooting:

- Route not recognized:
  - Check filename suffix (.sync.tsx vs .tsx), directory placement under src/pages/, and that the dev server/plugin picked up changes.
- Animation not working:
  - Verify import { m } from 'motion/react' and applied Spring preset.
- State not updating:
  - Ensure atoms are created via createAtomHooks and read/written through the provided hooks or accessors.

References:

- vite-plugin-route-builder: https://github.com/Innei/vite-plugin-route-builder
- Pastel color system: https://github.com/Innei/Pastel

Change checklist (agents):

- Imports use ~/ alias
- New components placed in correct directory (ui/common/modules)
- Routes added through src/pages/ files only
- m.\* + Spring presets for motion
- Pastel color tokens used
- Atoms created via createAtomHooks; selectors stable
- No edits to auto-generated files
- **UI Design**: Form inputs use `rounded-lg`, `bg-background`, `border-fill-tertiary`, and `focus:ring-2 focus:ring-accent/40`
- **UI Design**: Buttons use `rounded-lg`, `px-6 py-2.5`, `text-sm font-medium`
- **UI Design**: Inner content cards use `rounded-lg` for visual hierarchy
- **UI Design**: Main page containers use linear gradient borders with sharp edges
- **UI Design**: All interactive elements have proper focus states and transitions
- Code passes pnpm lint, pnpm format, and pnpm build
