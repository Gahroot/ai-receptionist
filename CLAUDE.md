# AI Receptionist

Expo/React Native mobile app + Node.js backend — AI-powered virtual receptionist handling voice calls (Grok Realtime API + Telnyx PSTN), SMS messages, and contact management.

## Project Structure

```
app/                          # Expo Router file-based routing
  ├── _layout.tsx             # Root layout (TamaguiProvider + auth gate)
  ├── (auth)/                 # Auth flow: login, register, onboarding
  ├── (tabs)/                 # Bottom tabs: Home, Calls, Messages, Contacts, Settings
  └── call/[callId].tsx       # Full-screen voice call modal
hooks/                        # useVoiceSession (WebSocket), useNotifications (push)
services/                     # api.ts (Axios), audioService, audioPlaybackService
stores/                       # Zustand stores: auth, call, notification
components/                   # Reusable UI components
constants/                    # api.ts (endpoints), theme.ts (Tamagui theme)
lib/                          # types.ts, tamagui-overrides.d.ts
backend/src/                  # Node.js/Express backend
  ├── db/                     # Drizzle ORM schema, migrations, seed
  ├── routes/                 # API route handlers (auth, voice, calls, etc.)
  ├── services/               # voiceBridge, telnyxApi, pushNotifications
  ├── middleware/              # JWT auth, Zod validation
  └── lib/                    # jwt, password, audio codec, errors
__tests__/                    # Jest tests (integration, hooks, services, stores)
```

## Tech Stack

- **Frontend:** Expo ~54, React Native 0.81, expo-router ~6, Tamagui v2 RC, Zustand
- **Backend:** Node.js, Express, Drizzle ORM, PostgreSQL, jose (JWT), Zod
- **Voice:** Grok Realtime API (direct WebSocket), Telnyx (inbound PSTN)
- **Audio:** @siteed/expo-audio-studio (PCM16 capture), expo-audio (playback)
- **TypeScript:** Strict mode, path alias `@/*` → project root

## Organization Rules

- **Screens** → `app/` via expo-router file conventions
- **Hooks** → `hooks/`, one hook per file
- **Services** → `services/`, one service per concern
- **Stores** → `stores/`, one Zustand store per domain
- **Types** → `lib/types.ts` or co-located
- **Components** → `components/`, one component per file
- Single responsibility per file. Avoid monolithic files.

## Code Quality - Zero Tolerance

After editing ANY frontend file, run:

```bash
npm run typecheck && npm run lint
```

After editing ANY backend file, run:

```bash
cd backend && npm run typecheck && npm run lint
```

Fix ALL errors and warnings before continuing.

Start dev servers:

```bash
npx expo start              # Frontend
cd backend && npm run dev   # Backend (tsx watch)
```

## Key Patterns

- Auth: JWT in SecureStore, OAuth2 login (form-urlencoded), auto-refresh on 401
- Backend routes: `/api/v1/workspaces/{workspace_id}/...`
- User IDs are integers; workspace/agent IDs are UUIDs
- Voice: App gets ephemeral token → connects directly to `wss://api.x.ai/v1/realtime`
- Inbound calls: Telnyx → backend webhook → VoiceBridge (Telnyx ↔ codec ↔ Grok)
- Audio: PCM16 24kHz mono (Grok native), mu-law 8kHz (Telnyx PSTN)
- Tamagui v2 RC has type issues with Button `color` prop — works at runtime
- Push notifications require EAS dev build (not Expo Go)
