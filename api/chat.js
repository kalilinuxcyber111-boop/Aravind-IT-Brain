// Aravind IT Brain - serverless backend (Vercel). MIT License.
// Gemini API with timeouts, retry and backup models.

const PRIMARY = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const FALLBACKS = (process.env.GEMINI_FALLBACK_MODELS || "")
  .split(",").map((s) => s.trim()).filter(Boolean);

const SYS =
  "You are Aravind IT Brain, a practical assistant for a desktop support engineer / IT engineer, used on a mobile phone. " +
  "Reply in the same language style the user writes in (if Tanglish, reply in simple Tanglish; if English, English). " +
  "Keep answers short and mobile-friendly: short lines, numbered steps, no tables, no long intros. " +
  "Ask at most one clarifying question only if truly needed. " +
  "Warn before risky actions (data loss, domain/registry changes). " +
  "When screenshots are attached, read the error text and codes exactly.";

const MODES = {
  fix: "Give a step-by-step troubleshooting plan: quick checks first, then deeper fixes, then escalation criteria. Include exact commands or settings paths.",
  ticket: "Turn the details into a clean ticket note: Issue, Troubleshooting done, Resolution, Next steps. Professional and short.",
  reply: "Write a polite, simple email or chat reply to the end user that a non-technical person understands.",
  cmd: "Give the exact command(s) or tool steps (CMD, PowerShell, Windows settings, AD, Intune, Outlook, network) with a one-line explanation each.",
  plan: "Help prioritise my pending tickets and tasks by urgency and impact. Give an ordered plan with time estimates and a short handover note.",
  ask: "Answer as a senior IT mentor would.",
};

const DEEP =
  "DEEP ANALYSIS + WEB SEARCH: search the web for this exact error text/code, prefer official vendor docs (Microsoft Learn, Dell, HP, Lenovo, Cisco etc.). " +
  "Explain what the error means, list likely root causes ranked by probability, give fixes in order, and what to check if it still fails.";

const BUDGET_MS = 50000; // stay under Vercel's 60s limit

async function callModel(model, body, key, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data, msg: (data.error && data.error.message) || "" };
  } catch (e) {
    return { ok: false, status: 504, data: {}, msg: e.name === "AbortError" ? "timeout (model slow)" : e.message };
  } finally {
    clearTimeout(t);
  }
}

module.exports = async (req, res) => {
  const key = process.env.GEMINI_API_KEY;
  const pw = process.env.APP_PASSWORD;

  // Helper: open /api/chat?list=YOUR_PASSWORD to see which models your key can use
  if (req.method === "GET") {
    if (!key) return res.status(500).json({ error: "GEMINI_API_KEY is not set." });
    if (pw && req.query.list !== pw) return res.status(401).json({ error: "Use /api/chat?list=YOUR_PASSWORD" });
    try {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
        headers: { "x-goog-api-key": key },
      });
      const d = await r.json();
      const names = (d.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map((m) => m.name.replace("models/", ""));
      return res.status(200).json({ configured: PRIMARY, models: names });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!key) return res.status(500).json({ error: "GEMINI_API_KEY is not set in Vercel Environment Variables." });
  if (pw && req.headers["x-app-password"] !== pw) return res.status(401).json({ error: "Wrong or missing password." });

  const { messages = [], images = [], deep = false, mode = "fix" } = req.body || {};
  if (!messages.length) return res.status(400).json({ error: "No message." });

  const contents = messages.slice(-12).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: String(m.content || "").slice(0, 8000) }],
  }));
  const last = contents[contents.length - 1];
  last.role = "user";
  last.parts[0].text = "Mode: " + (MODES[mode] || MODES.ask) + (deep ? "\n\n" + DEEP : "") + "\n\nUser: " + last.parts[0].text;
  for (const b64 of images.slice(0, 50)) last.parts.push({ inlineData: { mimeType: "image/jpeg", data: b64 } });

  const body = { systemInstruction: { parts: [{ text: SYS }] }, contents };
  if (deep) body.tools = [{ google_search: {} }];

  const models = [PRIMARY, ...FALLBACKS.filter((m) => m !== PRIMARY)];
  const start = Date.now();
  let lastErr = "AI service error";

  for (const model of models) {
    const remaining = BUDGET_MS - (Date.now() - start);
    if (remaining < 6000) break;
    const out = await callModel(model, body, key, Math.min(20000, remaining - 1000));

    if (out.ok) {
      const cand = out.data.candidates && out.data.candidates[0];
      const text = ((cand && cand.content && cand.content.parts) || []).map((p) => p.text || "").join("").trim();
      const chunks = (cand && cand.groundingMetadata && cand.groundingMetadata.groundingChunks) || [];
      const seen = new Set();
      const sources = chunks
        .map((c) => c.web)
        .filter((w) => w && w.uri && !seen.has(w.uri) && seen.add(w.uri))
        .slice(0, 6)
        .map((w) => ({ title: w.title || w.uri, uri: w.uri }));
      return res.status(200).json({
        text: text || "No answer came back (maybe blocked). Try rephrasing or fewer photos.",
        sources,
      });
    }
    lastErr = model + ": " + (out.msg || "error " + out.status);
    if (out.status === 401 || out.status === 403) return res.status(out.status).json({ error: lastErr });
  }
  return res.status(503).json({ error: "Model busy / slow. Konjam neram kazhichu try pannunga. (" + lastErr + ")" });
};
