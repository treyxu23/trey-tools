import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import yaml from '@modyfi/vite-plugin-yaml';

export default defineConfig({
  site: 'https://treyxu23.github.io',
  base: '/trey-tools',
  vite: {
    plugins: [tailwindcss(), yaml()]
  }
});
