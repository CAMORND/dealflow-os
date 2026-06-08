/**
 * api.js — All Claude API calls go through /api/claude (Vercel proxy).
 * Never calls Anthropic directly from the browser (CORS fix).
 * Adds no-training flag server-side.
 */

const PROXY = "/api/claude";

async function post(payload) {
  const res = await fetch(PROXY, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return res.json();
}

/** Extract all text blocks from an Anthropic response */
function text(data) {
  return (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Call Claude, get raw text back */
export async function callClaude(prompt, system, opts = {}) {
  const data = await post({
    system,
    max_tokens:  opts.maxTokens || 1200,
    use_gmail:   opts.useGmail  || false,
    messages:    [{ role: "user", content: prompt }],
  });
  return text(data);
}

/** Call Claude, parse JSON response (strips markdown fences) */
export async function callClaudeJSON(prompt, system, opts = {}) {
  const raw = await callClaude(
    prompt,
    (system || "") + "\nReturn ONLY valid JSON — no markdown fences, no prose.",
    opts
  );
  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    console.error("JSON parse failed:", raw.slice(0, 200));
    return null;
  }
}

/** Load Gmail emails via MCP (server-side only) */
export async function loadGmailEmails() {
  const data = await post({
    use_gmail:  true,
    max_tokens: 2000,
    system:     "You are a Gmail assistant. Fetch emails and return structured JSON only.",
    messages: [{
      role:    "user",
      content: `Fetch the 20 most recent emails from Gmail. 
For each email return a JSON object with these exact fields:
id, fromName, fromEmail, subject, date (ISO 8601), bodySnippet (first 300 chars of body), 
hasAttachments (boolean), attachments (array of {name, mimeType, size}).
Return a JSON array only — no prose, no markdown.`,
    }],
  });

  const raw = text(data).replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

/** Read a file and return base64 + mimeType for Claude vision */
export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Extract text from a file using Claude vision/document API */
export async function extractFileContent(file) {
  const MAX_TEXT = 5 * 1024 * 1024; // 5 MB text files read directly
  const ext = file.name.split(".").pop().toLowerCase();
  const textTypes = ["txt", "md", "csv", "json", "xml", "html", "eml"];

  if (textTypes.includes(ext) && file.size < MAX_TEXT) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload  = () => resolve({ type: "text", content: r.result });
      r.onerror = reject;
      r.readAsText(file);
    });
  }

  // For binary files (PDF, DOCX, PPTX, XLS, images) — send to Claude as base64
  const b64      = await readFileAsBase64(file);
  const mimeType = file.type || guessMime(ext);

  // Images: use vision
  if (["jpg","jpeg","png","gif","webp"].includes(ext)) {
    const data = await post({
      max_tokens: 1000,
      system:     "Extract all text and key information visible in this image. Be thorough.",
      messages: [{
        role:    "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mimeType, data: b64 } },
          { type: "text",  text:   "Extract all text and structured information from this image." },
        ],
      }],
    });
    return { type: "text", content: text(data) };
  }

  // PDFs: use document API
  if (ext === "pdf") {
    const data = await post({
      max_tokens: 2000,
      system:     "Extract all text content from this PDF. Preserve structure.",
      messages: [{
        role:    "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
          { type: "text",     text:   "Extract all text, numbers, and key information from this document." },
        ],
      }],
    });
    return { type: "text", content: text(data) };
  }

  // DOCX / PPTX / XLS — ask Claude to interpret base64 with context
  const data = await post({
    max_tokens: 1500,
    system:     "You receive a base64-encoded office document. Extract its key content as plain text.",
    messages: [{
      role:    "user",
      content: `This is a ${ext.toUpperCase()} file named "${file.name}" encoded in base64. 
Extract all readable text, tables, and key data from it. 
Base64 data: ${b64.slice(0, 50000)}`,  // Claude context limit safety
    }],
  });
  return { type: "text", content: text(data) };
}

function guessMime(ext) {
  const map = {
    pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg",
    png: "image/png", gif: "image/gif", webp: "image/webp",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    txt: "text/plain", csv: "text/csv", eml: "message/rfc822",
  };
  return map[ext] || "application/octet-stream";
}
