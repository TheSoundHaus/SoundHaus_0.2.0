import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
// https://vite.dev/config/
export default defineConfig({
    plugins: [react(), tailwindcss()],
    base: './', // Important for Electron to load assets correctly
    build: {
        outDir: 'dist',
        rollupOptions: {
            external: ['electron']
        }
    },
    server: {
        port: 5173
    }
});
