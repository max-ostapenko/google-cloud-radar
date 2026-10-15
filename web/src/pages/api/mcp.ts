import type { APIRoute } from 'astro';
import { getAllFeedEntries, getFeedEntryBySlug } from '../../lib/feed';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
};

const TOOLS = [
  {
    name: 'list_changes',
    description: 'List recent Google Cloud API breaking changes and service updates.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          description: 'Maximum number of entries to return (default: 20, max: 100)',
        },
        breaking_only: {
          type: 'boolean',
          description: 'Filter to only breaking changes',
        },
        service: {
          type: 'string',
          description: 'Filter by service name or identifier (e.g., BigQuery, Vertex AI, Storage)',
        },
      },
    },
  },
  {
    name: 'get_change_details',
    description: 'Get detailed information and diff for a specific change entry by its slug.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'The unique identifier slug for the change entry (e.g. 2026-08-30-aiplatform or 2026-08-30-aiplatform-v1)',
        },
      },
      required: ['slug'],
    },
  },
  {
    name: 'search_changes',
    description: 'Search change records by service name, query term, or API identifier.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query or keyword',
        },
        service: {
          type: 'string',
          description: 'Optional service name to filter by',
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of entries to return (default: 20, max: 100)',
        },
      },
    },
  },
];

function jsonRpcError(id: any, code: number, message: string, data?: any) {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      id: id ?? null,
      error: {
        code,
        message,
        ...(data ? { data } : {}),
      },
    }),
    {
      status: 200,
      headers: CORS_HEADERS,
    }
  );
}

function jsonRpcSuccess(id: any, result: any) {
  return new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      id: id ?? null,
      result,
    }),
    {
      status: 200,
      headers: CORS_HEADERS,
    }
  );
}

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
};

export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify(
      {
        status: 'ok',
        service: 'Google Cloud Radar MCP Endpoint',
        version: '1.0.0',
        protocol: 'JSON-RPC 2.0',
        tools: TOOLS.map((t) => t.name),
      },
      null,
      2
    ),
    {
      status: 200,
      headers: CORS_HEADERS,
    }
  );
};

