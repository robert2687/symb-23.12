import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { GEMINI_KEY_ENV_ORDER } from './envKeys';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const geminiKey = GEMINI_KEY_ENV_ORDER.map(key => env[key]?.trim()).find(value => value) || '';
    // Prefer GEMINI_API_KEY but fall back to API_KEY for compatibility across deployment setups.
    const geminiApiKey = env.GEMINI_API_KEY || env.API_KEY;
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'import.meta.env.RESOLVED_GEMINI_API_KEY': JSON.stringify(geminiKey),
        'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(geminiKey),
        'process.env.API_KEY': JSON.stringify(geminiKey),
        'process.env.GEMINI_API_KEY': JSON.stringify(geminiKey)
        // Surface the same resolved key through both import.meta and process fallbacks used in the app.
        'import.meta.env.GEMINI_API_KEY': JSON.stringify(geminiApiKey),
        'process.env.API_KEY': JSON.stringify(geminiApiKey),
        'process.env.GEMINI_API_KEY': JSON.stringify(geminiApiKey)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
