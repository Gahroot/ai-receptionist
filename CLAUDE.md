# AI Receptionist

Expo/React Native mobile app that acts as an AI-powered receptionist — handling incoming calls via WebSocket voice sessions, SMS messages, and contact management. Connects to a FastAPI backend.

## Project Structure

```
app/                          # Expo Router file-based routing
  ├── _layout.tsx             # Root layout (TamaguiProvider + auth gate)
  ├── ai-search.tsx           # AI search modal
  ├── (auth)/                 # Auth flow: login, register, onboarding (6 steps)
  ├── (tabs)/                 # Bottom tabs: Home, Calls, Messages, Contacts, Settings
  │   ├── calls/              # Call history list + detail with transcript/recording
  │   ├── messages/           # SMS conversations + GiftedChat thread
  │   ├── contacts/           # Contact list + detail with edit
  │   └── settings/           # AI config, hours, forwarding, notifications, account
  └── call/[callId].tsx       # Full-screen voice call modal
hooks/                        # useVoiceSession (WebSocket), useNotifications (push)
services/                     # api.ts (Axios), audioService, audioPlaybackService, notificationService
stores/                       # Zustand stores: auth, call, notification (AsyncStorage persist)
constants/                    # api.ts (endpoints), theme.ts (Tamagui theme)
lib/                          # types.ts, tamagui-overrides.d.ts
assets/                       # App icons, splash screens
```

## Tech Stack

- **Framework:** Expo ~54, React Native 0.81, expo-router ~6
- **UI:** Tamagui v2 RC, Lucide icons, Reanimated, Gesture Handler
- **State:** Zustand + AsyncStorage + expo-secure-store (auth tokens)
- **API:** Axios with JWT auth interceptors, WebSocket voice sessions
- **Audio:** @siteed/expo-audio-stream (PCM16 capture), expo-av (playback)
- **Chat:** react-native-gifted-chat
- **TypeScript:** Strict mode, path alias `@/*` → project root

## Organization Rules

- **Screens** → `app/` via expo-router file conventions
- **Hooks** → `hooks/`, one hook per file
- **Services** → `services/`, one service per concern (API, audio, notifications)
- **Stores** → `stores/`, one Zustand store per domain
- **Types** → `lib/types.ts` or co-located
- **Components** → `components/`, one component per file
- Single responsibility per file. Avoid monolithic files.

## Code Quality - Zero Tolerance

After editing ANY file, run:

```bash
npm run typecheck && npm run lint
```

Fix ALL errors and warnings before continuing.

Start the dev server with:

```bash
npx expo start
```

## Key Patterns

- Auth: JWT in SecureStore, OAuth2 login (form-urlencoded), auto-refresh on 401
- Backend routes: `/api/v1/workspaces/{workspace_id}/...`
- User IDs are integers; workspace/agent IDs are UUIDs
- Voice: WebSocket to `/voice/test/{wid}/{aid}`, PCM16 base64 over JSON
- Tamagui v2 RC has type issues with Button `color` prop — works at runtime
- Push notifications require EAS dev build (not Expo Go)
