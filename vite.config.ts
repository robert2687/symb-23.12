import { createHash } from 'crypto';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { GEMINI_KEY_ENV_ORDER } from './envKeys';

// SHA-256 hashes of known compromised Gemini API keys (hashing avoids storing raw keys in source).
// Add hashes here to block them at build time; keeping the list in-source makes it easy to audit.
const BLOCKED_GEMINI_KEY_HASHES = new Set([
  'c83922dee0374346dc5f5f7a16de494ad136470a05658dcb72a4bc4b279503fb', // leaked key, do not use
]);

const sanitizeGeminiKey = (rawKey?: string) => {
  const sanitized = rawKey?.trim();
  if (!sanitized) return '';
  const hashed = createHash('sha256').update(sanitized).digest('hex');
  if (BLOCKED_GEMINI_KEY_HASHES.has(hashed)) {
    console.warn('Blocked Gemini API key detected. Generate a new key at https://aistudio.google.com and set VITE_GEMINI_API_KEY (or GEMINI_API_KEY/API_KEY).');
    return '';
  }
  return sanitized;
};

const resolveGeminiKey = (env: Record<string, string | undefined>) => {
  for (const key of GEMINI_KEY_ENV_ORDER) {
    const candidate = sanitizeGeminiKey(env[key]);
    if (candidate) return candidate;
  }
  return '';
};

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    // Resolve the key once using the configured precedence (VITE_GEMINI_API_KEY, GEMINI_API_KEY, API_KEY).
    const geminiKey = resolveGeminiKey(env);
    return {
       server: {
         port: 3000,
         host: '0.0.0.0',
       },
       plugins: [react()],
      // The bundle includes a few large third-party packages; split them into
      // dedicated chunks and raise the warning threshold to avoid noisy builds
      // while keeping initial load lean.
      build: {
        rollupOptions: {
          output: {
            manualChunks: {
              react: ['react', 'react-dom'],
              genai: ['@google/genai'],
              dndkit: ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
              icons: ['lucide-react'],
            },
          },
        },
        chunkSizeWarningLimit: 700,
      },
       define: {
         'import.meta.env.RESOLVED_GEMINI_API_KEY': JSON.stringify(geminiKey),
         'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(geminiKey),
         'import.meta.env.GEMINI_API_KEY': JSON.stringify(geminiKey),
        'process.env.API_KEY': JSON.stringify(geminiKey),
        'process.env.GEMINI_API_KEY': JSON.stringify(geminiKey)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
