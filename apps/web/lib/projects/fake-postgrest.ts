import { vi } from "vitest";

// Test helper: a fake PostgREST behind a mocked `fetch`, so route tests run the
// real handlers and real supabase-js and can inspect every request.

export interface RecordedRequest {
  method: string;
  /** e.g. `/rest/v1/projects`, `/rest/v1/rpc/create_project` */
  path: string;
  params: URLSearchParams;
  headers: Headers;
  body: unknown;
}

export type Reply = { status?: number; body: unknown };
export type Handler = (req: RecordedRequest) => Reply | undefined;

export function fakePostgrest() {
  const requests: RecordedRequest[] = [];
  const handlers: Handler[] = [];

  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const text = await request.text();
    const rec: RecordedRequest = {
      method: request.method,
      path: url.pathname,
      params: url.searchParams,
      headers: request.headers,
      body: text ? (JSON.parse(text) as unknown) : undefined,
    };
    requests.push(rec);
    for (const handler of handlers) {
      const reply = handler(rec);
      if (reply) return Response.json(reply.body, { status: reply.status ?? 200 });
    }
    return Response.json(
      { code: "TEST", message: `unhandled ${rec.method} ${rec.path}` },
      { status: 500 },
    );
  });

  return {
    fetchMock,
    requests,
    /** Answer requests matching `method` + `path` with `reply` (first match wins). */
    on(method: string, path: string, reply: Reply | ((req: RecordedRequest) => Reply)) {
      handlers.push((req) =>
        req.method === method && req.path === path
          ? typeof reply === "function"
            ? reply(req)
            : reply
          : undefined,
      );
    },
    /** Requests to `path` (optionally with `method`). */
    to(path: string, method?: string): RecordedRequest[] {
      return requests.filter((r) => r.path === path && (!method || r.method === method));
    },
  };
}

/** A PostgREST error body with a SQLSTATE, as supabase-js reads it. */
export function pgError(code: string, message: string, status = 400): Reply {
  return { status, body: { code, message, details: null, hint: null } };
}
