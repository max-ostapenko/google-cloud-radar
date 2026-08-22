import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://gcp-discovery-radar.web.app',
  output: 'static',
  integrations: [sitemap()],
});
