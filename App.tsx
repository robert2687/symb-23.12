
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Sparkles, 
  FileCode, 
  X, 
  Code, 
  Eye, 
  Zap, 
  ArrowRight,
  Sun,
  Moon,
  Save,
  Bot,
  Check,
  User as UserIcon,
  LogOut,
  Settings as SettingsIcon
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { INITIAL_FILES } from './constants';
import { TEMPLATES } from './templates';
import { FileNode, ChatMessage, AgentTask, Theme, SaveStatus, AgentOptions, TargetAgent, User } from './types';
import { FileTreeItem } from './components/FileTreeItem';
import { Editor } from './components/Editor';
import { Preview } from './components/Preview';
import { ChatInterface } from './components/ChatInterface';
import { TasksView } from './components/TasksView';
import { AuthModal } from './components/AuthModal';
import { SettingsModal } from './components/SettingsModal';
import { GEMINI_KEY_ENV_ORDER } from './envKeys';

const generateId = () => Math.random().toString(36).substr(2, 9);

/**
 * Robustly extracts the FIRST valid balanced JSON object from a string.
 */
const cleanJson = (text: string) => {
  if (!text) return "";
  const firstBrace = text.indexOf('{');
  if (firstBrace === -1) return text;
  
  let stack = 0;
  let inString = false;
  let escaped = false;

  for (let i = firstBrace; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && !escaped) inString = !inString;
    if (!inString) {
      if (char === '{') stack++;
      if (char === '}') {
        stack--;
        if (stack === 0) return text.substring(firstBrace, i + 1);
      }
    }
    escaped = char === '\\' && !escaped;
  }
  const lastBrace = text.lastIndexOf('}');
  if (lastBrace > firstBrace) return text.substring(firstBrace, lastBrace + 1);
  return text;
};

const EXAMPLE_PROMPTS = [
  "Build a modern calculator",
  "Create a kanban board with resizable columns",
  "Design a dark-themed analytics dashboard",
  "Make a SaaS landing page"
];

const PREVIEW_REFRESH_MS = 250;
const PREVIEW_NONCE = 'symbiotic-preview-nonce';
const FAST_MODEL = 'models/gemini-1.5-flash-latest';
const REASONING_MODEL = 'models/gemini-1.5-pro-latest';

const escapeHtml = (input: string) =>
  input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const sanitizeForPrompt = (value: string, maxLen = 6000) => {
  if (!value) return '';
  const cleaned = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').slice(0, maxLen);
  return cleaned;
};

const detectTemplateKey = (request: string): keyof typeof TEMPLATES | null => {
  const lowerRequest = request.toLowerCase();
  if (lowerRequest.includes('kanban')) return 'kanban';
  if (lowerRequest.includes('calculator')) return 'calculator';
  if (lowerRequest.includes('todo')) return 'todo';
  if (lowerRequest.includes('login')) return 'login';
  return null;
};

/** Minimal shape of Gemini error payloads returned by the SDK. */
type GeminiInnerError = { code?: number; message?: string; status?: string };
/** Gemini errors may nest the payload under an `error` key or surface fields at the top level. */
type GeminiErrorPayload = { error?: GeminiInnerError } | GeminiInnerError;

const formatAgentError = (error: unknown) => {
  if (!error) return '';
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null) {
    const structured = error as Partial<GeminiErrorPayload>;
    const nestedCandidate = 'error' in structured && structured.error ? structured.error : structured;
    if (typeof nestedCandidate !== 'object' || nestedCandidate === null) return '';
    const nested = nestedCandidate as GeminiInnerError;
    const message = typeof nested.message === 'string' ? nested.message : '';
    const code = nested.code;
    const status = nested.status;
    const normalized = message ? message.toLowerCase() : '';
    const hasLeakedMessage = normalized.includes('reported as leaked');
    const mentionsApiKey = normalized.includes('api key');
    const isPermissionDeniedStatus = code === 403 && status === 'PERMISSION_DENIED';
    const isLeakedKey = hasLeakedMessage || (isPermissionDeniedStatus && mentionsApiKey);
    const isPermissionDenied = isPermissionDeniedStatus || code === 403 || status === 'PERMISSION_DENIED';
    if (isLeakedKey) {
      return 'Gemini API key was reported as leaked. Generate a new API key in Google AI Studio and update your .env.local file.';
    }
    if (isPermissionDenied) {
      return message || 'Permission denied. Check your Gemini API key configuration.';
    }
    return message || '';
  }
  return '';
};

const extractMarkup = (content: string) => {
  const match = content.match(/return\s*\(([\s\S]*?)\)\s*;?/);
  const normalize = (value: string) => {
    const sanitized = value.replace(/className=/g, 'class=').trim();
    return sanitized || `<pre style="padding:16px;font-family:monospace">${escapeHtml(content)}</pre>`;
  };
  if (match?.[1]) return normalize(match[1]);

  const fragmentMatch = content.match(/return\s*<>\s*([\s\S]*?)\s*<\/>/);
  if (fragmentMatch?.[1]) return normalize(fragmentMatch[1]);

  const jsxStart = content.indexOf('<');
  const jsxEnd = content.lastIndexOf('>');
  if (jsxStart !== -1 && jsxEnd > jsxStart) {
    return normalize(content.slice(jsxStart, jsxEnd + 1));
  }

  return `<pre style="padding:16px;font-family:monospace">${escapeHtml(content)}</pre>`;
};

