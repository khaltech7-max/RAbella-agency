import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), '');

  function pickValidEnv(...candidates: (string | undefined)[]): string {
    for (const c of candidates) {
      const val = String(c || '').trim().replace(/^['"]+|['"]+$/g, '').trim();
      if (
        val &&
        !val.includes('your-project-ref') &&
        !val.includes('example.supabase.co') &&
        val !== 'your-supabase-anon-key' &&
        val !== 'your-anon-key' &&
        val !== 'your-supabase-service-role-key'
      ) {
        return val;
      }
    }
    return '';
  }

  // Resolve public Supabase URL and public anon/publishable key from standard or Vercel-injected env vars.
  // NEVER expose SUPABASE_SERVICE_ROLE_KEY or any secret keys to the frontend bundle.
  const resolvedSupabaseUrl = pickValidEnv(
    env.VITE_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.REACT_APP_SUPABASE_URL,
    env.SUPABASE_URL,
    process.env.VITE_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.REACT_APP_SUPABASE_URL,
    process.env.SUPABASE_URL
  );

  const resolvedSupabaseAnonKey = pickValidEnv(
    env.VITE_SUPABASE_ANON_KEY,
    env.VITE_SUPABASE_PUBLISHABLE_KEY,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
    env.REACT_APP_SUPABASE_ANON_KEY,
    env.SUPABASE_ANON_KEY,
    process.env.VITE_SUPABASE_ANON_KEY,
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
    process.env.REACT_APP_SUPABASE_ANON_KEY,
    process.env.SUPABASE_ANON_KEY
  );

  return {
    plugins: [react(), tailwindcss()],
    envPrefix: ['VITE_', 'NEXT_PUBLIC_', 'REACT_APP_'],
    define: {
      'import.meta.env.__RESOLVED_SUPABASE_URL__': JSON.stringify(resolvedSupabaseUrl),
      'import.meta.env.__RESOLVED_SUPABASE_ANON_KEY__': JSON.stringify(resolvedSupabaseAnonKey),
    },
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), '.'),
      },
    },
    server: {
      hmr: false,
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

