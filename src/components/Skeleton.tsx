interface SkeletonProps {
  className?: string
}

/** Shimmer placeholder. Sizing comes from the caller. */
export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div className={`shimmer ${className}`} aria-hidden>
      <div className="shimmer-anim" />
    </div>
  )
}
