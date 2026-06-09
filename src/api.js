/**
 * api.js — client-side API module.
 * All Claude calls go through /api/claude (Vercel serverless proxy).
 * Never calls Anthropic directly — avoids CORS and key exposure.
 */

const PROXY = "/api/claude";

async function post(payload) {
  const res = await fetch(PROXY, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  });

  // Surface API errors clearly
  if (!res.ok) {
    let msg = `API error ${res.status}`;
    try { const e = await res.json(); msg = e.error || msg; } catch {}
    throw new Error(msg);
  }

  const data = await res.json();

  // Propagate Anthropic-level errors (wrong key, overloaded, etc.)
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data;
}

/** Extract text content from an Anthropic response */
function extractText(data) {
  return (data.content || [])
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("");
}

/** Call Claude → returns raw text string */
export async function callClaude(prompt, system, opts = {}) {
  const data = await post({
    system,
    max_tokens: opts.maxTokens || 1200,
    use_gmail:  opts.useGmail  || false,
    messages:   [{ role: "user", content: prompt }],
  });
  return extractText(data);
}

/** Call Claude → parses and returns JSON (strips markdown fences) */
export async function callClaudeJSON(prompt, system, opts = {}) {
  const raw = await callClaude(
    prompt,
    (system || "") + "\nRespond with ONLY valid JSON — no markdown fences, no explanation.",
    opts
  );
  const cleaned = raw.replace(/^```(?:json)?|```$/gm, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to find a JSON object/array in the response
    const match = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (match) {
      try { return JSON.parse(match[1]); } catch {}
    }
    console.error("JSON parse failed. Raw response:", raw.slice(0, 300));
    return null;
  }
}

/** Load Gmail emails via MCP (executed server-side in the proxy) */
export async function loadGmailEmails() {
  const data = await post({
    use_gmail:  true,
    max_tokens: 2000,
    system:     "You are a Gmail assistant. Use Gmail tools to fetch emails. Return structured JSON only — no markdown.",
    messages: [{
      role:    "user",
      content: `Fetch the 20 most recent emails from Gmail.
Return a JSON array where each item has:
id, fromName, fromEmail, subject, date (ISO 8601), bodySnippet (first 300 chars),
hasAttachments (boolean), attachments (array of {name, size}).
Return ONLY the JSON array.`,
    }],
  });

  const raw = extractText(data).replace(/^```(?:json)?|```$/gm, "").trim();
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // If Claude returned prose instead of JSON, return empty so the UI falls back to demo
    console.warn("Gmail MCP returned non-JSON:", raw.slice(0, 200));
    return [];
  }
}

/** Read a file as base64 data URL, return only the base64 part */
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Read a file as plain text */
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

const TEXT_TYPES = new Set(["txt", "md", "csv", "json", "xml", "html", "htm", "eml", "rtf"]);
const IMAGE_TYPES = new Set(["jpg", "jpeg", "png", "gif", "webp"]);
const MIME_MAP = {
  pdf:  "application/pdf",
  jpg:  "image/jpeg", jpeg: "image/jpeg",
  png:  "image/png",  gif: "image/gif", webp: "image/webp",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc:  "application/msword",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ppt:  "application/vnd.ms-powerpoint",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls:  "application/vnd.ms-excel",
  txt:  "text/plain", csv: "text/csv",
};

/**
 * Extract text content from any supported file type.
 * Returns { type: "text", content: string }
 */
export async function extractFileContent(file) {
  const ext      = file.name.split(".").pop().toLowerCase();
  const mimeType = file.type || MIME_MAP[ext] || "application/octet-stream";

  // Plain text files — read directly, no API call needed
  if (TEXT_TYPES.has(ext) && file.size < 2 * 1024 * 1024) {
    const content = await readFileAsText(file);
    return { type: "text", content };
  }

  const b64 = await readFileAsBase64(file);

  // Images — Claude vision
  if (IMAGE_TYPES.has(ext)) {
    const data = await post({
      max_tokens: 1000,
      system:     "Extract all visible text and key information from this image thoroughly.",
      messages: [{
        role:    "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mimeType, data: b64 } },
          { type: "text",  text:   "Extract all text, numbers, tables and key data visible in this image." },
        ],
      }],
    });
    return { type: "text", content: extractText(data) };
  }

  // PDFs — Claude document API
  if (ext === "pdf") {
    const data = await post({
      max_tokens: 2000,
      system:     "Extract all text and structured information from this PDF document.",
      messages: [{
        role:    "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
          { type: "text",     text:   "Extract all text, numbers, tables and key information." },
        ],
      }],
    });
    return { type: "text", content: extractText(data) };
  }

  // DOCX / PPTX / XLSX — describe the file and ask Claude to extract from structure
  // We cannot send raw binary base64 as a text prompt; instead we instruct Claude
  // to extract what it can from the metadata + ask the user to paste key content.
  // For proper Office parsing, a server-side library (mammoth, xlsx) would be needed.
  const data = await post({
    max_tokens: 800,
    system:     "You help extract information from office documents.",
    messages: [{
      role:    "user",
      content: `The user uploaded a ${ext.toUpperCase()} file named "${file.name}" (${(file.size/1024).toFixed(0)} KB).
Since binary Office files cannot be decoded from base64 in this context, please acknowledge the file
and ask the user to paste the key content (text from slides, financial data, etc.) so you can analyse it.
Respond in French.`,
    }],
  });
  return {
    type:    "text",
    content: extractText(data) + `\n\n[Fichier : ${file.name} — collez le contenu textuel ci-dessous pour une analyse complète]`,
    needsPaste: true,
  };
}
