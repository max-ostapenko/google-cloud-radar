import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getAllFeedEntries, getServicesList, slugify } from '../../../lib/feed';

export async function getStaticPaths() {
  const services = await getServicesList();
  const allEntries = await getAllFeedEntries();

  return services.map((svc) => {
    const serviceEntries = allEntries.filter(
      (e) => slugify(e.service) === svc.slug
    );
    return {
      params: { service: svc.slug },
      props: {
        serviceInfo: svc,
        entries: serviceEntries,
      },
    };
  });
}

function escapeXml(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET(context: APIContext) {
  const { serviceInfo, entries } = context.props as { serviceInfo: any; entries: any[] };

  return rss({
    title: `${serviceInfo.service} API Changes — Google Cloud Radar`,
    description: `Real-time pre-release intelligence and changelog for Google ${serviceInfo.service}. Tracked from Google Discovery Service.`,
    site: context.site || 'https://google-cloud-radar.com',
    items: entries.map((entry) => ({
      title: `${entry.breaking ? '⚠️ [BREAKING] ' : ''}${entry.title}`,
      pubDate: new Date(entry.date),
      description: entry.summary,
      link: `/changes/${entry.slug}`,
      customData: `
        <category>${escapeXml(entry.category)}</category>
        <service>${escapeXml(entry.service)}</service>
        <api>${escapeXml(entry.api)}</api>
        <impact>${escapeXml(entry.impact)}</impact>
        <breaking>${escapeXml(entry.breaking)}</breaking>
        <interesting_score>${escapeXml(entry.interesting_score)}</interesting_score>
        <status>${escapeXml(entry.status)}</status>
      `,
    })),
    customData: `<language>en-us</language>`,
  });
}
