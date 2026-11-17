import type { CSSProperties } from 'react'

const common = {
  'viewBox': '0 0 160 120',
  'fill': 'none',
  'stroke': 'currentColor',
  'strokeWidth': 1,
  'aria-hidden': true,
} as const

const draw = (i: number) => ({ pathLength: 1, style: { '--i': i } as CSSProperties })

export function ApertureArt() {
  return (
    <svg {...common}>
      <path d="M80 60 L132 60" opacity=".35" {...draw(0)} />
      <path d="M80 60 L106 105.03" opacity=".35" {...draw(1)} />
      <path d="M80 60 L54 105.03" opacity=".35" {...draw(2)} />
      <path d="M80 60 L28 60" opacity=".35" {...draw(3)} />
      <path d="M80 60 L54 14.97" opacity=".35" {...draw(4)} />
      <path d="M80 60 L106 14.97" opacity=".35" {...draw(5)} />
      <circle cx="80" cy="60" r="52" opacity=".5" {...draw(6)} />
      <circle cx="80" cy="60" r="34" {...draw(7)} />
      <circle cx="80" cy="60" r="16" opacity=".6" {...draw(8)} />
      <g className="lp-iris">
        <path d="M94.04 67.67 L85.78 93.51" {...draw(9)} />
        <path d="M80.38 76.00 L53.87 81.76" {...draw(10)} />
        <path d="M66.34 68.32 L48.09 48.25" {...draw(11)} />
        <path d="M65.96 52.33 L74.22 26.49" {...draw(12)} />
        <path d="M79.62 44.00 L106.13 38.24" {...draw(13)} />
        <path d="M93.66 51.68 L111.91 71.75" {...draw(14)} />
      </g>
    </svg>
  )
}

export function FalloffArt() {
  return (
    <svg {...common}>
      <g className="lp-falloff">
        <rect x="28" y="16" width="104" height="88" rx="10" opacity="0.20" {...draw(0)} />
        <rect x="32" y="20" width="96" height="80" rx="9" opacity="0.29" {...draw(1)} />
        <rect x="36" y="24" width="88" height="72" rx="8" opacity="0.38" {...draw(2)} />
        <rect x="40" y="28" width="80" height="64" rx="7" opacity="0.47" {...draw(3)} />
        <rect x="44" y="32" width="72" height="56" rx="6" opacity="0.56" {...draw(4)} />
        <rect x="48" y="36" width="64" height="48" rx="5" opacity="0.65" {...draw(5)} />
        <rect x="52" y="40" width="56" height="40" rx="4" opacity="0.74" {...draw(6)} />
        <rect x="56" y="44" width="48" height="32" rx="3" opacity="0.83" {...draw(7)} />
        <rect x="60" y="48" width="40" height="24" rx="2" opacity="0.92" {...draw(8)} />
      </g>
    </svg>
  )
}

export function DoorsArt() {
  return (
    <svg {...common}>
      <rect className="lp-door-a" x="18" y="24" width="72" height="56" rx="6" opacity=".45" {...draw(0)} />
      <rect className="lp-door-b" x="104" y="18" width="38" height="78" rx="8" {...draw(1)} />
      <rect className="lp-door-c" x="40" y="44" width="72" height="56" rx="6" opacity=".7" {...draw(2)} />
      <path d="M46 92 v-10" opacity=".6" {...draw(3)} />
      <path d="M58 92 v-17" opacity=".6" {...draw(4)} />
      <path d="M70 92 v-24" opacity=".6" {...draw(5)} />
      <path d="M82 92 v-13" opacity=".6" {...draw(6)} />
      <path d="M94 92 v-20" opacity=".6" {...draw(7)} />
    </svg>
  )
}
