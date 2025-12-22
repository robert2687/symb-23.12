import React, { useState } from 'react';
import { ChevronDown, ChevronRight, FileCode, Folder } from 'lucide-react';
import { FileNode, Theme } from '../types';

interface Props {
  node: FileNode;
  onSelect: (file: FileNode) => void;
  activeFileName?: string;
  theme: Theme;
}

export function FileTreeItem({ node, onSelect, activeFileName, theme }: Props) {
  const [isOpen, setIsOpen] = useState<boolean>(node.isOpen ?? false);
  const isFolder = node.type === 'folder';

  const toggleOpen = () => {
    if (isFolder) {
      setIsOpen((prev) => !prev);
    } else {
      onSelect(node);
    }
  };

  return (
    <div className="text-sm">
      <button
        onClick={toggleOpen}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
          theme === 'dark'
            ? 'hover:bg-white/5 text-gray-200'
            : 'hover:bg-gray-100 text-gray-700'
        } ${activeFileName === node.name ? 'bg-indigo-500/10 text-indigo-500' : ''}`}
      >
        {isFolder ? (
          <>
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <Folder className="w-4 h-4" />
          </>
        ) : (
          <>
            <span className="w-4 h-4" />
            <FileCode className="w-4 h-4" />
          </>
        )}
        <span className="truncate text-left">{node.name}</span>
      </button>

      {isFolder && isOpen && node.children && (
        <div className="pl-5 border-l border-white/5 space-y-1">
          {node.children.map((child) => (
            <FileTreeItem
              key={child.name}
              node={child}
              onSelect={onSelect}
              activeFileName={activeFileName}
              theme={theme}
            />
          ))}
        </div>
      )}
    </div>
  );
}
