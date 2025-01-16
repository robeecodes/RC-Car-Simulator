import restart from 'vite-plugin-restart';
import {defineConfig} from 'vite'

export default defineConfig({
    base: '',
    root: 'src/', // Sources files
    publicDir: '../static/', // Path from "root" to static assets
    server:
        {
            host: true,
            open: !('SANDBOX_URL' in process.env || 'CODESANDBOX_HOST' in process.env)
        },
    build:
        {
            outDir: '../dist', // Output in the dist/ folder
            emptyOutDir: true,
            sourcemap: true
        },
    plugins:
        [
            restart({restart: ['../static/**',]}) // Restart server on static file change
        ],
});