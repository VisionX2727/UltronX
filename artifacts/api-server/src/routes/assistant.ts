import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { SendAssistantMessageBody, SendAssistantMessageResponse } from "@workspace/api-zod";
import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const chatRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait a moment before trying again." },
});

router.get("/assistant/status", (_req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);
  const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

  res.json({
    status: geminiConfigured && supabaseConfigured ? "ready" : "needs_setup",
    provider: "google_gemini",
    geminiConfigured,
    supabaseConfigured,
  });
});

router.post("/assistant/chat", chatRateLimit, async (req, res) => {
  const parsed = SendAssistantMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "The message or assistant settings are invalid." });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    res.status(503).json({
      error: "Supabase is not configured. Add the project URL and publishable key to enable signed-in assistant requests.",
    });
    return;
  }

  const authorization = req.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token || token.length > 8_000) {
    res.status(401).json({ error: "Sign in to use the assistant." });
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    res.status(401).json({ error: "Your session is invalid or expired. Sign in again." });
    return;
  }

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    res.status(503).json({ error: "Gemini is not configured. Add GEMINI_API_KEY in project secrets." });
    return;
  }

  try {
    const { message, history, assistantName, personality, personalityIntensity, humourLevel } = parsed.data;
    const assistant = new GoogleGenAI({
      apiKey: geminiApiKey,
      httpOptions: { timeout: 30_000 },
    });
    const systemInstruction = [
      `You are ${assistantName}, a personal AI assistant.`,
      "Be intelligent, calm, sophisticated, confident, and genuinely helpful.",
      "Use concise British-style phrasing where natural. Do not force catchphrases.",
      `Personality mode: ${personality}. Personality intensity: ${personalityIntensity}/100. Humour level: ${humourLevel}/100.`,
      "Use humour only when it suits the context. Treat serious requests seriously.",
      "Never claim to have opened an app, changed a device setting, sent a message, saved a note, or performed another external action unless an available tool actually confirms it.",
      "No phone-control tools are currently available. Explain that limitation and offer a useful alternative.",
    ].join(" ");
    const contents = [
      ...history.map((turn) => ({
        role: turn.role === "assistant" ? "model" : "user",
        parts: [{ text: turn.content }],
      })),
      { role: "user", parts: [{ text: message }] },
    ];
    const result = await assistant.models.generateContent({
      model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
      contents,
      config: {
        systemInstruction,
        maxOutputTokens: 8192,
      },
    });
    const reply = result.text?.trim();
    if (!reply) {
      res.status(502).json({ error: "Gemini returned an empty reply. Please try again." });
      return;
    }

    res.json(SendAssistantMessageResponse.parse({ message: reply }));
  } catch (error) {
    logger.warn(
      { errorType: error instanceof Error ? error.name : "unknown" },
      "Assistant provider request failed",
    );
    res.status(502).json({
      error: "The assistant could not reach Gemini. Check your connection and try again.",
    });
  }
});

export default router;
