# Supabase Auth Email Assessment

Date: 2026-06-13

This assessment reviews the current Supabase Auth Send Email Hook implementation that sends custom auth emails through Resend using React Email.

## Executive Summary

The project is using the right overall architecture:

- Supabase Auth Send Email Hook calls `supabase/functions/send-email/index.ts`.
- The Edge Function verifies the hook payload with `standardwebhooks`.
- React Email renders HTML from `supabase/functions/send-email/_templates/signup-confirmation.tsx`.
- Resend sends the rendered email server-side.

That matches Supabase's recommended pattern for custom auth emails with React Email and Resend. The current implementation is more complete than Supabase's minimal starter for common authentication actions because it switches copy and subjects for several `email_action_type` values.

However, the implementation is not complete for the full Supabase Auth email surface. The main gaps are:

- Missing `reauthentication` handling.
- Partial `email_change` handling, especially Secure Email Change dual-send behavior.
- No proper templates for security notification events if those notifications are enabled.
- Direct Supabase verification links remain vulnerable to email-provider link prefetching.
- Resend sends are not idempotent.
- Email accessibility, deliverability, and sender metadata need hardening.

## Current Implementation

Relevant repo files:

- `supabase/functions/send-email/index.ts`
- `supabase/functions/send-email/_templates/signup-confirmation.tsx`
- `.env.example`
- `app/(Auth)/verify-otp/page.tsx`
- `app/(Auth)/auth/callback/route.ts`
- `docs/supabase/send-email-hook.md`
- `docs/supabase/auth-send-email-hook-react-email-resend.md`
- `docs/supabase/blog-introducing-seven-new-email-templates-for-auth.md`

Current flow:

1. Supabase sends an Auth Hook HTTP request to the Edge Function.
2. The function reads the raw request body with `req.text()`.
3. The function verifies the webhook signature with `new Webhook(hookSecret).verify(payload, headers)`.
4. The function switches on `email_data.email_action_type`.
5. The function renders `SignupConfirmationEmail`.
6. The function calls `resend.emails.send({ from, to, subject, html })`.
7. On success, the function returns an empty JSON response.

Positive findings:

- Webhook verification is present.
- The raw body is used for verification.
- Resend is only used server-side.
- The Resend SDK response is checked for `error`.
- The project uses a verified-looking custom domain sender instead of the tutorial-only `resend.dev` sandbox.
- Auth emails include a primary button and OTP fallback code.
- The Next.js app has a `/verify-otp` page using `supabase.auth.verifyOtp`.

## Email Type Coverage

Supabase Auth email templates are split into authentication emails and security notification emails.

### Authentication Emails

| Dashboard email      | Expected hook type | Current status | Notes                                                         |
| -------------------- | ------------------ | -------------- | ------------------------------------------------------------- |
| Confirm sign up      | `signup`           | Covered        | Rendered with custom subject and copy.                        |
| Invite user          | `invite`           | Covered        | Rendered with custom subject and copy.                        |
| Magic link or OTP    | `magiclink`        | Covered        | Rendered with custom subject and copy.                        |
| Reset password       | `recovery`         | Covered        | Rendered with custom subject and copy.                        |
| Change email address | `email_change`     | Partial        | Does not handle Secure Email Change dual-send mapping.        |
| Reauthentication     | `reauthentication` | Missing        | Falls through to default action template. Should be OTP-only. |

### Security Notification Emails

Security notifications only send if enabled at the Supabase project level. If enabled while the Send Email Hook is active, the Edge Function is responsible for rendering them.

| Dashboard email        | Expected hook type                   | Current status | Notes                                      |
| ---------------------- | ------------------------------------ | -------------- | ------------------------------------------ |
| Password changed       | `password_changed_notification`      | Missing        | Should be informational, not action-based. |
| Email address changed  | `email_changed_notification`         | Missing        | Should include old/new email context.      |
| Phone number changed   | `phone_changed_notification`         | Missing        | Should include old/new phone context.      |
| Sign-in method linked  | `identity_linked_notification`       | Missing        | Should include provider context.           |
| Sign-in method removed | `identity_unlinked_notification`     | Missing        | Should include provider context.           |
| MFA method added       | `mfa_factor_enrolled_notification`   | Missing        | Should include factor type context.        |
| MFA method removed     | `mfa_factor_unenrolled_notification` | Missing        | Should include factor type context.        |

