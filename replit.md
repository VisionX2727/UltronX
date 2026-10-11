# ULTRON — Personal AI Assistant

A mobile-first, browser-based AI voice assistant with a reactive 3D core, Supabase-backed accounts and conversation data, and an authenticated Gemini API.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Frontend: `pnpm --filter @workspace/ultron-assistant run dev`
- Required app configuration: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; API server also accepts `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Gemini calls need server-side `GEMINI_API_KEY`.
- Vercel and Supabase setup: `artifacts/ultron-assistant/docs/deployment.md`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- Auth/data: Supabase Auth, PostgreSQL, and Row Level Security
- AI: Google Gemini through the server-side API
- Frontend: React, TypeScript, Vite, Tailwind CSS, Three.js / React Three Fiber
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/ultron-assistant/src/pages/` — console, account, and settings screens
- `artifacts/ultron-assistant/src/components/Sphere.tsx` — 3D energy core
- `artifacts/ultron-assistant/supabase/migrations/` — Supabase schema and RLS
- `artifacts/api-server/src/routes/assistant.ts` — authenticated Gemini chat endpoint
- `lib/api-spec/openapi.yaml` — source of truth for generated API types

## Architecture decisions

- The browser is a frontend only; Vercel serves its static Vite build while the API is deployed separately.
- Supabase sessions are verified server-side before Gemini requests; user data relies on RLS and never uses a service-role key in the browser.
- Browser microphone capture starts only after a user gesture. Persistent wake-word monitoring and Android actions require a separate native Kotlin companion.
- The Gemini API secret is consumed only by the server. Keep it out of `VITE_` variables.

## Product

- Users can chat by typing or browser speech recognition, hear replies through an available device voice, save conversations/settings to Supabase, and inspect the real mic waveform on the 3D core.
- Native wake-word monitoring and phone control are not implemented in the web app.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
