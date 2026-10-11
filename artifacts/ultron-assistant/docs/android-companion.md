# Planned Android companion

**Status: architecture only.** There is no Kotlin app, wake-word model, foreground service, APK, or Android action bridge in this repository yet. The browser app must not be described as listening with its screen off.

## Recommended boundary

- Keep the Android companion as a separate Kotlin/Gradle application. The Vite website remains the account, conversation, and settings UI.
- Run wake-word detection locally on-device. Do not stream microphone audio while waiting for the wake phrase.
- Candidate local engines include Picovoice Porcupine (check its license and access-key requirements) or an on-device openWakeWord/ONNX Runtime implementation. Select only after testing Android packaging, model licensing, battery use, and supported devices.
- After a detected wake phrase, the companion can open ULTRON or send an authenticated request to the API. It must use the signed-in user's short-lived Supabase access token; never embed the Gemini key or Supabase service-role key in the APK.
- Keep device actions on a strict allowlist. Validate every request, show the action to the user, and require confirmation for sensitive actions. If an action is unavailable, report that rather than claiming success.

## Android service requirements

Use an explicit user action in the visible app to start monitoring. Request runtime microphone permission and, on Android 13+, notification permission. Start a foreground service with the `microphone` service type and a persistent notification that has a Stop action. Stop the recorder and release audio/model resources immediately when the user stops monitoring, signs out, or shuts down ULTRON.

Declare only the permissions needed by the chosen target SDK, including `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_MICROPHONE` where required. Do not bypass permission prompts or battery controls. Do not start microphone monitoring automatically after reboot; Android background-start restrictions apply, and any restart behavior needs an explicit, policy-compliant design.

For an embedded web UI, prefer AndroidX WebKit `WebMessageListener` with a strict HTTPS origin allowlist and a small, versioned JSON message schema. Validate every message on both sides. Do not expose a broad `addJavascriptInterface` bridge to arbitrary pages, accept executable code, or put tokens in URLs. An even smaller design is to keep authentication and API requests entirely native and expose only state and approved actions to the web UI.

## Build and device verification

1. Create a separate Kotlin Android Studio project and document its minimum SDK, target SDK, model license, and required permissions.
2. Implement start/stop, persistent notification, local wake detection, authentication handoff, and the allowlisted actions before packaging a release.
3. Build a debug package with `./gradlew assembleDebug`, install it on a physical Android device, and test microphone denial, screen-off behavior, Doze, battery saver, notification stop, sign-out, network loss, and reboot.
4. Do not claim screen-off wake support until those tests pass on the supported device/Android versions.
