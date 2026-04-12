import type { Agent } from '@/types/kiro';

interface AgentCardProps {
  agent: Agent;
  onClick: (agentId: string) => void;
  loading?: boolean;
  error?: Error | null;
}

function CloudIcon() {
  return (
    <span className="text-3xl" role="img" aria-label="cloud">
      ☁️
    </span>
  );
}

export function AgentCard({ agent, onClick, loading = false, error = null }: AgentCardProps) {
  if (loading) {
    return (
      <div className="w-full bg-white dark:bg-gray-800 rounded-2xl shadow p-4 flex items-center gap-4 animate-pulse">
        <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-3 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full bg-red-50 dark:bg-red-900/20 rounded-2xl shadow p-4 flex items-center gap-3">
        <span>⚠️</span>
        <p className="text-sm text-red-600 dark:text-red-400">
          {error.message || 'Failed to load agent'}
        </p>
      </div>
    );
  }

  return (
    <button
      onClick={() => onClick(agent.id)}
      className="w-full text-left bg-white dark:bg-gray-800 rounded-2xl shadow hover:shadow-md transition-shadow p-4 flex items-center gap-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
        {agent.avatar_url ? (
          <img src={agent.avatar_url} alt={agent.name} className="w-full h-full object-cover" />
        ) : (
          <CloudIcon />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 dark:text-white truncate">{agent.name}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{agent.role}</p>
      </div>
      {agent.status === 'active' && (
        <span className="w-3 h-3 rounded-full bg-green-500 flex-shrink-0" />
      )}
    </button>
  );
}

export default AgentCard;
