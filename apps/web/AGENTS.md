# agents.md

This agent file only for under this folder project use.

## Glassmorphic Depth Design System

This application utilizes a sophisticated glassmorphic depth design system for elevated UI components like modals, toasts, and floating panels. This system creates a sense of visual hierarchy through layered transparency and subtle color accents.

### Design Principles

- **Multi-layer Depth**: Create visual depth through stacked transparent layers.
- **Subtle Color Accents**: Use brand colors at very low opacity (5-20%) for borders, glows, and backgrounds.
- **Refined Blur**: Employ heavy backdrop blur (`backdrop-blur-2xl`) for a frosted glass effect.
- **Minimal Shadows**: Combine multiple soft shadows with accent colors for depth perception.
- **Smooth Animations**: Use spring-based presets for all transitions to ensure fluid motion.

### Color Usage

**IMPORTANT**: Prefer Tailwind CSS classes with opacity modifiers (e.g., `/20`) over inline styles for applying colors.

- **Borders**: `border-accent/20`
- **Backgrounds**: `bg-accent/5`, `bg-accent/[0.03]`
- **Text**: `text-accent/80`

Use inline styles with `color-mix()` only for complex gradients or shadows that Tailwind classes do not support.

### Component Structure Example

```tsx
<div
  className="rounded-2xl border border-accent/20 backdrop-blur-2xl"
  style={{
    backgroundImage: "linear-gradient(...)",
    boxShadow: "0 8px 32px color-mix(...)",
  }}
>
  {/* Inner glow and content */}
</div>
```

### Interactive Elements

Prefer CSS-driven hover effects using `data-highlighted` attributes (for Radix UI components) or custom CSS classes over JavaScript event handlers for better performance.
