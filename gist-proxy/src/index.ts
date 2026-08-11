export interface Env {
  GIST_TOKEN: string;
  ALLOWED_ORIGIN: string[];
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin") || "";

    // Check whether this origin is allowed.
    const isAllowed = env.ALLOWED_ORIGIN.includes(origin);

    // CORS preflight
    if (request.method === "OPTIONS") {
      if (!isAllowed) {
        return new Response("Forbidden", { status: 403 });
      }

      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
      });
    }

    // Only allow configured origins to call the Worker.
    if (!isAllowed) {
      return new Response("Forbidden", { status: 403 });
    }

    const url = new URL(request.url);

    // GET /gists/:id -> proxy to GitHub's Gist API
    const match = url.pathname.match(/^\/gists\/([a-zA-Z0-9]+)$/);

    if (!match) {
      return new Response("Not found", {
        status: 404,
        headers: corsHeaders(origin),
      });
    }

    const gistId = match[1];

    const ghResponse = await fetch(
      `https://api.github.com/gists/${gistId}`,
      {
        method: request.method,
        headers: {
          Authorization: `Bearer ${env.GIST_TOKEN}`,
          "User-Agent": "my-gist-proxy",
          Accept: "application/vnd.github+json",
          ...(request.method === "PATCH" || request.method === "POST"
            ? { "Content-Type": "application/json" }
            : {}),
        },
        body:
          request.method === "PATCH" || request.method === "POST"
            ? await request.text()
            : undefined,
      },
    );

    const body = await ghResponse.text();

    return new Response(body, {
      status: ghResponse.status,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(origin),
      },
    });
  },
};

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}