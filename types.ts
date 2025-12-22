
export type AgentRole = 'architect' | 'developer' | 'qa';

export type TargetAgent = 'team' | AgentRole;

export type Theme = 'light' | 'dark';

export type SaveStatus = 'saved' | 'saving' | 'unsaved';

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent' | 'system';
  agentRole?: AgentRole;
  text: string;
  timestamp: Date;
  attachment?: {
    type: 'image';
    content: string; // base64
  };
  groundingUrls?: { title: string; uri: string }[];
}

export interface FileNode {
  name: string;
  type: 'file' | 'folder';
  content?: string;
  language?: string;
  children?: FileNode[];
  isOpen?: boolean;
  isNew?: boolean; 
}

export interface AgentTask {
  id: string;
  title: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  assignedTo: AgentRole;
  description?: string;
}

export interface AgentOptions {
  useSearch: boolean;
  useThinking: boolean;
  image?: string; // base64
}
