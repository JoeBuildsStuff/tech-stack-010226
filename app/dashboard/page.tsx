export default function Page() {
  return (
    <div className="flex flex-col gap-2 h-full w-full">
      {/* KPI Header Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="h-36 w-full rounded-lg bg-secondary/50" />
        <div className="h-36 w-full rounded-lg bg-secondary/50" />
        <div className="h-36 w-full rounded-lg bg-secondary/50" />
      </div>
      {/* Main Content Skeleton */}
      <div className="flex-1">
        <div className="w-full h-full rounded-xl bg-secondary/50" />
      </div>
    </div>
  );
}
