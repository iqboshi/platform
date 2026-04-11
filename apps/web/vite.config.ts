import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

function manualChunks(id: string): string | undefined {
  if (!id.includes('node_modules')) {
    return undefined;
  }

  if (
    id.includes('/react/') ||
    id.includes('/react-dom/') ||
    id.includes('/react-router/') ||
    id.includes('/react-router-dom/') ||
    id.includes('/scheduler/')
  ) {
    return 'react-vendor';
  }

  if (
    id.includes('/antd/') ||
    id.includes('/@ant-design/') ||
    id.includes('/rc-') ||
    id.includes('/@rc-component/')
  ) {
    return 'antd-vendor';
  }

  if (id.includes('/ol/')) {
    return 'map-vendor';
  }

  if (id.includes('/@xyflow/')) {
    return 'workflow-vendor';
  }

  if (id.includes('/occt-import-js/')) {
    return 'cad-parser-vendor';
  }

  if (id.includes('/@react-three/')) {
    return 'react-three-vendor';
  }

  if (id.includes('/three/')) {
    return 'three-vendor';
  }

  return undefined;
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@platform/types': fileURLToPath(new URL('../../packages/types/src', import.meta.url)),
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
  server: {
    port: 5173,
  },
});