## Findings

### P0: Secure Email Change Is Not Correctly Handled

Evidence:

- `supabase/functions/send-email/index.ts` defines `token_new` and `token_hash_new`, but only destructures and uses `token`, `token_hash`, `redirect_to`, and `email_action_type`.
- The `email_change` branch sends one email to `user.email` with `token_hash`.

Why this matters:

Supabase's Send Email Hook documentation says Secure Email Change can generate two OTP/hash pairs. When enabled, two emails must be sent:

- Current email address: use `token` with `token_hash_new`.
- New email address: use `token_new` with `token_hash`.

The docs also warn that the `_new` suffix is counterintuitive for backward compatibility. Sending a single email with the wrong hash can break email changes or weaken the intended confirmation flow.

Recommended investigation:

- Check whether Secure Email Change is enabled in the Supabase dashboard.
- Extend the hook payload type to include `user.email_new` or whatever field Supabase sends in the current payload.
- Implement dual-send logic for Secure Email Change.
- Implement a single-send fallback for projects where Secure Email Change is disabled.

Sources:

- Local: `docs/supabase/send-email-hook.md`
- Supabase Send Email Hook docs: https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook
- Current code: `supabase/functions/send-email/index.ts`

### P0: `reauthentication` Is Missing

Evidence:

- The current switch handles `signup`, `magiclink`, `recovery`, `invite`, and `email_change`.
- There is no `reauthentication` case.
- Unknown actions fall through to the generic "Action required" template with a confirmation button.

Why this matters:

Supabase lists Reauthentication as a first-class authentication email. It is used before sensitive operations and should ask users to verify their identity, typically with an OTP code. A generic action-link email is the wrong shape for this event.

Recommended investigation:

- Add a `reauthentication` case.
- Render an OTP-focused template with no direct verify button unless Supabase confirms a safe link format for this event.
- Use a subject similar to Supabase's default: "`{{ .Token }} is your verification code`".

Sources:

- Supabase Email Templates docs: https://supabase.com/docs/guides/auth/auth-email-templates
- Current code: `supabase/functions/send-email/index.ts`

### P1: Security Notification Events Are Not Properly Handled

Evidence:

- The current hook has no cases for `password_changed_notification`, `email_changed_notification`, `phone_changed_notification`, `identity_linked_notification`, `identity_unlinked_notification`, `mfa_factor_enrolled_notification`, or `mfa_factor_unenrolled_notification`.
- Supabase's 2025 security notification docs list these hook event types.
- The template default renders a button and OTP code for unknown actions.

Why this matters:

Security notifications are informational alerts, not confirmation actions. If these notifications are enabled in the Supabase dashboard, users may receive misleading emails with action buttons and blank/irrelevant tokens.

Recommended investigation:

- Check which security notifications are enabled in Supabase Auth settings.
- If any are enabled, add a dedicated security notification template.
- Include relevant context from hook payload fields such as `old_email`, `old_phone`, `provider`, and `factor_type`.
- Do not include confirmation buttons or OTP fallback code for notification-only emails.

Sources:

- Local: `docs/supabase/blog-introducing-seven-new-email-templates-for-auth.md`
- Supabase Email Templates docs: https://supabase.com/docs/guides/auth/auth-email-templates
- Current code: `supabase/functions/send-email/index.ts`

### P1: Direct Verification Links Are Vulnerable To Email Prefetching

Evidence:

- `SignupConfirmationEmail` constructs a direct Supabase verification URL:
  `SUPABASE_URL/auth/v1/verify?token=...&type=...&redirect_to=...`
- The email button links directly to that URL.
- The email also includes the OTP code.
- The app has `/verify-otp`, but the email button does not direct users there.

Why this matters:

Supabase documents that some email providers and security systems prefetch email links, including Microsoft Safe Links. Prefetching can consume one-time verification URLs before the user clicks them, causing "Token has expired or is invalid" errors.

Recommended investigation:

- Decide whether the product should be OTP-first for auth emails.
- Option A: Link users to an app page where they enter the OTP; verify with `supabase.auth.verifyOtp`.
- Option B: Link users to an intermediate app confirmation page; the real Supabase verify URL is only requested after an intentional user click.
- Keep the direct Supabase verify link only if the team accepts the prefetch risk.