export const POST: APIRoute = async ({ request }) => {
  let body: any;
  try {
    const rawText = await request.text();
    if (!rawText || !rawText.trim()) {
      return jsonRpcError(null, -32700, 'Parse error: Empty request body');
    }
    body = JSON.parse(rawText);
  } catch (err: any) {
    return jsonRpcError(null, -32700, `Parse error: Invalid JSON (${err.message})`);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonRpcError(null, -32600, 'Invalid Request: Expected a JSON-RPC 2.0 request object');
  }

  const { jsonrpc, id, method, params } = body;

  if (jsonrpc !== '2.0') {
    return jsonRpcError(id, -32600, 'Invalid Request: Missing or invalid jsonrpc version (must be "2.0")');
  }

  if (!method || typeof method !== 'string') {
    return jsonRpcError(id, -32600, 'Invalid Request: Method name must be a non-empty string');
  }

  try {
    switch (method) {
      case 'initialize': {
        return jsonRpcSuccess(id, {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {
              listChanged: false,
            },
          },
          serverInfo: {
            name: 'Google Cloud Radar MCP Server',
            version: '1.0.0',
          },
        });
      }

      case 'ping': {
        return jsonRpcSuccess(id, {});
      }

      case 'tools/list': {
        return jsonRpcSuccess(id, {
          tools: TOOLS,
        });
      }

      case 'tools/call': {
        if (!params || typeof params !== 'object') {
          return jsonRpcError(id, -32602, 'Invalid params: Expected object containing name and arguments');
        }

        const toolName = params.name;
        const args = params.arguments || {};

        if (!toolName || typeof toolName !== 'string') {
          return jsonRpcError(id, -32602, 'Invalid params: Tool name must be specified in params.name');
        }

        if (toolName === 'list_changes') {
          const limit = Math.min(Math.max(1, Number(args.limit) || 20), 100);
          const breakingOnly = Boolean(args.breaking_only);
          const serviceFilter = typeof args.service === 'string' ? args.service.toLowerCase().trim() : '';

          const entries = await getAllFeedEntries();
          let filtered = entries;

          if (serviceFilter) {
            filtered = filtered.filter(
              (e) =>
                e.service.toLowerCase().includes(serviceFilter) ||
                (e.service_id && e.service_id.toLowerCase().includes(serviceFilter)) ||
                e.api.toLowerCase().includes(serviceFilter)
            );
          }

          if (breakingOnly) {
            filtered = filtered.filter((e) => e.breaking);
          }

          const records = filtered.slice(0, limit).map((entry) => ({
            slug: entry.slug,
            ...(entry.docId ? { doc_id: entry.docId } : {}),
            date: entry.date,
            service: entry.service,
            api: entry.api,
            title: entry.title,
            summary: entry.summary,
            impact: entry.impact,
            breaking: entry.breaking,
            interesting_score: entry.interesting_score,
            status: entry.status,
            tags: entry.tags,
            extracted_methods: entry.extractedMethods,
            url: `https://google-cloud-radar.com/changes/${entry.slug}`,
          }));

          return jsonRpcSuccess(id, {
            content: [
              {
                type: 'text',
                text: JSON.stringify(records, null, 2),
              },
            ],
            structuredData: records,
            isError: false,
          });
        }

        if (toolName === 'get_change_details') {
          const slug = typeof args.slug === 'string' ? args.slug.trim() : '';

          if (!slug) {
            return jsonRpcSuccess(id, {
              content: [
                {
                  type: 'text',
                  text: 'Error: Parameter "slug" is required and cannot be empty.',
                },
              ],
              isError: true,
            });
          }

          let entry = await getFeedEntryBySlug(slug);
          if (!entry) {
            const allEntries = await getAllFeedEntries();
            entry = allEntries.find((e) => e.docId === slug || `${e.slug}-${e.version}` === slug);
          }

          if (!entry) {
            return jsonRpcSuccess(id, {
              content: [
                {
                  type: 'text',
                  text: `Change entry not found for slug: "${slug}"`,
                },
              ],
              isError: true,
            });
          }

          const details = {
            slug: entry.slug,
            ...(entry.docId ? { doc_id: entry.docId } : {}),
            date: entry.date,
            service: entry.service,
            service_id: entry.service_id,
            api: entry.api,
            version: entry.version,
            title: entry.title,
            summary: entry.summary,
            details: entry.rawContent || entry.summary,
            details_html: entry.detailsHtml,
            impact: entry.impact,
            breaking: entry.breaking,
            interesting_score: entry.interesting_score,
            status: entry.status,
            lead_time_days: entry.lead_time_days,
            official_release_date: entry.official_release_date,
            official_release_notes_url: entry.official_release_notes_url,
            tags: entry.tags,
            extracted_methods: entry.extractedMethods,
            discovery_rest_url: entry.discoveryRestUrl,
            documentation_link: entry.documentationLink,
            url: `https://google-cloud-radar.com/changes/${entry.slug}`,
          };

          return jsonRpcSuccess(id, {
            content: [
              {
                type: 'text',
                text: JSON.stringify(details, null, 2),
              },
            ],
            structuredData: details,
            isError: false,
          });
        }

        if (toolName === 'search_changes') {
          const limit = Math.min(Math.max(1, Number(args.limit) || 20), 100);
          const serviceFilter = typeof args.service === 'string' ? args.service.toLowerCase().trim() : '';
          const query = typeof args.query === 'string' ? args.query.toLowerCase().trim() : '';

          const entries = await getAllFeedEntries();
          let filtered = entries;

          if (serviceFilter) {
            filtered = filtered.filter(
              (e) =>
                e.service.toLowerCase().includes(serviceFilter) ||
                (e.service_id && e.service_id.toLowerCase().includes(serviceFilter)) ||
                e.api.toLowerCase().includes(serviceFilter)
            );
          }

          if (query) {
            filtered = filtered.filter(
              (e) =>
                e.title.toLowerCase().includes(query) ||
                e.summary.toLowerCase().includes(query) ||
                e.service.toLowerCase().includes(query) ||
                e.api.toLowerCase().includes(query) ||
                e.tags.some((t) => t.toLowerCase().includes(query)) ||
                e.extractedMethods.some((m) => m.toLowerCase().includes(query))
            );
          }

          const records = filtered.slice(0, limit).map((entry) => ({
            slug: entry.slug,
            ...(entry.docId ? { doc_id: entry.docId } : {}),
            date: entry.date,
            service: entry.service,
            api: entry.api,
            title: entry.title,
            summary: entry.summary,
            impact: entry.impact,
            breaking: entry.breaking,
            interesting_score: entry.interesting_score,
            status: entry.status,
            tags: entry.tags,
            extracted_methods: entry.extractedMethods,
            url: `https://google-cloud-radar.com/changes/${entry.slug}`,
          }));

          return jsonRpcSuccess(id, {
            content: [
              {
                type: 'text',
                text: JSON.stringify(records, null, 2),
              },
            ],
            structuredData: records,
            isError: false,
          });
        }

        return jsonRpcError(id, -32601, `Method not found: Unknown tool "${toolName}"`);
      }

      default:
        return jsonRpcError(id, -32601, `Method not found: "${method}"`);
    }
  } catch (err: any) {
    return jsonRpcError(id, -32603, `Internal error: ${err.message}`);
  }
};
