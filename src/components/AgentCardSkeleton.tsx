export function AgentCardSkeleton() {
  return (
    <div className="w-full bg-white dark:bg-gray-800 rounded-2xl shadow p-4 flex items-center gap-4 animate-pulse">
      <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-3 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
      <div className="w-3 h-3 rounded-full bg-gray-200 dark:bg-gray-700" />
    </div>
  );
}

export default AgentCardSkeleton;
