import React from 'react';
import { FileNode, Theme } from '../types';

interface Props {
  file: FileNode | null;
  theme: Theme;
  onToggleZen: () => void;
  zenMode: boolean;
}

export function Preview({ file, theme, onToggleZen, zenMode }: Props) {
  return (
    <div
      className={`h-full flex flex-col ${
        theme === 'dark' ? 'bg-[#0f0f12] text-gray-100' : 'bg-white text-gray-900'
      }`}
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
        <div className="text-xs font-bold uppercase tracking-wide">Preview</div>
        <button
          onClick={onToggleZen}
          className="px-3 py-1.5 rounded-md text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
        >
          {zenMode ? 'Exit Zen' : 'Zen Mode'}
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4 custom-scrollbar">
        {file ? (
          <pre className="whitespace-pre-wrap text-sm leading-relaxed">
            {file.content ?? 'No content yet.'}
          </pre>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-gray-500">
            Select a file to preview its content.
          </div>
        )}
      </div>
    </div>
  );
}
