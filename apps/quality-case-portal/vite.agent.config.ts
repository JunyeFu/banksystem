import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';

export default defineConfig({
  base: '/agent/',
  plugins: [react(), { name: 'agent-font-license', generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'assets/NotoSansSC-OFL.txt', source: readFileSync(new URL('./src/agent/assets/OFL.txt', import.meta.url), 'utf8') });
  } }],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    outDir: 'dist-agent',
    assetsInlineLimit: 0,
    rollupOptions: { input: fileURLToPath(new URL('./agent.html', import.meta.url)) },
  },
});