Sources:

- Supabase Email Templates docs, "Email prefetching": https://supabase.com/docs/guides/auth/auth-email-templates
- Current template: `supabase/functions/send-email/_templates/signup-confirmation.tsx`
- Current OTP page: `app/(Auth)/verify-otp/page.tsx`

### P1: Resend Sends Are Not Idempotent

Evidence:

- `resend.emails.send` is called without an idempotency key.

Why this matters:

Retries can produce duplicate transactional emails. Resend supports idempotency keys for exactly this problem. Auth hooks can be retried when the caller does not receive a successful response, and network or platform timeouts can happen even if Resend already accepted the email.

Recommended investigation:

- Add an idempotency key to each send.
- Use a stable key such as `auth-email/{email_action_type}/{user.id}/{token_hash}` when available.
- For dual-send email changes, use distinct keys for current-email and new-email messages.

Sources:

- Resend Idempotency docs: https://resend.com/docs/dashboard/emails/idempotency-keys
- Resend API Reference: https://resend.com/docs/api-reference/emails/send-email
- Current code: `supabase/functions/send-email/index.ts`

### P1: Redirect URL Is Not Encoded In The Template

Evidence:

- `confirmationUrl` interpolates `redirectTo` directly into the query string.

Why this matters:

Redirect URLs commonly contain their own query strings. Interpolating them directly can corrupt the verification URL or change query parameter boundaries. Supabase treats `RedirectTo` as a URL value, so it should be encoded when constructing a custom link.

Recommended investigation:

- Build the confirmation link with `new URL()` and `searchParams`.
- At minimum, wrap `redirectTo` in `encodeURIComponent`.

Sources:

- Supabase Email Templates docs: https://supabase.com/docs/guides/auth/auth-email-templates
- Current template: `supabase/functions/send-email/_templates/signup-confirmation.tsx`

### P1: Hook Secret Handling Is Inconsistent With The Latest Supabase Guide

Evidence:

- `.env.example` instructs developers to remove the `v1,whsec_` prefix before setting `SEND_EMAIL_HOOK_SECRET`.
- `send-email/index.ts` uses `Deno.env.get("SEND_EMAIL_HOOK_SECRET")` as-is.
- The latest Supabase guide stores the full dashboard value and strips `v1,whsec_` in code.

Why this matters:

Either convention can work, but mixing the conventions causes webhook verification failures. If a developer pastes the full dashboard secret into the environment, the current code will likely fail verification.

Recommended investigation:

- Pick one convention and enforce it.
- Recommended: accept the full dashboard value and strip `v1,whsec_` in code, matching the Supabase guide.
- Update `.env.example` and deployment instructions accordingly.

Sources:

- Local: `docs/supabase/auth-send-email-hook-react-email-resend.md`
- Supabase Custom Auth Emails with React Email and Resend guide: https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook
- Current code: `supabase/functions/send-email/index.ts`
- Current env example: `.env.example`

### P2: Expiration Copy Is Inconsistent

Evidence:

- The email template says "This link will expire in 24 hours."
- The OTP page says "The code will expire in 10 minutes."

Why this matters:

Supabase OTP expiration is configurable. Conflicting expiration copy creates user confusion and support burden.

Recommended investigation:

- Check the Supabase Auth OTP expiry setting.
- Centralize the displayed expiry string in an environment variable or shared constant.
- Use different copy for links and OTPs only if they truly have different TTLs.

Sources:

- Current template: `supabase/functions/send-email/_templates/signup-confirmation.tsx`
- Current OTP page: `app/(Auth)/verify-otp/page.tsx`
- Supabase Email Templates docs: https://supabase.com/docs/guides/auth/auth-email-templates

### P2: Missing Plain-Text Email Body

Evidence:

- The Resend send call provides only `html`.

Why this matters:

Transactional emails should include a plain-text alternative for deliverability, accessibility, and clients that do not render HTML well.

Recommended investigation:

- Generate a `text` body alongside `html`.
- Keep the text body short and action-oriented.
- Include the OTP code and, if still using links, the verification URL.

Sources:

- Resend send email API: https://resend.com/docs/api-reference/emails/send-email
- React Email plain text rendering: https://react.email/docs/utilities/render
- Current code: `supabase/functions/send-email/index.ts`

