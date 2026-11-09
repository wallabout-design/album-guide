// The site's only server code. Cloudflare serves every page and file straight
// from dist/; only /api/* runs this Worker (`assets.run_worker_first` in
// wrangler.jsonc). Nothing is routed yet, so every /api/* path is a 404.
// Telemetry and the Sentry tunnel will hang their routes here.

// No bindings yet.
type Env = Record<string, never>;

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    console.log(JSON.stringify({ message: 'api not found', method: request.method, pathname }));
    return Response.json({ error: 'not found' }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
