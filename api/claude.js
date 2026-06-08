/**
 * /api/claude.js — Vercel Edge Function
 * Proxies all Anthropic API calls server-side.
 * Fixes: CORS, API key exposure, Gmail MCP (server-only).
 * Env var required: ANTHROPIC_API_KEY
 */
export const config = { runtime: "edge" };

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default async function handler(req) {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405 });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key)
    return json({ error: "ANTHROPIC_API_KEY missing in Vercel env vars" }, 500);

  let body;
  try { body = await req.json(); }
  catch { return json({ error: "Invalid JSON" }, 400); }

  const payload = {
    model:      body.model      || "claude-sonnet-4-20250514",
    max_tokens: body.max_tokens || 1500,
    messages:   body.messages,
  };
  if (body.system) payload.system = body.system;
  if (body.tools)  payload.tools  = body.tools;

  if (body.use_gmail) {
    payload.mcp_servers = [{
      type: "url",
      url:  "https://gmailmcp.googleapis.com/mcp/v1",
      name: "gmail",
    }];
  }

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         key,
      "anthropic-version": "2023-06-01",
      "anthropic-beta":    "no-training-2024-05-01",
    },
    body: JSON.stringify(payload),
  });

  const data = await upstream.json();
  return json(data, upstream.status);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}