### P2: Accessibility Metadata Is Missing In React Email Template

Evidence:

- The template renders `<Html>` without `lang` or `dir`.
- `<Head />` is empty and does not include a document title.
- There is no body child wrapper duplicating `lang` and `dir`.

Why this matters:

Email accessibility guidance recommends `lang` and `dir` on both the root HTML element and the direct body child because email clients may strip root attributes. A title and heading structure improve assistive technology and machine summarization.

Recommended investigation:

- Add `lang="en"` and `dir="ltr"` or pass locale/direction into the template.
- Add a `<title>` in the head if React Email supports it cleanly in the current version.
- Ensure layout tables generated by React Email are presentational where applicable.

Sources:

- React Email docs: https://react.email/docs
- Current template: `supabase/functions/send-email/_templates/signup-confirmation.tsx`

### P2: Sender Metadata Needs Production Review

Evidence:

- The sender is `Your App <noreply@joe-taylor.me>`.
- No `replyTo` is set.

Why this matters:

Transactional email guidance prefers a recognizable product/company name and a monitored reply address. `noreply@` can frustrate users who need support after sensitive auth actions.

Recommended investigation:

- Replace "Your App" with the actual product name.
- Consider a sender like `Product Name <auth@mail.joe-taylor.me>` or similar.
- Add `replyTo` pointing to a monitored support address.
- Confirm SPF, DKIM, and DMARC are configured for the sending domain/subdomain.

Sources:

- Resend Domains docs: https://resend.com/docs/dashboard/domains/introduction
- Resend send email API: https://resend.com/docs/api-reference/emails/send-email
- Current code: `supabase/functions/send-email/index.ts`

### P2: Resend Link Tracking Should Be Disabled For Auth Emails

Evidence:

- The assessment did not find code configuring Resend tracking behavior.
- Supabase warns that external email tracking can rewrite auth links and prevent them from working as expected.

Why this matters:

Auth verification links should not be rewritten by tracking services. Link rewriting can break Supabase token verification or interact badly with prefetching systems.

Recommended investigation:

- Check Resend dashboard domain/settings for open and click tracking.
- Disable click tracking for auth/transactional emails that contain Supabase verification links.
- Prefer OTP-first or intermediate-page flows where possible.

Sources:

- Supabase Email Templates docs, "Email tracking": https://supabase.com/docs/guides/auth/auth-email-templates
- Resend Domains docs: https://resend.com/docs/dashboard/domains/introduction

### P2: Resend SDK Version Matches Supabase Starter But Is Behind Current Resend Guidance

Evidence:

- The Edge Function imports `npm:resend@4.0.0`.
- Supabase's starter guide currently shows `resend@4.0.0`.
- Current Resend SDK guidance recommends newer versions for full platform functionality.

Why this matters:

Basic `emails.send` should work, but newer Resend SDK versions include newer APIs and fixes. If the team later adds webhooks, receiving, templates, or additional management operations, the pinned version may become a blocker.

Recommended investigation:

- Verify Deno/Supabase Edge Function compatibility with the latest Resend npm package.
- Upgrade if compatible.
- If keeping `4.0.0`, document that this is following Supabase's starter and only covers basic send behavior.

Sources:

- Supabase Custom Auth Emails with React Email and Resend guide: https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook
- Resend SDK docs: https://resend.com/docs/send-with-nodejs
- Current code: `supabase/functions/send-email/index.ts`

### P3: No Resend Delivery Webhook Or App-Level Suppression Handling

Evidence:

- No Resend webhook endpoint was found for delivery events.
- The current scope only sends emails.

Why this matters:

For production email operations, delivery observability and bounce/complaint handling help with support and sender reputation. Resend handles suppressions internally, but the app currently has no visibility into delivered, bounced, complained, delayed, or suppressed events.

Recommended investigation:

- Add a server-side webhook endpoint for Resend events if email volume or support needs justify it.
- Verify webhook signatures.
- Track `email.bounced`, `email.complained`, `email.delivery_delayed`, and `email.suppressed`.
- Avoid processing inbound email content as trusted input without a separate security design.

Sources:

- Resend Webhooks docs: https://resend.com/docs/dashboard/webhooks/introduction
- Resend Events docs: https://resend.com/docs/dashboard/emails/events