const analyzeAppState = (content: string) => {
  const snapshot: Record<string, string> = {};
  const matches = [...content.matchAll(/const\s*\[\s*([\w$]+)[^\]]*\]\s*=\s*useState(?:<[^>]+>)?\(([^)]+)\)/g)];
  matches.forEach(([, key, value]) => {
    snapshot[key] = value.trim().replace(/^['"`]|['"`]$/g, '');
  });
  return snapshot;
};

const buildPreviewDocument = (file: FileNode | null, snapshot: Record<string, string>) => {
  if (!file?.content) return '';
  const markup = extractMarkup(file.content);
  const stateJson = JSON.stringify(snapshot || {});
  return `
  <!doctype html>
  <html>
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'nonce-${PREVIEW_NONCE}'; script-src 'self' 'nonce-${PREVIEW_NONCE}'; img-src data: 'self'">
      <style nonce="${PREVIEW_NONCE}">
        body { margin: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0b1021; color: #e2e8f0; }
        .__symbiotic_state { position: fixed; bottom: 12px; right: 12px; background: rgba(15,23,42,0.85); color: #cbd5f5; padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(148,163,184,0.4); font-size: 12px; max-width: 320px; }
        .__symbiotic_state pre { margin: 6px 0 0; white-space: pre-wrap; word-break: break-word; }
      </style>
    </head>
    <body>
      <div id="app">${markup}</div>
      <div class="__symbiotic_state">
        <strong>Persisted state</strong>
        <pre>${escapeHtml(stateJson)}</pre>
      </div>
      <script nonce="${PREVIEW_NONCE}">
        try {
          const saved = localStorage.getItem('symbiotic_app_state_data');
          const fallback = ${stateJson};
          const next = saved ? JSON.parse(saved) : fallback;
          localStorage.setItem('symbiotic_app_state_data', JSON.stringify(next));
          window.__SYMBIOTIC_STATE__ = next;
          window.addEventListener('message', (event) => {
            if (event?.origin && event.origin !== window.location.origin) return;
            if (event?.data?.type === 'symbiotic_state_update') {
              localStorage.setItem('symbiotic_app_state_data', JSON.stringify(event.data.payload));
            }
          });
        } catch (err) {
          console.warn('State hydration failed', err);
        }
      </script>
    </body>
  </html>`;
};

const mergeAppContent = (nodes: FileNode[], persisted?: { filename?: string; content?: string }) => {
  if (!persisted?.content) return nodes;
  return nodes.map(node => {
    if (node.type === 'file') {
      const isAppFile = node.name.toLowerCase().startsWith('app');
      const matchesPersisted = persisted.filename ? node.name.toLowerCase() === persisted.filename.toLowerCase() : isAppFile;
      if (matchesPersisted) {
        return { ...node, content: persisted.content };
      }
      return node;
    }
    if (node.children) {
      return { ...node, children: mergeAppContent(node.children, persisted) };
    }
    return node;
  });
};

const serializeProjectGraph = (nodes: FileNode[]): any[] => {
  return nodes.map(node => ({
    name: node.name,
    type: node.type,
    language: node.language,
    children: node.children ? serializeProjectGraph(node.children) : undefined,
  }));
};

const DEFAULT_DESIGN_LIBRARY = 'shadcn/ui';
const DEFAULT_THEME_TOKENS = JSON.stringify({
  colors: {
    primary: '#6366f1',
    accent: '#22d3ee',
    background: '#0b1021',
    surface: '#111827',
    text: '#e2e8f0'
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24
  },
  typography: {
    fontFamily: 'Inter, system-ui, sans-serif',
    heading: { size: 24, weight: 700 },
    body: { size: 14, weight: 500 }
  },
  radii: {
    sm: 6,
    md: 12,
    lg: 16
  }
}, null, 2);

const EmptyState = ({ onStart, onExampleClick, theme }: { onStart: () => void, onExampleClick: (text: string) => void, theme: Theme }) => (
  <div className={`h-full flex flex-col items-center justify-center text-center p-6 relative overflow-hidden ${theme === 'dark' ? 'bg-[#1e1e2e]' : 'bg-gray-50'}`}>
    <div className={`absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] ${theme === 'dark' ? 'from-indigo-900/20 via-[#1e1e2e] to-[#1e1e2e]' : 'from-indigo-200/40 via-gray-50 to-gray-50'}`} />
    <div className="w-16 h-16 md:w-24 md:h-24 bg-gradient-to-tr from-indigo-500 to-purple-600 rounded-2xl md:rounded-3xl flex items-center justify-center mb-6 md:mb-8 shadow-2xl relative z-10">
      <Zap className="w-8 h-8 md:w-12 md:h-12 text-white fill-white" />
    </div>
    <h1 className={`text-2xl md:text-4xl font-bold mb-3 md:mb-4 relative z-10 tracking-tight ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>What shall we build?</h1>
    <p className={`max-w-md mb-8 md:mb-10 leading-relaxed relative z-10 text-sm md:text-lg ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
      Your AI team is ready. Architect, Developer, and QA are standing by.
    </p>
    
    <button 
      onClick={onStart}
      className={`group relative z-10 inline-flex items-center gap-3 px-6 py-3 md:px-8 md:py-4 rounded-full font-bold hover:scale-105 transition-all shadow-xl mb-8 md:mb-12 ${theme === 'dark' ? 'bg-white text-black' : 'bg-gray-900 text-white'}`}
    >
      <span>Start a New Task</span>
      <ArrowRight className="w-4 h-4 md:w-5 h-5 group-hover:translate-x-1 transition-transform" />
    </button>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl w-full relative z-10">
        {EXAMPLE_PROMPTS.map((prompt, i) => (
           <button 
             key={i}
             onClick={() => onExampleClick(prompt)}
             className={`p-3 md:p-4 rounded-xl text-xs md:text-sm font-medium transition-all text-left border group ${theme === 'dark' ? 'bg-white/5 border-white/5 text-gray-300 hover:bg-white/10' : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300 shadow-sm'}`}
           >
             <span className="group-hover:text-indigo-500 transition-colors">"{prompt}"</span>
            </button>
        ))}
    </div>

    <div className="relative z-10 mt-8 grid grid-cols-1 md:grid-cols-3 gap-3 w-full max-w-3xl">
      {[
        { title: 'Open AI Command Center', hint: 'Chat with agents using natural language', action: onStart },
        { title: 'Preview instantly', hint: 'See the live output of the current file', action: () => onExampleClick('Show me the live preview of the current screen') },
        { title: 'Start from a template', hint: 'Try Kanban, Calculator, Todo, Login', action: () => onExampleClick('Build a Kanban board with resizable columns') },
      ].map((item, idx) => (
        <button
          key={idx}
          onClick={item.action}
          className={`p-4 rounded-xl text-left border shadow-sm transition-all hover:-translate-y-0.5 ${theme === 'dark' ? 'bg-white/5 border-white/10 text-gray-200 hover:border-indigo-400/40' : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-200'}`}
        >
          <div className="text-sm font-bold mb-1">{item.title}</div>
          <p className="text-xs text-gray-400">{item.hint}</p>
        </button>
      ))}
    </div>
  </div>
);

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('symbiotic_theme') as Theme) || 'dark');
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');
  const [rightTab, setRightTab] = useState<'chat' | 'tasks' | 'preview'>('chat');
  const [mobileView, setMobileView] = useState<'files' | 'editor' | 'preview' | 'hub'>('editor');
  
  const [leftWidth, setLeftWidth] = useState(() => Number(localStorage.getItem('symbiotic_left_width')) || 280);
  const [rightWidth, setRightWidth] = useState(() => Number(localStorage.getItem('symbiotic_right_width')) || 400);
  const isResizingLeft = useRef(false);
  const isResizingRight = useRef(false);
  const isResizingBottom = useRef(false);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const [bottomHeight, setBottomHeight] = useState(() => Number(localStorage.getItem('symbiotic_bottom_height')) || 220);

  const [files, setFiles] = useState<FileNode[]>(() => {
    try {
      const saved = localStorage.getItem('symbiotic_files');
      const persistedApp = localStorage.getItem('symbiotic_app_state');
      const parsedPersisted = persistedApp ? JSON.parse(persistedApp) : null;
      const base = saved ? JSON.parse(saved) : INITIAL_FILES;
      return mergeAppContent(base, parsedPersisted);
    } catch (e) {
      console.error("Corrupted local storage for files, resetting to default.", e);
      return INITIAL_FILES;
    }
  });

  const [activeFile, setActiveFile] = useState<FileNode | null>(null);
  const [zenMode, setZenMode] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [history, setHistory] = useState<{content: string, timestamp: number}[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<TargetAgent>('team');
  const [designTokens, setDesignTokens] = useState<string>(DEFAULT_THEME_TOKENS);
  const [designLibrary, setDesignLibrary] = useState<string>(DEFAULT_DESIGN_LIBRARY);
  const [designBrief, setDesignBrief] = useState<string>('');
  const [pendingDeveloperContext, setPendingDeveloperContext] = useState<null | { userRequest: string; architectPlan: string; options: AgentOptions; design: { tokens: string; library: string; brief: string } }>(null);
  const [designerPauseEnabled, setDesignerPauseEnabled] = useState(true);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [livePreviewDoc, setLivePreviewDoc] = useState<string>(() => localStorage.getItem('symbiotic_preview_doc') || '');
  const [previousPreviewDoc, setPreviousPreviewDoc] = useState<string | null>(null);
  const [lastPreviewRun, setLastPreviewRun] = useState<number | null>(() => {
    const saved = localStorage.getItem('symbiotic_preview_time');
    return saved ? Number(saved) : null;
  });
  const [appStateSnapshot, setAppStateSnapshot] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('symbiotic_app_state');
      return saved ? (JSON.parse(saved).snapshot || {}) : {};
    } catch {
      return {};
    }
  });
  const [projectGraph, setProjectGraph] = useState<string>(() => {
    try {
      return JSON.stringify(serializeProjectGraph(files), null, 2);
    } catch {
      return '[]';
    }
  });
  const [lastUserRequest, setLastUserRequest] = useState('');

  // Auth & Settings State
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('symbiotic_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('symbiotic_theme', theme);
    document.body.className = theme === 'dark' ? 'bg-[#09090b]' : 'bg-gray-100';
  }, [theme]);

  const handleAuthenticate = (newUser: User) => {
    setUser(newUser);
    localStorage.setItem('symbiotic_user', JSON.stringify(newUser));
  };

  const handleLogout = () => {
    if (window.confirm('Secure Session Termination: Are you sure you want to sign out? Your current IDE environment state will remain saved locally.')) {
      setUser(null);
      localStorage.removeItem('symbiotic_user');
    }
  };

  const handleUpdateProfile = (updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem('symbiotic_user', JSON.stringify(updatedUser));
  };

  const performSave = useCallback(() => {
    localStorage.setItem('symbiotic_files', JSON.stringify(files));
    if (activeFile) {
      localStorage.setItem('symbiotic_app_state', JSON.stringify({ filename: activeFile.name, snapshot: appStateSnapshot, content: activeFile.content }));
    }
    setSaveStatus('saved');
  }, [files, activeFile, appStateSnapshot]);

  useEffect(() => {
    if (saveStatus === 'saving') {
      const timer = setTimeout(performSave, 1000);
      return () => clearTimeout(timer);
    }
  }, [saveStatus, performSave]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        performSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [performSave]);

  useEffect(() => {
    try {
      setProjectGraph(JSON.stringify(serializeProjectGraph(files), null, 2));
    } catch {
      setProjectGraph('[]');
    }
  }, [files]);

  useEffect(() => {
    if (!designTokens) return;
    setFiles(prev => {
      let updated = false;
      const next = prev.map(node => {
        if (node.type === 'file' && node.name === 'theme.json') {
          updated = true;
          return { ...node, content: designTokens };
        }
        return node;
      });
      if (!updated) {
        next.push({ name: 'theme.json', type: 'file', language: 'json', content: designTokens });
      }
      return next;
    });
  }, [designTokens]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingLeft.current) {
        const newWidth = Math.min(Math.max(e.clientX, 160), 480);
        setLeftWidth(newWidth);
        localStorage.setItem('symbiotic_left_width', String(newWidth));
      } else if (isResizingRight.current) {
        const newWidth = Math.min(Math.max(window.innerWidth - e.clientX, 300), 600);
        setRightWidth(newWidth);
        localStorage.setItem('symbiotic_right_width', String(newWidth));
      } else if (isResizingBottom.current && workspaceRef.current) {
        const rect = workspaceRef.current.getBoundingClientRect();
        const available = rect.bottom - e.clientY;
        const maxHeight = Math.max(160, Math.min(rect.height - 160, 480));
        const nextHeight = Math.min(Math.max(available, 140), maxHeight);
        setBottomHeight(nextHeight);
        localStorage.setItem('symbiotic_bottom_height', String(nextHeight));
      }
    };
    const handleMouseUp = () => {
      isResizingLeft.current = false;
      isResizingRight.current = false;
      isResizingBottom.current = false;
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  const toggleZenMode = () => {
    setZenMode(prev => {
      if (!prev) {
        setActiveTab('preview');
        setMobileView('preview');
      }
      return !prev;
    });
  };

  const refreshLivePreview = useCallback((file?: FileNode | null) => {
    const target = file ?? activeFile;
    if (!target) return;
    const snapshot = analyzeAppState(target.content || '');
    setAppStateSnapshot(snapshot);
    const doc = buildPreviewDocument(target, snapshot);
    setPreviousPreviewDoc(livePreviewDoc || null);
    setLivePreviewDoc(doc);
    const now = Date.now();
    setLastPreviewRun(now);
    localStorage.setItem('symbiotic_preview_doc', doc);
    localStorage.setItem('symbiotic_preview_time', String(now));
    localStorage.setItem('symbiotic_app_state', JSON.stringify({ filename: target.name, snapshot, content: target.content }));
  }, [activeFile]);

  useEffect(() => {
    if (!activeFile) return;
    const timer = setTimeout(() => refreshLivePreview(activeFile), PREVIEW_REFRESH_MS);
    return () => clearTimeout(timer);
  }, [activeFile, activeFile?.content, refreshLivePreview]);

  useEffect(() => {
    if (!activeFile) return;
    localStorage.setItem('symbiotic_app_state', JSON.stringify({ filename: activeFile.name, snapshot: appStateSnapshot, content: activeFile.content }));
  }, [activeFile, appStateSnapshot]);

  const updateFileContent = useCallback((newContent: string) => {
    if (!activeFile) return;
    setHistory(prev => [...prev.slice(0, historyIndex + 1), { content: newContent, timestamp: Date.now() }]);
    setHistoryIndex(prev => prev + 1);
    const updatedFile = { ...activeFile, content: newContent };
    setActiveFile(updatedFile);
    setSaveStatus('saving');
    setFiles(prev => prev.map(f => f.children ? { ...f, children: f.children.map(c => c.name === activeFile.name ? updatedFile : c) } : (f.name === activeFile.name ? updatedFile : f)));
  }, [activeFile, historyIndex]);

  const runCriticStage = async (ai: GoogleGenAI, code: string, design: { tokens: string; library: string; brief: string }, architectPlan: string, userRequest: string) => {
    const criticTaskId = generateId();
    setTasks(prev => [...prev, { id: criticTaskId, title: "Critic Review", status: 'active', assignedTo: 'critic' }]);
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `You are the critic. Compare the generated code with the plan and design tokens. 
Design tokens: ${sanitizeForPrompt(design.tokens)}
Library: ${sanitizeForPrompt(design.library)}
Brief: ${sanitizeForPrompt(design.brief)}
Plan: ${sanitizeForPrompt(architectPlan)}
User request: ${sanitizeForPrompt(userRequest)}
Current preview markup (after run): ${sanitizeForPrompt(livePreviewDoc || '')}
Previous preview markup (before run): ${sanitizeForPrompt(previousPreviewDoc || 'none')}

List visual defects, missing imports, or violations of the no-placeholder rule. Provide a concise summary and a small patch if needed.`,
      config: {
        systemInstruction: "Reviewer. If quality is low, send explicit fixes back to the coder. Keep feedback tight.",
        tools: undefined
      }
    });
    setMessages(prev => [...prev, { id: generateId(), sender: 'agent', agentRole: 'critic', text: response.text || 'Critic review complete.', timestamp: new Date() }]);
    setTasks(prev => prev.map(t => t.id === criticTaskId ? { ...t, status: 'completed' } : t));
  };

  const runDeveloperStage = async (params: { userRequest: string; architectPlan: string; design: { tokens: string; library: string; brief: string }; options: AgentOptions; templateKey: keyof typeof TEMPLATES | null; ai: GoogleGenAI; }) => {
    const { userRequest, architectPlan, design, options, templateKey, ai } = params;
    const taskId = generateId();
    setTasks(prev => [...prev, { id: taskId, title: "Implementation", status: 'active', assignedTo: 'developer' }]);
    
    let generatedCode = "";
    let filename = "Component.tsx";
    let explanation = "Built component.";

    if (templateKey && !options.useThinking && !options.useSearch) {
      const template = TEMPLATES[templateKey];
      generatedCode = template.content;
      filename = template.filename;
    } else {
      const response = await ai.models.generateContent({
        model: options.useThinking ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview',
        contents: `Build a React component using Tailwind and lucide-react. 
Plan: ${architectPlan}. 
Design library: ${sanitizeForPrompt(design.library)}. Theme tokens: ${sanitizeForPrompt(design.tokens)}.
Brief: ${sanitizeForPrompt(design.brief)}
Project graph: ${sanitizeForPrompt(projectGraph)}
Request: ${userRequest}. 

Rules:
- CRITICAL: Do not use placeholder comments like "// ...rest of code". Emit full, working code.
- Verify imports exist in the project graph; if missing, include the module in the same file.
- Prefer atomic components (Logo/Nav/UserMenu) over one massive file. If too large, request to split but still provide working code.
- Use the chosen component library primitives instead of raw CSS.
- Use RAG: cite exact import syntax from documentation (shadcn/ui, Radix UI or Chakra UI).
- If building a Kanban board, implement resizable columns with a drag handle and dnd-kit. Make DragOverlay visually distinct (shadow-2xl, scale-105, border-blue-500).
- Persist design tokens by referencing theme.json when defining styles.
Return ONLY valid JSON.`,
        config: { 
          responseMimeType: "application/json", 
          systemInstruction: "Senior React Developer. You MUST return ONLY a single JSON object. Do not include any text before or after the JSON block. Format: { \"filename\": string, \"content\": string, \"explanation\": string }. CRITICAL: no placeholders or truncated code.",
          thinkingConfig: options.useThinking ? { thinkingBudget: 32768 } : undefined,
          tools: options.useSearch ? [] : undefined
        }
      });
      
      try {
        const rawJson = cleanJson(response.text || "{}");
        const json = JSON.parse(rawJson);
        generatedCode = json.content || "// Error generating code";
        filename = json.filename || "Component.tsx";
        explanation = json.explanation || "Implementation complete.";
      } catch (parseErr) {
        console.error("Failed to parse developer response", parseErr, response.text);
        generatedCode = `// Extraction Error: Failed to parse code output. Check Console.`;
        explanation = "Developer agent encountered a JSON formatting error. I've attempted to recover, but the code block may be partial.";
      }
    }

    const newFile: FileNode = { name: filename, type: 'file', language: 'typescript', content: generatedCode, isNew: true };
    setFiles(prev => {
      const next = [...prev];
      const srcFolder = next.find(f => f.name === 'src' && f.type === 'folder');
      if (srcFolder && srcFolder.children) {
        srcFolder.children = srcFolder.children.filter(f => f.name !== filename);
        srcFolder.children.push(newFile);
      } else {
        next.push(newFile);
      }
      return next;
    });
    setActiveFile(newFile);
    setActiveTab('preview');
    setMobileView('preview');
    setMessages(prev => [...prev, { id: generateId(), sender: 'agent', agentRole: 'developer', text: explanation, timestamp: new Date() }]);
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'completed' } : t));
    await runCriticStage(ai, generatedCode, design, architectPlan, userRequest);
  };

  const handleSendMessage = async (target: TargetAgent, options: AgentOptions) => {
    if (!inputValue.trim() && !options.image) return;
    const apiKey = import.meta.env.RESOLVED_GEMINI_API_KEY;
    if (!apiKey) {
      const keyList = GEMINI_KEY_ENV_ORDER.join(' or ');
      setMessages(prev => [...prev, { id: generateId(), sender: 'system', text: `Missing Gemini API key. Add ${keyList} to your .env.local file.`, timestamp: new Date() }]);
      setIsProcessing(false);
      return;
    }
    const ai = new GoogleGenAI({ apiKey });
    const userMsg: ChatMessage = { 
      id: generateId(), 
      sender: 'user', 
      text: inputValue, 
      timestamp: new Date(), 
      attachment: options.image ? { type: 'image', content: options.image } : undefined 
    };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsProcessing(true);

    const userRequest = sanitizeForPrompt(userMsg.text);
    setLastUserRequest(userRequest);
    const templateKey = detectTemplateKey(userRequest);

    try {
      let shouldPauseForEdit = false;
      let designContext = { tokens: designTokens, library: designLibrary || DEFAULT_DESIGN_LIBRARY, brief: designBrief };
      if (target === 'team' || target === 'designer') {
        const taskId = generateId();
        setTasks(prev => [...prev, { id: taskId, title: "Design System Draft", status: 'active', assignedTo: 'designer' }]);
        const response = await ai.models.generateContent({
          model: options.useThinking ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview',
          contents: `You are the Visual Designer. Study the request and return a JSON with { "library": one of ["shadcn/ui","chakra-ui","radix-ui"], "tokens": { colors, spacing, typography, radii, shadows }, "brief": short guidance on layouts and states }. Do NOT guess raw CSS; pick from the libraries. If possible, base palette on existing preview markup. Request: ${userRequest}
Existing preview doc (acts like a screenshot): ${sanitizeForPrompt(livePreviewDoc || 'not available', 4000)}`,
          config: { 
            responseMimeType: "application/json",
            systemInstruction: "Visual Designer with VLM awareness. First emit a design token theme.json (colors, spacing, typography). Pre-seed with a component library (shadcn/ui default). Enforce atomic components and consistent scales. Never use placeholder text.",
            thinkingConfig: options.useThinking ? { thinkingBudget: 32768 } : undefined,
            tools: options.useSearch ? [] : undefined
          }
        });
        try {
          const rawJson = cleanJson(response.text || "{}");
          const parsed = JSON.parse(rawJson);
          const tokens = typeof parsed.tokens === 'string' ? parsed.tokens : JSON.stringify(parsed.tokens || {}, null, 2);
          const library = parsed.library || DEFAULT_DESIGN_LIBRARY;
          const brief = parsed.brief || 'Use consistent spacing and card system.';
          designContext = { tokens, library, brief };
          setDesignTokens(tokens);
          setDesignLibrary(library);
          setDesignBrief(brief);
          const themeFile: FileNode = { name: 'theme.json', type: 'file', language: 'json', content: tokens };
          setFiles(prev => {
            const next = [...prev];
            const existing = next.find(f => f.name === 'theme.json');
            if (existing && existing.type === 'file') {
              existing.content = tokens;
            } else {
              next.push(themeFile);
            }
            return next;
          });
          setMessages(prev => [...prev, { 
            id: generateId(), 
            sender: 'agent', 
            agentRole: 'designer', 
            text: `Library: ${library}\nBrief: ${brief}\nTokens saved to theme.json`, 
            timestamp: new Date() 
          }]);
        } catch (err) {
          console.error("Designer parse error", err);
        }
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'completed' } : t));
        setPendingDeveloperContext({ userRequest, architectPlan: '', options, design: designContext });
        shouldPauseForEdit = designerPauseEnabled && target !== 'designer';
      }

      let architectPlan = "";
      if (target === 'team' || target === 'architect') {
        const taskId = generateId();
        setTasks(prev => [...prev, { id: taskId, title: "Architecture Planning", status: 'active', assignedTo: 'architect' }]);
        const response = await ai.models.generateContent({
          model: options.useThinking ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview',
          contents: `User request: ${userRequest}
Design brief: ${sanitizeForPrompt(designContext.brief)}
Theme tokens: ${sanitizeForPrompt(designContext.tokens)}
Project graph (existing files): ${sanitizeForPrompt(projectGraph)}

Plan small, atomic components (Logo.tsx, NavLinks.tsx, UserMenu.tsx etc.) and ensure imports reference existing paths.`,
          model: options.useThinking ? REASONING_MODEL : FAST_MODEL,
          contents: userRequest,
          config: { 
            systemInstruction: "Senior Software Architect. Maintain a live JSON tree of files and only reference existing imports. Enforce component decomposition and describe how Coder will use the theme.json tokens and the selected component library. Avoid placeholders.",
            thinkingConfig: options.useThinking ? { thinkingBudget: 32768 } : undefined,
            tools: options.useSearch ? [] : undefined
          }
        });
        architectPlan = response.text || "";
        const grounding = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((c: any) => ({
          title: c.web?.title || "Source",
          uri: c.web?.uri || "#"
        })) || [];

        setMessages(prev => [...prev, { 
          id: generateId(), 
          sender: 'agent', 
          agentRole: 'architect', 
          text: architectPlan, 
          timestamp: new Date(),
          groundingUrls: grounding.length > 0 ? grounding : undefined
        }]);
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'completed' } : t));
        setPendingDeveloperContext(prev => prev ? { ...prev, architectPlan } : prev);
      }

      if (shouldPauseForEdit) {
        setIsProcessing(false);
        return;
      }
      if (target === 'team' || target === 'developer') {
        const taskId = generateId();
        setTasks(prev => [...prev, { id: taskId, title: "Implementation", status: 'active', assignedTo: 'developer' }]);
        
        let generatedCode = "";
        let filename = "Component.tsx";
        let explanation = "Built component.";

        if (templateKey && !options.useThinking && !options.useSearch) {
          const template = TEMPLATES[templateKey];
          generatedCode = template.content;
          filename = template.filename;
        } else {
          const response = await ai.models.generateContent({
            model: options.useThinking ? REASONING_MODEL : FAST_MODEL,
            contents: `Build a React component using Tailwind and lucide-react. 
            Plan: ${architectPlan}. 
            Request: ${userRequest}. 
            
            IMPORTANT: If building a Kanban board, you MUST implement resizable columns using a drag handle and local state. Use dnd-kit for drag and drop.
            Styling: The DragOverlay MUST be visually distinct (shadow-2xl, scale-105, border-blue-500). Use a dark 'slate' palette for modern IDE-like feel.
            
            Return ONLY valid JSON.`,
            config: { 
              responseMimeType: "application/json", 
              systemInstruction: "Senior React Developer. You MUST return ONLY a single JSON object. Do not include any text before or after the JSON block. Format: { \"filename\": string, \"content\": string, \"explanation\": string }",
              thinkingConfig: options.useThinking ? { thinkingBudget: 32768 } : undefined,
              tools: options.useSearch ? [{ googleSearch: {} }] : undefined
            }
          });
          
          try {
            const rawJson = cleanJson(response.text || "{}");
            const json = JSON.parse(rawJson);
            generatedCode = json.content || "// Error generating code";
            filename = json.filename || "Component.tsx";
            explanation = json.explanation || "Implementation complete.";
          } catch (parseErr) {
            console.error("Failed to parse developer response", parseErr, response.text);
            generatedCode = `// Extraction Error: Failed to parse code output. Check Console.`;
            explanation = "Developer agent encountered a JSON formatting error. I've attempted to recover, but the code block may be partial.";
          }
        }
      }

      if (target === 'team' || target === 'developer') {
        const designForDev = pendingDeveloperContext?.design || designContext;
        const architectForDev = pendingDeveloperContext?.architectPlan || architectPlan;
        await runDeveloperStage({ userRequest, architectPlan: architectForDev, design: designForDev, options, templateKey, ai });
        setPendingDeveloperContext(null);
      }
    } catch (e) {
      console.error(e);
      const detail = formatAgentError(e);
      const errorMessage = detail ? `Error connecting to agents: ${detail}` : "Error connecting to agents. Mission aborted.";
      setMessages(prev => [...prev, { id: generateId(), sender: 'system', text: `${errorMessage} Please verify your Gemini API key and network access.`, timestamp: new Date() }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const resumeDeveloperFromDesign = async () => {
    if (!pendingDeveloperContext) return;
    const apiKey = import.meta.env.RESOLVED_GEMINI_API_KEY;
    if (!apiKey) {
      const keyList = GEMINI_KEY_ENV_ORDER.join(' or ');
      setMessages(prev => [...prev, { id: generateId(), sender: 'system', text: `Missing Gemini API key. Add ${keyList} to your .env.local file.`, timestamp: new Date() }]);
      return;
    }
    setIsProcessing(true);
    const ai = new GoogleGenAI({ apiKey });
    const context = pendingDeveloperContext;
    await runDeveloperStage({ 
      userRequest: context.userRequest, 
      architectPlan: context.architectPlan, 
      design: { ...context.design, tokens: designTokens || context.design.tokens }, 
      options: context.options, 
      templateKey: detectTemplateKey(context.userRequest), 
      ai 
    });
    setPendingDeveloperContext(null);
    setIsProcessing(false);
  };

  const handleExampleClick = (text: string) => {
    setInputValue(text);
    setMobileView('hub');
  };

  const NavItem = ({ id, icon: Icon, label }: { id: any, icon: any, label: string }) => (
    <button 
      onClick={() => setMobileView(id)}
      className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-all ${mobileView === id ? 'text-indigo-500' : 'text-gray-500'}`}
    >
      <Icon className={`w-5 h-5 ${mobileView === id ? 'stroke-[2.5px]' : 'stroke-[1.5px]'}`} />
      <span className="text-[10px] font-bold uppercase tracking-tighter">{label}</span>
    </button>
  );

  return (
    <div className={`flex h-screen w-full font-sans overflow-hidden transition-colors duration-300 ${theme === 'dark' ? 'bg-[#09090b] text-gray-100' : 'bg-gray-100 text-gray-900'}`}>
      <div 
        style={{ width: sidebarOpen ? `${leftWidth}px` : '64px' }}
        className={`hidden md:flex ${theme === 'dark' ? 'bg-[#0e0e11] border-white/10' : 'bg-white border-gray-200'} border-r flex-col transition-all shrink-0 relative group/sidebar`}
      >
        <div className="h-14 flex items-center px-4 border-b border-white/5 gap-3 shrink-0">
          <Sparkles className="w-5 h-5 text-indigo-500 cursor-pointer" onClick={() => setActiveFile(null)} />
          {sidebarOpen && <span className="font-bold">Symbiotic</span>}
        </div>
        
        <div className="flex-1 overflow-auto py-4">
          {sidebarOpen && files.map(node => (
            <FileTreeItem key={node.name} node={node} onSelect={setActiveFile} activeFileName={activeFile?.name} theme={theme} />
          ))}
        </div>

        {/* Sidebar Footer: User & Settings */}
        <div className="p-3 border-t border-white/5 space-y-2 shrink-0">
          {user ? (
            <div className={`p-2 rounded-xl border flex items-center gap-3 group/user transition-all ${theme === 'dark' ? 'bg-white/5 border-white/5' : 'bg-gray-50 border-gray-200 shadow-sm'}`}>
              <img src={user.avatar} className="w-8 h-8 rounded-lg shadow-sm" alt="Avatar" />
              {sidebarOpen && (
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold truncate tracking-tight">{user.name}</p>
                  <p className="text-[9px] text-gray-500 truncate">{user.email}</p>
                </div>
              )}
              {sidebarOpen && (
                <button 
                  onClick={handleLogout} 
                  title="Secure Logout"
                  className="opacity-0 group-hover/user:opacity-100 p-1.5 hover:text-red-400 transition-all hover:bg-red-400/10 rounded-lg"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            <button 
              onClick={() => setIsAuthModalOpen(true)}
              className={`w-full flex items-center gap-3 p-2 rounded-xl border font-bold text-xs transition-all ${
                theme === 'dark' ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20' : 'bg-indigo-50 border-indigo-100 text-indigo-600 hover:bg-indigo-100 shadow-sm'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${theme === 'dark' ? 'bg-indigo-500/20' : 'bg-indigo-500 text-white'}`}>
                <UserIcon className="w-4 h-4" />
              </div>
              {sidebarOpen && <span>Authorize Session</span>}
            </button>
          )}

          <div className="flex items-center gap-1">
            <button onClick={toggleTheme} className="flex-1 flex items-center justify-center p-2 rounded-md hover:bg-white/5 transition-colors">
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button 
              onClick={() => setIsSettingsModalOpen(true)}
              className="flex-1 flex items-center justify-center p-2 rounded-md hover:bg-white/5 transition-colors"
            >
              <SettingsIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {sidebarOpen && (
          <div 
            onMouseDown={() => { isResizingLeft.current = true; document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; }}
            className="absolute top-0 -right-1 w-2 h-full cursor-col-resize z-20 group"
          >
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-transparent group-hover:bg-indigo-500/50 group-active:bg-indigo-500 transition-colors" />
          </div>
        )}
      </div>

      <div className={`md:hidden fixed bottom-0 left-0 right-0 h-16 border-t z-50 flex items-center justify-around backdrop-blur-xl ${theme === 'dark' ? 'bg-[#0e0e11]/80 border-white/10' : 'bg-white/80 border-gray-200'}`}>
        <NavItem id="files" icon={FileCode} label="Files" />
        <NavItem id="editor" icon={Code} label="Code" />
        <NavItem id="preview" icon={Eye} label="Preview" />
        <NavItem id="hub" icon={Bot} label="AI Hub" />
      </div>

      <div className={`flex-1 flex flex-col min-w-0 pb-16 md:pb-0 ${theme === 'dark' ? 'bg-[#1e1e2e]' : 'bg-[#f8fafc]'}`}>
        <div className="md:hidden h-12 flex items-center justify-between px-4 border-b border-white/5 shrink-0">
          <span className="text-xs font-bold truncate max-w-[200px]">{activeFile?.name || "Symbiotic IDE"}</span>
          <div className="flex items-center gap-2">
             {saveStatus === 'saving' && <Zap className="w-3 h-3 text-yellow-500 animate-pulse" />}
             {user ? (
               <button onClick={() => setIsSettingsModalOpen(true)} className="w-7 h-7 rounded-full overflow-hidden border border-indigo-500/50 shadow-sm ring-2 ring-indigo-500/10">
                 <img src={user.avatar} className="w-full h-full object-cover" alt="User" />
               </button>
             ) : (
               <button onClick={() => setIsAuthModalOpen(true)} className="p-1.5 hover:text-indigo-500 transition-colors"><UserIcon className="w-4 h-4" /></button>
             )}
          </div>
        </div>

        <div className="hidden md:flex h-14 border-b border-white/10 items-center justify-between px-4 shrink-0 bg-[#09090b]">
          <div className="flex items-center gap-2">
            {activeFile && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-t-lg text-xs font-medium border-t-2 border-indigo-500 bg-[#1e1e2e]">
                <FileCode className="w-3.5 h-3.5 text-indigo-400" />
                <span className="truncate max-w-[150px]">{activeFile.name}</span>
                <X className="w-3 h-3 cursor-pointer" onClick={() => setActiveFile(null)} />
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            {activeFile && (
              <div className="flex items-center gap-2">
                <button 
                  onClick={performSave}
                  title="Save (Ctrl+S)"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${saveStatus === 'saved' ? 'text-emerald-500 bg-emerald-500/10' : 'text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20'}`}
                >
                  {saveStatus === 'saved' ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                  {saveStatus === 'saved' ? 'Saved' : 'Save'}
                </button>
                <button
                  onClick={() => { refreshLivePreview(activeFile); setActiveTab('preview'); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-all"
                >
                  <Zap className="w-3.5 h-3.5" />
                  Run Preview
                </button>
                <div className="flex p-1 bg-[#18181b] rounded-lg border border-white/10">
                  <button onClick={() => setActiveTab('editor')} className={`px-3 py-1.5 rounded-md text-xs font-medium ${activeTab === 'editor' ? 'bg-[#27272a] text-white' : 'text-gray-500'}`}>Editor</button>
                  <button onClick={() => setActiveTab('preview')} className={`px-3 py-1.5 rounded-md text-xs font-medium ${activeTab === 'preview' ? 'bg-[#27272a] text-white' : 'text-gray-500'}`}>Preview</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 relative overflow-hidden">
          <div ref={workspaceRef} className="hidden md:flex h-full">
            <div className="flex flex-col w-full h-full">
              <div style={{ height: `calc(100% - ${bottomHeight}px)` }} className="relative">
                {!activeFile ? <EmptyState onStart={() => setRightTab('chat')} onExampleClick={handleExampleClick} theme={theme} /> : 
                  activeTab === 'editor' ? <Editor file={activeFile} onChange={updateFileContent} theme={theme} onUndo={() => {}} onRedo={() => {}} canUndo={false} canRedo={false} onSave={performSave} saveStatus={saveStatus} /> :
                  <Preview file={activeFile} theme={theme} onToggleZen={toggleZenMode} zenMode={zenMode} srcDoc={livePreviewDoc} beforeDoc={previousPreviewDoc} onRunPreview={() => refreshLivePreview(activeFile)} lastRun={lastPreviewRun} stateSnapshot={appStateSnapshot} />}
              </div>
              <div style={{ height: `${bottomHeight}px` }} className={`relative border-t ${theme === 'dark' ? 'border-white/10 bg-[#0b0b12]' : 'border-gray-200 bg-gray-50'} overflow-hidden`}>
                <div 
                  onMouseDown={() => { isResizingBottom.current = true; document.body.style.cursor = 'row-resize'; document.body.style.userSelect = 'none'; }} 
                  className="absolute -top-1 left-0 right-0 h-2 cursor-row-resize z-20 group"
                >
                  <div className="absolute left-1/2 -translate-x-1/2 w-24 h-[2px] bg-transparent group-hover:bg-indigo-400/60 transition-colors" />
                </div>
                <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
                  <div className="text-xs font-bold uppercase tracking-wide flex items-center gap-2">
                    Simulation Monitor
                    {isProcessing && <span className="text-amber-400 text-[10px]">Agents running...</span>}
                  </div>
                  <button 
                    onClick={() => { refreshLivePreview(activeFile); setActiveTab('preview'); }}
                    className="text-[11px] px-3 py-1 rounded-md bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all"
                  >
                    Run Preview
                  </button>
                </div>
                <div style={{ height: 'calc(100% - 42px)' }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-3 overflow-auto custom-scrollbar">
                  <div className={`p-3 rounded-xl border ${theme === 'dark' ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-white'}`}>
                    <div className="text-[11px] uppercase font-bold text-indigo-400 mb-2">Recent Messages</div>
                    <div className="space-y-2 max-h-40 overflow-auto custom-scrollbar">
                      {messages.slice(-4).reverse().map(msg => (
                        <div key={msg.id} className="text-xs leading-relaxed">
                          <span className="font-semibold text-indigo-300">{msg.sender}</span>: <span className="text-gray-300">{msg.text}</span>
                        </div>
                      ))}
                      {messages.length === 0 && <div className="text-xs text-gray-500">Agents are idle. Send a command from the AI Hub.</div>}
                    </div>
                  </div>
                   <div className={`p-3 rounded-xl border ${theme === 'dark' ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-white'}`}>
                     <div className="text-[11px] uppercase font-bold text-indigo-400 mb-2">Tasks</div>
                     <div className="space-y-2 max-h-40 overflow-auto custom-scrollbar">
                       {tasks.length === 0 && <div className="text-xs text-gray-500">No active tasks yet.</div>}
                       {tasks.map(task => (
                        <div key={task.id} className="flex items-center justify-between text-xs">
                          <div className="font-semibold">{task.title}</div>
                          <span className="px-2 py-0.5 rounded-full border border-white/10">{task.status}</span>
                        </div>
                       ))}
                     </div>
                   </div>
                  <div className={`p-3 rounded-xl border ${theme === 'dark' ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-white'}`}>
                    <div className="text-[11px] uppercase font-bold text-indigo-400 mb-2">Design System &amp; Hand-off</div>
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">Library</span>
                        <span className="px-2 py-0.5 rounded-full border border-white/10">{designLibrary || DEFAULT_DESIGN_LIBRARY}</span>
                      </div>
                      <label className="text-[11px] font-semibold text-gray-400">theme.json</label>
                      <textarea
                        value={designTokens}
                        onChange={(e) => setDesignTokens(e.target.value)}
                        className={`w-full h-24 rounded-md border text-[11px] p-2 ${theme === 'dark' ? 'bg-[#0e0e11] border-white/10 text-gray-100' : 'bg-white border-gray-200 text-gray-900'}`}
                      />
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setDesignerPauseEnabled(prev => !prev)}
                          className={`flex-1 px-3 py-2 rounded-md font-bold ${designerPauseEnabled ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40' : 'bg-emerald-600 text-white'}`}
                        >
                          {designerPauseEnabled ? 'Pause & Edit Enabled' : 'Auto-send to Coder'}
                        </button>
                        <button
                          type="button"
                          disabled={!pendingDeveloperContext || isProcessing}
                          onClick={resumeDeveloperFromDesign}
                          className="flex-1 px-3 py-2 rounded-md font-bold bg-indigo-600 text-white disabled:opacity-50"
                        >
                          Send to Coder
                        </button>
                      </div>
                      {pendingDeveloperContext && (
                        <div className="text-[11px] text-gray-400">
                          Awaiting hand-off for request: <span className="font-semibold text-indigo-300">{pendingDeveloperContext.userRequest}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="md:hidden h-full">
            {mobileView === 'files' && <div className="p-4 space-y-4"><h2 className="text-lg font-bold">Project Explorer</h2>{files.map(node => <FileTreeItem key={node.name} node={node} onSelect={(f) => { setActiveFile(f); setMobileView('editor'); }} activeFileName={activeFile?.name} theme={theme} />)}</div>}
            {mobileView === 'editor' && (activeFile ? <Editor file={activeFile} onChange={updateFileContent} theme={theme} onUndo={() => {}} onRedo={() => {}} canUndo={false} canRedo={false} onSave={performSave} saveStatus={saveStatus} /> : <EmptyState onStart={() => setMobileView('hub')} onExampleClick={handleExampleClick} theme={theme} />)}
             {mobileView === 'preview' && <Preview file={activeFile} theme={theme} onToggleZen={toggleZenMode} zenMode={zenMode} srcDoc={livePreviewDoc} beforeDoc={previousPreviewDoc} onRunPreview={() => refreshLivePreview(activeFile)} lastRun={lastPreviewRun} stateSnapshot={appStateSnapshot} />}
            {mobileView === 'hub' && (
              <div className="h-full flex flex-col">
                <div className="flex h-10 border-b border-white/5">
                  <button onClick={() => setRightTab('chat')} className={`flex-1 text-[10px] font-bold uppercase tracking-wider ${rightTab === 'chat' ? 'text-indigo-400 bg-white/5' : 'text-gray-500'}`}>Chat</button>
                  <button onClick={() => setRightTab('tasks')} className={`flex-1 text-[10px] font-bold uppercase tracking-wider ${rightTab === 'tasks' ? 'text-indigo-400 bg-white/5' : 'text-gray-500'}`}>Tasks</button>
                  <button onClick={() => setRightTab('preview')} className={`flex-1 text-[10px] font-bold uppercase tracking-wider ${rightTab === 'preview' ? 'text-indigo-400 bg-white/5' : 'text-gray-500'}`}>Preview</button>
                </div>
                 {rightTab === 'chat' && <ChatInterface messages={messages} inputValue={inputValue} setInputValue={setInputValue} onSendMessage={handleSendMessage} isProcessing={isProcessing} tasks={tasks} theme={theme} selectedAgent={selectedAgent} setSelectedAgent={setSelectedAgent} />}
                 {rightTab === 'tasks' && <TasksView tasks={tasks} theme={theme} />}
                 {rightTab === 'preview' && <Preview file={activeFile} theme={theme} onToggleZen={toggleZenMode} zenMode={zenMode} srcDoc={livePreviewDoc} beforeDoc={previousPreviewDoc} onRunPreview={() => refreshLivePreview(activeFile)} lastRun={lastPreviewRun} stateSnapshot={appStateSnapshot} />}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ width: `${rightWidth}px` }} className={`hidden md:flex border-l ${theme === 'dark' ? 'bg-[#111116] border-white/10' : 'bg-white border-gray-200'} flex-col shrink-0 relative group/aihub`}>
        <div onMouseDown={() => { isResizingRight.current = true; document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; }} className="absolute top-0 -left-1 w-2 h-full cursor-col-resize z-20 group">
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-transparent group-hover:bg-indigo-500/50 group-active:bg-indigo-500 transition-colors" />
        </div>
        <div className="h-12 flex border-b border-white/5 shrink-0">
          <button onClick={() => setRightTab('chat')} className={`flex-1 text-xs font-bold ${rightTab === 'chat' ? 'text-indigo-500' : 'text-gray-500'}`}>Chat</button>
          <button onClick={() => setRightTab('tasks')} className={`flex-1 text-xs font-bold ${rightTab === 'tasks' ? 'text-indigo-500' : 'text-gray-500'}`}>Tasks</button>
          <button onClick={() => setRightTab('preview')} className={`flex-1 text-xs font-bold ${rightTab === 'preview' ? 'text-indigo-500' : 'text-gray-500'}`}>Preview</button>
        </div>
        <div className="flex-1 relative overflow-hidden">
          {rightTab === 'chat' && <ChatInterface messages={messages} inputValue={inputValue} setInputValue={setInputValue} onSendMessage={handleSendMessage} isProcessing={isProcessing} tasks={tasks} theme={theme} selectedAgent={selectedAgent} setSelectedAgent={setSelectedAgent} />}
          {rightTab === 'tasks' && <TasksView tasks={tasks} theme={theme} />}
          {rightTab === 'preview' && <Preview file={activeFile} theme={theme} onToggleZen={toggleZenMode} zenMode={zenMode} srcDoc={livePreviewDoc} beforeDoc={previousPreviewDoc} onRunPreview={() => refreshLivePreview(activeFile)} lastRun={lastPreviewRun} stateSnapshot={appStateSnapshot} />}
        </div>
      </div>

      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
        onAuthenticate={handleAuthenticate}
        theme={theme}
      />

      <SettingsModal 
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        user={user}
        onUpdateProfile={handleUpdateProfile}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    </div>
  );
}
