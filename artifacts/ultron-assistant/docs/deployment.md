# ULTRON setup and deployment

## Supabase

1. Create a Supabase project and run `supabase/migrations/202610120001_initial_schema.sql` in its SQL Editor.
2. Enable email/password sign-in in Supabase Authentication. Add the local preview and deployed frontend URLs to the Auth URL configuration and redirect allowlist.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the frontend. Set the matching `SUPABASE_URL` and `SUPABASE_ANON_KEY` on the API server. The anon/publishable key is not a service-role key.
4. Never expose a Supabase service-role key in Vite variables or browser code. Tables use RLS, and the API server checks the bearer session with Supabase before generating a reply.

## Gemini

- Set `GEMINI_API_KEY` as a server-side secret and optionally choose `GEMINI_MODEL`.
- Keep the Gemini key server-side as `GEMINI_API_KEY`; never expose it through a `VITE_` variable or in browser code.
- The API returns an explicit setup error when provider configuration is missing. It does not generate placeholder AI responses.

## Vercel frontend

From the workspace root, use:

- Build command: `pnpm --filter @workspace/ultron-assistant run build`
- Output directory: `artifacts/ultron-assistant/dist/public`
- Install command: `pnpm install --frozen-lockfile`

Set the Vite-prefixed Supabase variables and `VITE_API_BASE_URL` to the separately deployed API server's origin ending in `/api`. The API server needs `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `GEMINI_API_KEY`. Do not put provider keys in any `VITE_` variable.

## Android boundary

The web app only listens while open and after a user gesture and microphone permission. It cannot provide reliable screen-off wake-word monitoring or Android app launching. Those capabilities require a separate Kotlin companion using Android's permission and foreground-service rules. No native wake-word service is included or claimed here.

See [the Android companion plan](./android-companion.md) for the proposed trust boundary and device build checklist.

## Implemented scope and limitations

- Implemented: Vite/React mobile console, Three.js orb where WebGL is available, CSS fallback where it is not, actual microphone frequency analysis, browser speech recognition where supported, local device speech synthesis, Supabase sign-in flows, RLS migration, conversation/settings persistence, and an authenticated Gemini chat endpoint.
- Not implemented: Android wake-word/foreground service or phone actions; AI tool execution, reminders, saved-note workflows, and web search; audio analysis of browser speech-synthesis output; and alternate theme presets.
- Voice choices and speech recognition depend on the device/browser. The app does not clone a cinematic voice. The browser may use its own speech service for recognition; ULTRON does not store raw microphone recordings.
- Apply the Supabase migration and configure the project before testing account persistence or AI chat. The settings screen reports server-side Gemini/Supabase readiness without exposing credentials.

## Release test checklist

- Run `pnpm run typecheck` and `pnpm --filter @workspace/ultron-assistant run build`.
- Apply the migration, then test sign-up, sign-in, sign-out, password reset, and settings/history persistence with two accounts to confirm RLS isolation.
- Test typed chat with a valid Gemini key and expired/invalid sessions; confirm missing configuration produces an explicit error rather than a fabricated response.
- On a supported browser, test microphone permission grant/denial, wake phrase alone and with a request, visible speech transcript, spoken acknowledgement and answer, listening resumption, and emergency stop. Confirm the mic stops when navigating away or shutting down.
- Deploy the API separately, set `VITE_API_BASE_URL` to its `/api` endpoint, and verify the Vercel frontend can reach it over HTTPS.
- Test the native Android checklist separately before claiming background wake or phone controls.
