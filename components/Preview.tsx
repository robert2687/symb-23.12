import React, { useMemo } from 'react';
import { FileNode, Theme } from '../types';

interface Props {
  file: FileNode | null;
  theme: Theme;
  onToggleZen: () => void;
  zenMode: boolean;
  srcDoc?: string;
  beforeDoc?: string | null;
  onRunPreview?: () => void;
  lastRun?: number | null;
  stateSnapshot?: Record<string, string>;
}

export function Preview({ file, theme, onToggleZen, zenMode, srcDoc, beforeDoc, onRunPreview, lastRun, stateSnapshot = {} }: Props) {
  const entries = useMemo(() => Object.entries(stateSnapshot), [stateSnapshot]);
  const timestamp = lastRun ? new Date(lastRun).toLocaleTimeString() : null;

  return (
    <div
      className={`h-full flex flex-col ${
        theme === 'dark' ? 'bg-[#0f0f12] text-gray-100' : 'bg-white text-gray-900'
      }`}
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 gap-3">
        <div className="text-xs font-bold uppercase tracking-wide flex items-center gap-2">
          <span>Live Preview</span>
          {timestamp && <span className="text-[10px] font-medium text-gray-400">Updated {timestamp}</span>}
        </div>
        <div className="flex items-center gap-2">
          {onRunPreview && (
            <button
              onClick={onRunPreview}
              className="px-3 py-1.5 rounded-md text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
            >
              Run Preview
            </button>
          )}
          <button
            onClick={onToggleZen}
            className="px-3 py-1.5 rounded-md text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            {zenMode ? 'Exit Zen' : 'Zen Mode'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {beforeDoc ? (
          <div className="h-full grid grid-cols-1 md:grid-cols-2 gap-2 p-2">
            <div className="flex flex-col h-full border border-white/10 rounded-lg overflow-hidden">
              <div className="px-3 py-1.5 text-[11px] uppercase tracking-wide font-bold bg-white/5">Before</div>
              <iframe
                key={`before-${lastRun}`}
                srcDoc={beforeDoc}
                sandbox="allow-scripts"
                title="Previous preview"
                className="w-full h-full border-0"
              />
            </div>
            <div className="flex flex-col h-full border border-emerald-500/30 rounded-lg overflow-hidden">
              <div className="px-3 py-1.5 text-[11px] uppercase tracking-wide font-bold bg-emerald-500/10 text-emerald-200">After</div>
              {srcDoc ? (
                <iframe
                  key={lastRun ?? srcDoc}
                  srcDoc={srcDoc}
                  sandbox="allow-scripts"
                  title="Live preview"
                  className="w-full h-full border-0"
                />
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-gray-500 p-4 text-center">
                  {file ? 'Preparing live preview...' : 'Select a file to preview its content.'}
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {srcDoc ? (
              <iframe
                key={lastRun ?? srcDoc}
                srcDoc={srcDoc}
                sandbox="allow-scripts"
                title="Live preview"
                className="w-full h-full border-0"
              />
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-gray-500 p-4 text-center">
                {file ? 'Preparing live preview...' : 'Select a file to preview its content.'}
              </div>
            )}
          </>
        )}

        {entries.length > 0 && (
          <div
            className="absolute bottom-4 right-4 bg-black/60 text-xs p-3 rounded-xl border border-white/10 max-w-xs backdrop-blur"
            role="status"
            aria-live="polite"
            aria-label="Persisted application state"
          >
            <div className="font-bold text-[11px] uppercase tracking-wide mb-1 text-indigo-200">App State (persisted)</div>
            <div className="space-y-1 max-h-32 overflow-auto pr-1 custom-scrollbar">
              {entries.map(([key, value]) => (
                <div key={key} className="flex items-start gap-2">
                  <span className="text-indigo-300 font-mono">{key}</span>
                  <span className="text-gray-200 break-words">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
