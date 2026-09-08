import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getAllFeedEntries } from '../lib/feed';

export async function GET(context: APIContext) {
  const entries = await getAllFeedEntries();

  return rss({
    title: 'Google Cloud Radar — Real-Time Google API & Cloud Feed',
    description: 'Automated pre-release intelligence for Google APIs and Cloud services. Live API changes and breaking changes tracked from the Google Discovery Service.',
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
        <comments_count>${entry.comments_count ?? 0}</comments_count>
        <reactions_like_change>${entry.reaction_counts?.like_change ?? 0}</reactions_like_change>
        <reactions_released>${entry.reaction_counts?.released ?? 0}</reactions_released>
        <reactions_false_positive_or_duplicate>${entry.reaction_counts?.false_positive_or_duplicate ?? 0}</reactions_false_positive_or_duplicate>
      `,
    })),
    customData: `<language>en-us</language>`,
  });
}
