/** A placeholder block shaped like the content that will load. */
export function Skeleton({ width = "100%", height = 14, radius = 6, className }: { width?: number | string; height?: number | string; radius?: number; className?: string }) {
  return <span className={["ui-skeleton", className].filter(Boolean).join(" ")} style={{ width, height, borderRadius: radius }} aria-hidden="true" />;
}

/** Several lines of skeleton text, the last one shorter. */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <span className="ui-skeleton-text" role="status" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? "60%" : "100%"} />
      ))}
    </span>
  );
}
