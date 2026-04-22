import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    // Supabase Edge shared modules are plain TS (no React); skipping Babel + Fast
    // Refresh here avoids dev/HMR 500s when the app imports @server-shared/*.
    react({ exclude: /\/supabase\/functions\// }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@server-shared': path.resolve(__dirname, './supabase/functions/server/shared'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
