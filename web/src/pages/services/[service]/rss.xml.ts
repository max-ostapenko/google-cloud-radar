import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getAllFeedEntries, getServicesList, slugify } from '../../../lib/feed';

export async function getStaticPaths() {
  const services = await getServicesList();
  const allEntries = await getAllFeedEntries();

  return services.map((svc) => {
    const serviceEntries = allEntries.filter(
      (e) => slugify(e.service) === svc.slug || slugify(e.api) === svc.slug
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
        <category>${entry.category}</category>
        <service>${entry.service}</service>
        <api>${entry.api}</api>
        <impact>${entry.impact}</impact>
        <breaking>${entry.breaking}</breaking>
        <interesting_score>${entry.interesting_score}</interesting_score>
        <status>${entry.status}</status>
      `,
    })),
    customData: `<language>en-us</language>`,
  });
}
