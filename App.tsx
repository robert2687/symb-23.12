
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
  </div>
);

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('symbiotic_theme') as Theme) || 'dark');
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');
  const [rightTab, setRightTab] = useState<'chat' | 'tasks'>('chat');
  const [mobileView, setMobileView] = useState<'files' | 'editor' | 'preview' | 'hub'>('editor');
  
  const [leftWidth, setLeftWidth] = useState(() => Number(localStorage.getItem('symbiotic_left_width')) || 280);
  const [rightWidth, setRightWidth] = useState(() => Number(localStorage.getItem('symbiotic_right_width')) || 400);
  const isResizingLeft = useRef(false);
  const isResizingRight = useRef(false);

  const [files, setFiles] = useState<FileNode[]>(() => {
    try {
      const saved = localStorage.getItem('symbiotic_files');
      return saved ? JSON.parse(saved) : INITIAL_FILES;
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
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
    setSaveStatus('saved');
  }, [files]);

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
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingLeft.current) {
        const newWidth = Math.min(Math.max(e.clientX, 160), 480);
        setLeftWidth(newWidth);
        localStorage.setItem('symbiotic_left_width', String(newWidth));
      } else if (isResizingRight.current) {
        const newWidth = Math.min(Math.max(window.innerWidth - e.clientX, 300), 600);
        setRightWidth(newWidth);
        localStorage.setItem('symbiotic_right_width', String(newWidth));
      }
    };
    const handleMouseUp = () => {
      isResizingLeft.current = false;
      isResizingRight.current = false;
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

  const updateFileContent = useCallback((newContent: string) => {
    if (!activeFile) return;
    setHistory(prev => [...prev.slice(0, historyIndex + 1), { content: newContent, timestamp: Date.now() }]);
    setHistoryIndex(prev => prev + 1);
    const updatedFile = { ...activeFile, content: newContent };
    setActiveFile(updatedFile);
    setSaveStatus('saving');
    setFiles(prev => prev.map(f => f.children ? { ...f, children: f.children.map(c => c.name === activeFile.name ? updatedFile : c) } : (f.name === activeFile.name ? updatedFile : f)));
  }, [activeFile, historyIndex]);

  const handleSendMessage = async (target: TargetAgent, options: AgentOptions) => {
    if (!inputValue.trim() && !options.image) return;
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      setMessages(prev => [...prev, { id: generateId(), sender: 'system', text: "Missing Gemini API key. Add VITE_GEMINI_API_KEY (or GEMINI_API_KEY/API_KEY) to your .env.local file.", timestamp: new Date() }]);
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

    const userRequest = userMsg.text;
    const lowerRequest = userRequest.toLowerCase();

    let templateKey: keyof typeof TEMPLATES | null = null;
    if (lowerRequest.includes('kanban')) templateKey = 'kanban';
    else if (lowerRequest.includes('calculator')) templateKey = 'calculator';
    else if (lowerRequest.includes('todo')) templateKey = 'todo';
    else if (lowerRequest.includes('login')) templateKey = 'login';

    try {
      let architectPlan = "";
      if (target === 'team' || target === 'architect') {
        const taskId = generateId();
        setTasks(prev => [...prev, { id: taskId, title: "Architecture Planning", status: 'active', assignedTo: 'architect' }]);
        const response = await ai.models.generateContent({
          model: options.useThinking ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview',
          contents: userRequest,
          config: { 
            systemInstruction: "Senior Software Architect. Plan the UI structure using Tailwind and logical modules. Focus on performance, state management, and highly interactive layouts like resizable panels or dnd surfaces.", 
            thinkingConfig: options.useThinking ? { thinkingBudget: 32768 } : undefined,
            tools: options.useSearch ? [{ googleSearch: {} }] : undefined
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
            model: options.useThinking ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview',
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
      }
    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, { id: generateId(), sender: 'system', text: "Error connecting to agents. Mission aborted.", timestamp: new Date() }]);
    } finally {
      setIsProcessing(false);
    }
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
                <div className="flex p-1 bg-[#18181b] rounded-lg border border-white/10">
                  <button onClick={() => setActiveTab('editor')} className={`px-3 py-1.5 rounded-md text-xs font-medium ${activeTab === 'editor' ? 'bg-[#27272a] text-white' : 'text-gray-500'}`}>Editor</button>
                  <button onClick={() => setActiveTab('preview')} className={`px-3 py-1.5 rounded-md text-xs font-medium ${activeTab === 'preview' ? 'bg-[#27272a] text-white' : 'text-gray-500'}`}>Preview</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 relative overflow-hidden">
          <div className="hidden md:block h-full">
            {!activeFile ? <EmptyState onStart={() => setRightTab('chat')} onExampleClick={handleExampleClick} theme={theme} /> : 
              activeTab === 'editor' ? <Editor file={activeFile} onChange={updateFileContent} theme={theme} onUndo={() => {}} onRedo={() => {}} canUndo={false} canRedo={false} onSave={performSave} saveStatus={saveStatus} /> :
              <Preview file={activeFile} theme={theme} onToggleZen={toggleZenMode} zenMode={zenMode} />}
          </div>
          <div className="md:hidden h-full">
            {mobileView === 'files' && <div className="p-4 space-y-4"><h2 className="text-lg font-bold">Project Explorer</h2>{files.map(node => <FileTreeItem key={node.name} node={node} onSelect={(f) => { setActiveFile(f); setMobileView('editor'); }} activeFileName={activeFile?.name} theme={theme} />)}</div>}
            {mobileView === 'editor' && (activeFile ? <Editor file={activeFile} onChange={updateFileContent} theme={theme} onUndo={() => {}} onRedo={() => {}} canUndo={false} canRedo={false} onSave={performSave} saveStatus={saveStatus} /> : <EmptyState onStart={() => setMobileView('hub')} onExampleClick={handleExampleClick} theme={theme} />)}
            {mobileView === 'preview' && <Preview file={activeFile} theme={theme} onToggleZen={toggleZenMode} zenMode={zenMode} />}
            {mobileView === 'hub' && <div className="h-full flex flex-col"><div className="flex h-10 border-b border-white/5"><button onClick={() => setRightTab('chat')} className={`flex-1 text-[10px] font-bold uppercase tracking-wider ${rightTab === 'chat' ? 'text-indigo-400 bg-white/5' : 'text-gray-500'}`}>Chat</button><button onClick={() => setRightTab('tasks')} className={`flex-1 text-[10px] font-bold uppercase tracking-wider ${rightTab === 'tasks' ? 'text-indigo-400 bg-white/5' : 'text-gray-500'}`}>Tasks</button></div>{rightTab === 'chat' ? <ChatInterface messages={messages} inputValue={inputValue} setInputValue={setInputValue} onSendMessage={handleSendMessage} isProcessing={isProcessing} tasks={tasks} theme={theme} selectedAgent={selectedAgent} setSelectedAgent={setSelectedAgent} /> : <TasksView tasks={tasks} theme={theme} />}</div>}
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
        </div>
        <div className="flex-1 relative overflow-hidden">
          {rightTab === 'chat' ? <ChatInterface messages={messages} inputValue={inputValue} setInputValue={setInputValue} onSendMessage={handleSendMessage} isProcessing={isProcessing} tasks={tasks} theme={theme} selectedAgent={selectedAgent} setSelectedAgent={setSelectedAgent} /> : <TasksView tasks={tasks} theme={theme} />}
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
