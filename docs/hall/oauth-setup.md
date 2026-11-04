# Hall OAuth setup

The Hall uses Supabase Auth for GitHub/Google identity and server-validated sessions. Website and repository scanning remain public. This document does not configure or deploy external services.

## Application configuration

Set these placeholders in local `.env.local` and separately in the existing Vercel project's environment settings:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<supabase-publishable-key>
AUTH_SITE_URL=http://localhost:3000
```

Use the project URL and publishable key from the Supabase project settings. The publishable key is intended for clients; it is not a service-role key. Do not add a service-role key to this application. Do not commit `.env.local`, provider secrets, tokens or cookies. The two `NEXT_PUBLIC_` values are build-time client configuration: rebuild when changing them.

`AUTH_SITE_URL` is the exact trusted application origin for the current environment. Local testing may use `http://127.0.0.1:3000` instead of localhost, but choose one consistently for the browser, callback and environment variable because PKCE cookies are origin-bound. Production uses the existing verified Vercel origin, not an invented custom domain or a request-supplied host.

The supported Supabase SSR browser/server integration uses browser-readable session cookies so the browser SDK can initiate PKCE and maintain the session. They are not HttpOnly cookies. Use HTTPS (Secure cookies in deployed environments), SameSite=Lax and a narrow application origin; server-side `getUser()` validation remains mandatory. This does not protect a stolen token from an XSS vulnerability: keep untrusted markup out of the UI and never log or expose cookie values. Provider API refresh tokens are unnecessary for this identity-only application.

## Supabase project

1. Create/select the intended Supabase project. No Hall database tables or storage buckets are needed in V1.
2. Under Authentication → URL configuration, set the Site URL to the verified application origin.
3. Add exact application redirect URLs for each supported environment: `http://localhost:3000/auth/callback` (or the consistently chosen loopback origin), the existing verified Vercel origin plus `/auth/callback`, and later the verified SourceSanity domain plus `/auth/callback`.
4. If the application includes a validated `next` query on callbacks, allow that query variant using Supabase's documented redirect matching, constrained to the exact callback path/origin. Do not allow arbitrary hosts. Keep deployment preview access restricted to explicitly approved previews rather than a broad production wildcard.
5. Enable only GitHub and Google for the UI in this milestone. Password login is not implemented. Provider settings/secrets stay in Supabase, not browser env values.

There are **two different callbacks**: GitHub/Google return to Supabase at `https://<project-ref>.supabase.co/auth/v1/callback`; Supabase then returns to this app's `/auth/callback`, where the PKCE code is exchanged and the internal Hall destination is validated.

## GitHub OAuth

1. Register a GitHub OAuth application for the intended Supabase project/environment.
2. Use the Supabase provider callback shown in the dashboard as GitHub's authorization callback URL.
3. Store the GitHub client ID/secret in Supabase Authentication → Providers → GitHub.
4. Login needs identity only. Never request `repo`, repository installation access, organization administration or write permissions for Hall login. Any future ownership-verification GitHub App is separate from identity login.
5. Verify the actual consent screen and granted identity scopes before release; GitHub/provider defaults must not unexpectedly broaden permissions.

## Google OAuth

1. Create/select a Google Cloud project and configure its OAuth consent screen, branding and authorized test users while in testing mode.
2. Create a Web application OAuth client. Set the authorized redirect URI to the Supabase provider callback shown in the dashboard.
3. If Google configuration requests JavaScript origins, add only the verified origins required by the chosen flow; do not add unrelated domains.
4. Store the Google client ID/secret in Supabase Authentication → Providers → Google.
5. Request only `openid email profile`. No Gmail, Drive, Calendar or unrelated scopes. Resolve consent/publishing requirements in Google before public launch.

## Existing Vercel and future domain

Do not rename the current Vercel project or change its secrets automatically. Add reviewed environment values to the appropriate Preview/Production scopes, checking origin alignment. A new custom domain requires verified ownership, HTTPS, exact Supabase application callback allowlist updates, `AUTH_SITE_URL` update and rebuild. Keep old callbacks only for intentional supported environments; remove obsolete preview callbacks.

## Verification checklist — live configuration pending

- [ ] GitHub login completes from the actual local origin and returns to the requested Hall collection/case/locale.
- [ ] Google login completes with identity-only consent and correct callback.
- [ ] Refresh/reload restores a valid session; revoked/expired sessions return to a recoverable login screen.
- [ ] Logout clears the application session; direct Hall/API requests then fail authorization.
- [ ] Malicious `next` targets cannot escape the internal Hall allowlist.
- [ ] No codes/tokens/cookies appear in logs, analytics or UI.
- [ ] Repeat on the existing Vercel deployment after separately authorized deployment/configuration.

CI uses mocked external OAuth/Supabase responses. Mock-backed tests are not proof of live provider setup. Do not mark these boxes complete without actual provider credentials and observed successful journeys. Missing configuration should display a setup-unavailable message rather than break public scanners.

## Official integration references

- [Supabase server-side clients and refresh](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [PKCE code exchange](https://supabase.com/docs/guides/auth/sessions/pkce-flow)
- [GitHub identity provider](https://supabase.com/docs/guides/auth/social-sign-in/auth-github)
- [Google identity provider](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)
- [Next.js proxy convention](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)

The application deliberately uses a stricter return-destination allowlist than generic documentation snippets: no forwarded-host redirect and no arbitrary slash-prefixed target.
