import React, { useEffect, useState } from 'react';
import { FileNode, SaveStatus, Theme } from '../types';

interface Props {
  file: FileNode;
  onChange: (value: string) => void;
  theme: Theme;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onSave: () => void;
  saveStatus: SaveStatus;
}

export function Editor({
  file,
  onChange,
  theme,
  onSave,
  saveStatus,
}: Props) {
  const [value, setValue] = useState<string>(file.content ?? '');

  useEffect(() => {
    setValue(file.content ?? '');
  }, [file]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 text-xs border-b border-white/5">
        <div className="flex items-center gap-2 font-mono">
          <span>{file.name}</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold ${
              saveStatus === 'saved'
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'bg-indigo-500/10 text-indigo-400'
            }`}
          >
            {saveStatus}
          </span>
        </div>
        <button
          onClick={onSave}
          className="px-3 py-1.5 rounded-md bg-indigo-600 text-white text-[11px] font-bold hover:bg-indigo-700 transition-colors"
        >
          Save
        </button>
      </div>

      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onChange(e.target.value);
        }}
        className={`flex-1 p-4 font-mono text-sm outline-none resize-none ${
          theme === 'dark'
            ? 'bg-[#0f0f12] text-gray-100 border-none'
            : 'bg-white text-gray-900 border border-gray-200'
        }`}
        spellCheck={false}
      />
    </div>
  );
}
