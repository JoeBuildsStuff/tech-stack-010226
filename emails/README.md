# Auth email templates

React Email templates for the Supabase Auth send-email hook.

**Pinned render stack:** `@react-email/components@1.0.12` (see `package.json` and `supabase/functions/send-email/deno.json`).

## Layout

```
emails/
  templates/           # shared components (Edge Function + previews)
  previews/
    auth-flow/         # maps to docs/auth-flow-screenshots
    security/          # post-change security notifications
    shared.ts          # preview sample data
  export/              # generated static HTML (gitignored)
```

## Preview locally

```bash
pnpm install
pnpm email
```

Open http://localhost:3001. Previews are grouped under **auth-flow** and **security**.

Sample data: `previews/shared.ts`.

## Export static HTML

```bash
pnpm email:export
```

## Auth flow previews

Maps preview files to app screens in `docs/auth-flow-screenshots/v2/`.

| Preview                               | Auth screens                                             | Email sent when               |
| ------------------------------------- | -------------------------------------------------------- | ----------------------------- |
| `auth-flow/flow-signin-magic-link`    | 01-signin, 06-verify-email, 07-verify-otp                | Magic link or OTP sign-in     |
| `auth-flow/flow-signup`               | 05-signup-password, 06-verify-email                      | Password sign-up confirmation |
| `auth-flow/flow-password-reset`       | 03-signin-password-reset, 09-update-password-check-email | Password reset requested      |
| `auth-flow/flow-invite`               | —                                                        | Admin user invite             |
| `auth-flow/flow-email-change-current` | —                                                        | Confirm on current address    |
| `auth-flow/flow-email-change-new`     | —                                                        | Confirm on new address        |
| `auth-flow/flow-reauthentication`     | —                                                        | Sensitive action OTP          |

Screens without a matching email (02-signin-password, 04-signup, 08-update-password) are in-app UI only.

## Security previews

Under `previews/security/`. Sent only when security notification emails are enabled in Supabase.

## Production

The Edge Function at `supabase/functions/send-email/index.ts` imports from `emails/templates/` and renders with `render()` from `@react-email/components@1.0.12`.

```bash
supabase functions deploy send-email --no-verify-jwt
```
