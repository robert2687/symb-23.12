import { FileNode } from './types';

export const INITIAL_FILES: FileNode[] = [
  {
    name: 'src',
    type: 'folder',
    isOpen: true,
    children: [
      { 
        name: 'App.tsx', 
        type: 'file', 
        language: 'typescript', 
        content: `// App.tsx
import React from "react";

export default function App() {
  return (
    <div className="p-8 text-center bg-gradient-to-br from-slate-50 to-slate-100 h-full">
      <h1 className="text-3xl font-bold text-gray-800 mb-4">Welcome to Symbiotic IDE</h1>
      <p className="text-gray-600 mb-6">Ask the AI to build something cool!</p>
      <button className="px-4 py-2 bg-indigo-600 text-white rounded-md shadow hover:bg-indigo-700 transition">
        Get Started
      </button>
    </div>
  );
}` 
      },
      { 
        name: 'index.css', 
        type: 'file', 
        language: 'css', 
        content: `@tailwind base;
@tailwind components;
@tailwind utilities;` 
      },
    ]
  },
  {
    name: 'package.json',
    type: 'file',
    language: 'json',
    content: `{
  "name": "symbiotic-app",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "lucide-react": "^0.263.1"
  }
}`
  },
  {
    name: 'tsconfig.json',
    type: 'file',
    language: 'json',
    content: `{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true
  },
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}`
  }
];