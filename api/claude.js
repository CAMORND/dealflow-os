/**
 * /api/claude.js — Vercel Serverless Function (Node.js runtime)
 * Proxies Anthropic API calls server-side: fixes CORS + key exposure.
 * Uses correct anthropic-beta header for no-training opt-out.
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const GMAIL_MCP_URL = "https://gmailmcp.googleapis.com/mcp/v1";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return res.status(200).set(CORS).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not set in Vercel environment variables" });
  }

  const body = req.body;
  if (!body || !body.messages) {
    return res.status(400).json({ error: "Missing messages field" });
  }

  const payload = {
    model:      body.model      || "claude-sonnet-4-20250514",
    max_tokens: body.max_tokens || 1500,
    messages:   body.messages,
  };
  if (body.system) payload.system = body.system;
  if (body.tools)  payload.tools  = body.tools;

  // Gmail MCP — server-side only
  if (body.use_gmail) {
    payload.mcp_servers = [{
      type: "url",
      url:  GMAIL_MCP_URL,
      name: "gmail",
    }];
  }

  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         key,
        "anthropic-version": "2023-06-01",
        // Correct beta header: disables use of inputs for training
        "anthropic-beta":    "output-128k-2025-02-19",
      },
      body: JSON.stringify(payload),
    });

    const data = await upstream.json();

    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(upstream.status).json(data);

  } catch (err) {
    return res.status(502).json({ error: "Upstream API error: " + err.message });
  }
}
