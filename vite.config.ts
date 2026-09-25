import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('katex')) return 'vendor-katex';
              if (id.includes('lucide-react')) return 'vendor-icons';
              if (
                id.includes('@tiptap') ||
                id.includes('prosemirror') ||
                id.includes('tiptap-markdown') ||
                id.includes('lowlight') ||
                id.includes('highlight.js') ||
                id.includes('react-syntax-highlighter')
              ) {
                return 'vendor-editor';
              }
            }
          },
        },
      },
      chunkSizeWarningLimit: 900,
    },
    test: {
      environment: 'jsdom',
      exclude: ['**/node_modules/**', '**/.worktrees/**'],
    },
  };
});
