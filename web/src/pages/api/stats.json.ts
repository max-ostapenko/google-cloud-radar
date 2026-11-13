import type { APIRoute } from 'astro';
import { computeRadarStats } from '../../lib/stats';

export const GET: APIRoute = async () => {
  const report = await computeRadarStats(90);

  return new Response(
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        source: 'https://google-cloud-radar.com/stats',
        ...report,
      },
      null,
      2
    ),
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=300, s-maxage=600',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
};

