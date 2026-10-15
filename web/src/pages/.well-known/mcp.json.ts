import type { APIRoute } from 'astro';

export const prerender = true;

const MANIFEST = {
  schema_version: '1.0',
  name: 'Google Cloud Radar MCP Server',
  description: 'Model Context Protocol endpoint for Google Cloud API breaking changes and pre-release intelligence.',
  vendor: 'Google Cloud Radar',
  version: '1.0.0',
  endpoints: {
    mcp: '/api/mcp',
  },
  capabilities: {
    tools: {
      list: true,
      call: true,
    },
  },
  tools: [
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
  ],
};

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify(MANIFEST, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300, s-maxage=600',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  });
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
};
