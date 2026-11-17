export function Mark({ className }: { className?: string }) {
  return <span className={className ? `lp-markimg ${className}` : 'lp-markimg'} aria-hidden="true" />
}
