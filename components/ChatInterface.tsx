import React, { useMemo, useState } from 'react';
import { AgentOptions, AgentTask, ChatMessage, TargetAgent, Theme } from '../types';

interface Props {
  messages: ChatMessage[];
  inputValue: string;
  setInputValue: (value: string) => void;
  onSendMessage: (target: TargetAgent, options: AgentOptions) => void;
  isProcessing: boolean;
  tasks: AgentTask[];
  theme: Theme;
  selectedAgent: TargetAgent;
  setSelectedAgent: (agent: TargetAgent) => void;
}

export function ChatInterface({
  messages,
  inputValue,
  setInputValue,
  onSendMessage,
  isProcessing,
  tasks,
  theme,
  selectedAgent,
  setSelectedAgent,
}: Props) {
  const [useSearch, setUseSearch] = useState(false);
  const [useThinking, setUseThinking] = useState(false);
  const quickCommands = [
    'Generate responsive layout with sidebar and top nav',
    'Refine code for accessibility and keyboard navigation',
    'Add localStorage persistence to the current app',
  ];

  const taskSummary = useMemo(() => tasks.filter((t) => t.status === 'active').length, [tasks]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    onSendMessage(selectedAgent, { useSearch, useThinking });
  };

  return (
    <div className={`h-full flex flex-col ${theme === 'dark' ? 'bg-[#0e0e11]' : 'bg-white'}`}>
      <div className="flex items-center justify-between px-4 py-2 text-xs border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="font-bold uppercase tracking-wide">AI Hub</span>
          {taskSummary > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-indigo-500/10 text-indigo-400 font-bold">
              {taskSummary} active
            </span>
          )}
        </div>
        <select
          value={selectedAgent}
          onChange={(e) => setSelectedAgent(e.target.value as TargetAgent)}
          className="text-xs bg-transparent border border-white/10 rounded-md px-2 py-1"
        >
          <option value="team">Team</option>
          <option value="architect">Architect</option>
          <option value="developer">Developer</option>
          <option value="qa">QA</option>
        </select>
      </div>

      <div className="flex-1 overflow-auto space-y-3 p-4 custom-scrollbar">
        {messages.length === 0 && (
          <div className="text-xs text-gray-500">No messages yet. Describe what you want to build or drop a natural language command.</div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`p-3 rounded-xl text-sm border ${
              msg.sender === 'user'
                ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-100'
                : msg.sender === 'agent'
                  ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-100'
                  : 'border-gray-500/30 bg-gray-500/10 text-gray-200'
            }`}
          >
            <div className="text-[10px] uppercase tracking-wide font-bold opacity-70 mb-1">
              {msg.sender === 'agent' ? msg.agentRole ?? 'agent' : msg.sender}
            </div>
            <div className="whitespace-pre-wrap">{msg.text}</div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="p-3 space-y-2 border-t border-white/5">
        <div className="text-[11px] font-bold uppercase tracking-wide text-indigo-400">AI Command</div>
        <div className="flex flex-wrap gap-2">
          {quickCommands.map((cmd) => (
            <button
              type="button"
              key={cmd}
              onClick={() => setInputValue(cmd)}
              className="px-3 py-1.5 rounded-full text-[11px] border border-white/10 bg-white/5 hover:border-indigo-300/60 transition-colors"
            >
              {cmd}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={useSearch}
              onChange={(e) => setUseSearch(e.target.checked)}
              className="rounded"
            />
            Use search
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={useThinking}
              onChange={(e) => setUseThinking(e.target.checked)}
              className="rounded"
            />
            Extended reasoning
          </label>
        </div>
        <div className="flex gap-2">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                handleSubmit(e as unknown as React.FormEvent);
              }
            }}
            placeholder="Describe your app or issue commands for the agents. Press Ctrl/Cmd+Enter to run."
            rows={3}
            className={`flex-1 px-3 py-2 rounded-lg border text-sm outline-none resize-none ${
              theme === 'dark'
                ? 'bg-[#13131a] border-white/10 text-gray-100'
                : 'bg-white border-gray-200 text-gray-900'
            }`}
          />
          <button
            type="submit"
            disabled={isProcessing}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-60"
          >
            {isProcessing ? 'Thinking...' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