### P3: Local Supabase Hook Configuration Is Not Present

Evidence:

- No `supabase/config.toml` file was found.
- The repo has local Supabase docs, migrations, and functions, but hook configuration may live only in the hosted dashboard.

Why this matters:

Dashboard-only hook configuration is workable, but it makes local reproduction and onboarding harder. A local config can document enabled templates, notification toggles, and hook behavior.

Recommended investigation:

- Decide whether the project should track Supabase local config.
- If yes, add `supabase/config.toml` and document local secrets separately.
- Do not commit real secrets.

Sources:

- Supabase CLI docs: https://supabase.com/docs/guides/cli
- Supabase local development docs: https://supabase.com/docs/guides/local-development

## Recommended Remediation Order

1. Make hook secret handling deterministic and update `.env.example`.
2. Add `reauthentication` as an OTP-only email.
3. Fix `email_change`, including Secure Email Change dual-send behavior.
4. Add idempotency keys to every Resend send.
5. Build verification links safely with `URL`/`URLSearchParams`.
6. Decide whether to switch from direct Supabase verify links to an OTP-first or intermediate confirmation flow.
7. Align expiration copy with Supabase Auth settings.
8. Add plain-text alternatives.
9. Add accessibility metadata to the React Email template.
10. Replace sender branding and add `replyTo`.
11. Check whether security notifications are enabled; implement those templates if needed.
12. Confirm Resend click tracking is disabled for auth emails.
13. Consider upgrading the Resend SDK.
14. Consider adding Resend delivery webhooks for production observability.
15. Consider adding `supabase/config.toml` for local reproducibility.

## Suggested Implementation Shape

The current single shared action template can remain for action emails, but it should not handle every event.

Recommended split:

- `auth-action-email.tsx`: signup, invite, magic link, recovery, email change.
- `reauthentication-email.tsx`: code-only identity verification.
- `security-notification-email.tsx`: informational alerts with contextual details.
- Optional: `email-change.ts` helper to decide one-send vs dual-send behavior.
- Optional: `email-text.ts` helper to generate plain-text bodies for every email.

Recommended send helper:

- Accepts `to`, `subject`, `html`, `text`, and `idempotencyKey`.
- Sets consistent `from` and `replyTo`.
- Checks `{ error }` explicitly.
- Returns structured failures for the Auth Hook response.

## Questions For The Team

- Is Secure Email Change enabled in Supabase Auth?
- Which security notification emails are enabled at the project level?
- What is the actual OTP/link expiration configured in Supabase?
- Should auth emails be link-first, OTP-first, or intermediate-page-first?
- Is Resend click/open tracking enabled for the sending domain?
- What product name and reply-to address should appear in auth emails?
- Should the project track Supabase local configuration in `supabase/config.toml`?
- Is there a support requirement to observe bounced, complained, or delayed emails?

## Source Index

Local source files:

- `supabase/functions/send-email/index.ts`
- `supabase/functions/send-email/_templates/signup-confirmation.tsx`
- `.env.example`
- `app/(Auth)/verify-otp/page.tsx`
- `app/(Auth)/auth/callback/route.ts`
- `docs/supabase/send-email-hook.md`
- `docs/supabase/auth-send-email-hook-react-email-resend.md`
- `docs/supabase/blog-introducing-seven-new-email-templates-for-auth.md`

External references:

- Supabase Send Email Hook: https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook
- Supabase Email Templates: https://supabase.com/docs/guides/auth/auth-email-templates
- Supabase Custom Auth Emails with React Email and Resend: https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook
- Supabase CLI: https://supabase.com/docs/guides/cli
- Supabase Local Development: https://supabase.com/docs/guides/local-development
- Supabase Auth `verifyOtp`: https://supabase.com/docs/reference/javascript/auth-verifyotp
- Resend Send Email API: https://resend.com/docs/api-reference/emails/send-email
- Resend Idempotency Keys: https://resend.com/docs/dashboard/emails/idempotency-keys
- Resend Domains: https://resend.com/docs/dashboard/domains/introduction
- Resend Webhooks: https://resend.com/docs/dashboard/webhooks/introduction
- Resend Events: https://resend.com/docs/dashboard/emails/events
- React Email docs: https://react.email/docs
- React Email render utility: https://react.email/docs/utilities/render
