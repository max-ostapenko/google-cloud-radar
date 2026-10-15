import { describe, it, expect } from 'vitest';
import { GET as getManifest, OPTIONS as optionsManifest } from '../web/src/pages/.well-known/mcp.json';
import { GET as getMcp, POST as postMcp, OPTIONS as optionsMcp } from '../web/src/pages/api/mcp';

describe('MCP Discovery Manifest (/.well-known/mcp.json)', () => {
  it('returns valid MCP discovery manifest metadata', async () => {
    const res = await getManifest({} as any);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');

    const json = await res.json();
    expect(json.schema_version).toBe('1.0');
    expect(json.name).toBe('Google Cloud Radar MCP Server');
    expect(json.endpoints.mcp).toBe('/api/mcp');
    expect(json.capabilities.tools.list).toBe(true);
    expect(json.capabilities.tools.call).toBe(true);
    expect(Array.isArray(json.tools)).toBe(true);

    const toolNames = json.tools.map((t: any) => t.name);
    expect(toolNames).toContain('list_changes');
    expect(toolNames).toContain('get_change_details');
    expect(toolNames).toContain('search_changes');
  });

  it('handles OPTIONS preflight requests', async () => {
    const res = await optionsManifest({} as any);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('MCP Endpoint (/api/mcp)', () => {
  it('returns server metadata on GET request', async () => {
    const res = await getMcp({} as any);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');

    const json = await res.json();
    expect(json.status).toBe('ok');
    expect(json.protocol).toBe('JSON-RPC 2.0');
    expect(Array.isArray(json.tools)).toBe(true);
  });

  it('handles OPTIONS preflight requests', async () => {
    const res = await optionsMcp({} as any);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('handles initialize method via POST', async () => {
    const req = new Request('http://localhost/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
      }),
    });

    const res = await postMcp({ request: req } as any);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.jsonrpc).toBe('2.0');
    expect(json.id).toBe(1);
    expect(json.result.serverInfo.name).toBe('Google Cloud Radar MCP Server');
    expect(json.result.protocolVersion).toBeDefined();
  });

  it('handles ping method via POST', async () => {
    const req = new Request('http://localhost/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'ping',
      }),
    });

    const res = await postMcp({ request: req } as any);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.jsonrpc).toBe('2.0');
    expect(json.id).toBe(2);
    expect(json.result).toEqual({});
  });

  it('handles tools/list method via POST', async () => {
    const req = new Request('http://localhost/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/list',
      }),
    });

    const res = await postMcp({ request: req } as any);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.jsonrpc).toBe('2.0');
    expect(json.id).toBe(3);
    expect(Array.isArray(json.result.tools)).toBe(true);

    const names = json.result.tools.map((t: any) => t.name);
    expect(names).toContain('list_changes');
    expect(names).toContain('get_change_details');
    expect(names).toContain('search_changes');
  });

  it('handles tools/call with list_changes tool', async () => {
    const req = new Request('http://localhost/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'list_changes',
          arguments: {
            limit: 5,
          },
        },
      }),
    });

    const res = await postMcp({ request: req } as any);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.jsonrpc).toBe('2.0');
    expect(json.id).toBe(4);
    expect(json.result.isError).toBe(false);
    expect(Array.isArray(json.result.structuredData)).toBe(true);
    expect(Array.isArray(json.result.content)).toBe(true);

    if (json.result.structuredData.length > 0) {
      const item = json.result.structuredData[0];
      expect(item.slug).toBeDefined();
      expect(item.service).toBeDefined();
      expect(item.api).toBeDefined();
      expect(typeof item.breaking).toBe('boolean');
    }
  });

  it('handles tools/call with list_changes filtered by breaking_only', async () => {
    const req = new Request('http://localhost/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'list_changes',
          arguments: {
            breaking_only: true,
            limit: 10,
          },
        },
      }),
    });

    const res = await postMcp({ request: req } as any);
    const json = await res.json();
    expect(json.result.isError).toBe(false);
    for (const item of json.result.structuredData) {
      expect(item.breaking).toBe(true);
    }
  });

  it('handles tools/call with get_change_details tool for valid and invalid slugs', async () => {
    // First list changes to get a valid slug
    const listReq = new Request('http://localhost/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'list_changes',
          arguments: { limit: 1 },
        },
      }),
    });

    const listRes = await postMcp({ request: listReq } as any);
    const listJson = await listRes.json();
    const validSlug = listJson.result.structuredData[0]?.slug;
    const validDocId = listJson.result.structuredData[0]?.doc_id;

    if (validSlug) {
      const detailReq = new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 7,
          method: 'tools/call',
          params: {
            name: 'get_change_details',
            arguments: { slug: validSlug },
          },
        }),
      });

      const detailRes = await postMcp({ request: detailReq } as any);
      const detailJson = await detailRes.json();
      expect(detailJson.result.isError).toBe(false);
      expect(detailJson.result.structuredData.slug).toBe(validSlug);
      expect(detailJson.result.structuredData.title).toBeDefined();
      expect(detailJson.result.structuredData.summary).toBeDefined();
    }

    if (validDocId && validDocId !== validSlug) {
      const docIdReq = new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 71,
          method: 'tools/call',
          params: {
            name: 'get_change_details',
            arguments: { slug: validDocId },
          },
        }),
      });

      const docIdRes = await postMcp({ request: docIdReq } as any);
      const docIdJson = await docIdRes.json();
      expect(docIdJson.result.isError).toBe(false);
      expect(docIdJson.result.structuredData.doc_id).toBe(validDocId);
    }

    // Invalid slug test
    const invalidReq = new Request('http://localhost/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: {
          name: 'get_change_details',
          arguments: { slug: 'non-existent-slug-9999' },
        },
      }),
    });

    const invalidRes = await postMcp({ request: invalidReq } as any);
    const invalidJson = await invalidRes.json();
    expect(invalidJson.result.isError).toBe(true);
    expect(invalidJson.result.content[0].text).toContain('Change entry not found');
  });

  it('handles tools/call with search_changes tool', async () => {
    const req = new Request('http://localhost/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 9,
        method: 'tools/call',
        params: {
          name: 'search_changes',
          arguments: {
            query: 'API',
            limit: 5,
          },
        },
      }),
    });

    const res = await postMcp({ request: req } as any);
    const json = await res.json();
    expect(json.result.isError).toBe(false);
    expect(Array.isArray(json.result.structuredData)).toBe(true);
  });

  it('returns JSON-RPC error for invalid jsonrpc version', async () => {
    const req = new Request('http://localhost/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '1.0',
        id: 10,
        method: 'ping',
      }),
    });

    const res = await postMcp({ request: req } as any);
    const json = await res.json();
    expect(json.error).toBeDefined();
    expect(json.error.code).toBe(-32600);
  });

  it('returns JSON-RPC error for malformed JSON body', async () => {
    const req = new Request('http://localhost/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ invalid json ',
    });

    const res = await postMcp({ request: req } as any);
    const json = await res.json();
    expect(json.error).toBeDefined();
    expect(json.error.code).toBe(-32700);
  });

  it('returns JSON-RPC error for unknown method', async () => {
    const req = new Request('http://localhost/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 11,
        method: 'unknown_method',
      }),
    });

    const res = await postMcp({ request: req } as any);
    const json = await res.json();
    expect(json.error).toBeDefined();
    expect(json.error.code).toBe(-32601);
  });
});
