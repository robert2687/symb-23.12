import React from 'react';
import { AgentTask, Theme } from '../types';

interface Props {
  tasks: AgentTask[];
  theme: Theme;
}

export function TasksView({ tasks, theme }: Props) {
  return (
    <div
      className={`h-full p-4 space-y-3 ${
        theme === 'dark' ? 'bg-[#0e0e11] text-gray-100' : 'bg-white text-gray-900'
      }`}
    >
      <div className="text-xs font-bold uppercase tracking-wide">Tasks</div>
      {tasks.length === 0 && (
        <div className="text-sm text-gray-500">No tasks yet. Send a prompt to create one.</div>
      )}
      {tasks.map((task) => (
        <div
          key={task.id}
          className="p-3 rounded-xl border border-white/5 bg-white/5 flex items-center justify-between"
        >
          <div>
            <div className="text-sm font-semibold">{task.title}</div>
            <div className="text-[11px] uppercase tracking-wide text-gray-400">{task.assignedTo}</div>
          </div>
          <span className="text-[11px] px-2 py-1 rounded-full border border-white/10">
            {task.status}
          </span>
        </div>
      ))}
    </div>
  );
}
