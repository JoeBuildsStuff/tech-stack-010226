import React from "npm:react@18.3.1";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { Resend } from "npm:resend@6.12.4";
import { render } from "@react-email/components";
import { AuthActionEmail } from "../../../emails/templates/auth-action-email.tsx";
import { ReauthenticationEmail } from "../../../emails/templates/reauthentication-email.tsx";
import { SecurityNotificationEmail } from "../../../emails/templates/security-notification-email.tsx";

const resend = new Resend(Deno.env.get("RESEND_API_KEY") as string);

const rawHookSecret = Deno.env.get("SEND_EMAIL_HOOK_SECRET") ?? "";
const hookSecret = rawHookSecret.replace(/^v1,whsec_/, "");

const productName = Deno.env.get("AUTH_EMAIL_PRODUCT_NAME") ?? "Your App";
const fromAddress =
  Deno.env.get("AUTH_EMAIL_FROM") ?? `${productName} <noreply@joe-taylor.me>`;
const replyTo = Deno.env.get("AUTH_EMAIL_REPLY_TO") ?? undefined;
const expiryCopy =
  Deno.env.get("AUTH_EMAIL_EXPIRY_COPY") ??
  "This code expires soon. Request a new email if it no longer works.";
const appUrl =
  Deno.env.get("AUTH_EMAIL_APP_URL") ??
  Deno.env.get("SITE_URL") ??
  Deno.env.get("SUPABASE_SITE_URL") ??
  "http://localhost:3000";

const authActionTypes = new Set([
  "signup",
  "magiclink",
  "recovery",
  "invite",
  "email_change",
]);

const securityNotificationTypes = new Set([
  "password_changed_notification",
  "email_changed_notification",
  "phone_changed_notification",
  "identity_linked_notification",
  "identity_unlinked_notification",
  "mfa_factor_enrolled_notification",
  "mfa_factor_unenrolled_notification",
]);

interface EmailPayload {
  user: {
    id: string;
    email: string;
    email_new?: string;
    user_metadata?: {
      full_name?: string;
    };
  };
  email_data: {
    token?: string;
    token_hash?: string;
    redirect_to?: string;
    email_action_type: string;
    site_url?: string;
    token_new?: string;
    token_hash_new?: string;
    old_email?: string;
    old_phone?: string;
    provider?: string;
    factor_type?: string;
  };
}

interface SendJob {
  to: string;
  subject: string;
  component: React.ReactElement;
  idempotencyKey: string;
}

const resendRetryDelaysMs = [1000, 2000];

function getErrorName(error: unknown) {
  if (!error || typeof error !== "object" || !("name" in error)) {
    return "";
  }

  return String((error as { name?: unknown }).name ?? "");
}

function getErrorStatus(error: unknown) {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const { statusCode, status } = error as {
    statusCode?: unknown;
    status?: unknown;
  };
  const value = typeof statusCode === "number" ? statusCode : status;

  return typeof value === "number" ? value : undefined;
}

function isRetryableResendError(error: unknown) {
  const name = getErrorName(error);
  const status = getErrorStatus(error);

  return (
    name === "rate_limit_exceeded" ||
    name === "api_error" ||
    status === 429 ||
    (typeof status === "number" && status >= 500)
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAuthActionSubject(actionType: string, token?: string) {
  switch (actionType) {
    case "signup":
      return "Confirm your email";
    case "magiclink":
      return "Your login code";
    case "recovery":
      return "Reset your password";
    case "invite":
      return "You've been invited";
    case "email_change":
      return "Confirm your email change";
    case "reauthentication":
      return token
        ? `${token} is your verification code`
        : "Verify your identity";
    default:
      return "Action required";
  }
}

function getSecurityNotificationSubject(actionType: string) {
  switch (actionType) {
    case "password_changed_notification":
      return "Your password was changed";
    case "email_changed_notification":
      return "Your email address was changed";
    case "phone_changed_notification":
      return "Your phone number was changed";
    case "identity_linked_notification":
      return "A sign-in method was linked";
    case "identity_unlinked_notification":
      return "A sign-in method was removed";
    case "mfa_factor_enrolled_notification":
      return "A multi-factor authentication method was added";
    case "mfa_factor_unenrolled_notification":
      return "A multi-factor authentication method was removed";
    default:
      return "Security notification";
  }
}

function buildVerifyOtpUrl(
  recipientEmail: string,
  actionType: string,
  redirectTo?: string
) {
  const url = new URL("/verify-otp", appUrl);
  url.searchParams.set("email", recipientEmail);
  url.searchParams.set("type", actionType);

  if (redirectTo) {
    url.searchParams.set("next", redirectTo);
  }

  return url.toString();
}

function stableTokenPart(...parts: Array<string | undefined>) {
  return parts.find((part) => part && part.length > 0) ?? "no-token";
}

function buildActionComponent(args: {
  actionType: string;
  token?: string;
  recipientEmail: string;
  redirectTo?: string;
  userName?: string;
  audience?: "current" | "new";
}) {
  return React.createElement(AuthActionEmail, {
    productName,
    emailActionType: args.actionType,
    verifyUrl: buildVerifyOtpUrl(
      args.recipientEmail,
      args.actionType,
      args.redirectTo
    ),
    token: args.token ?? "",
    userName: args.userName,
    expiryCopy,
    audience: args.audience,
  });
}

function buildEmailChangeJobs(payload: EmailPayload) {
  const { user, email_data } = payload;
  const jobs: SendJob[] = [];
  const hasSecureEmailChange =
    Boolean(email_data.token) &&
    Boolean(email_data.token_hash_new) &&
    Boolean(email_data.token_new) &&
    Boolean(email_data.token_hash) &&
    Boolean(user.email_new);

  if (hasSecureEmailChange) {
    jobs.push({
      to: user.email,
      subject: getAuthActionSubject("email_change"),
      component: buildActionComponent({
        actionType: "email_change",
        token: email_data.token,
        recipientEmail: user.email,
        redirectTo: email_data.redirect_to,
        userName: user.user_metadata?.full_name,
        audience: "current",
      }),
      idempotencyKey: `auth-email/email_change/${user.id}/current/${stableTokenPart(
        email_data.token_hash_new,
        email_data.token
      )}`,
    });

    jobs.push({
      to: user.email_new as string,
      subject: getAuthActionSubject("email_change"),
      component: buildActionComponent({
        actionType: "email_change",
        token: email_data.token_new,
        recipientEmail: user.email_new as string,
        redirectTo: email_data.redirect_to,
        userName: user.user_metadata?.full_name,
        audience: "new",
      }),
      idempotencyKey: `auth-email/email_change/${user.id}/new/${stableTokenPart(
        email_data.token_hash,
        email_data.token_new
      )}`,
    });

    return jobs;
  }

  const recipient = user.email_new ?? user.email;
  jobs.push({
    to: recipient,
    subject: getAuthActionSubject("email_change"),
    component: buildActionComponent({
      actionType: "email_change",
      token: email_data.token_new ?? email_data.token,
      recipientEmail: recipient,
      redirectTo: email_data.redirect_to,
      userName: user.user_metadata?.full_name,
      audience: user.email_new ? "new" : undefined,
    }),
    idempotencyKey: `auth-email/email_change/${user.id}/single/${stableTokenPart(
      email_data.token_hash,
      email_data.token_hash_new,
      email_data.token_new,
      email_data.token
    )}`,
  });

  return jobs;
}

function buildSendJobs(payload: EmailPayload) {
  const { user, email_data } = payload;
  const actionType = email_data.email_action_type;

  if (actionType === "email_change") {
    return buildEmailChangeJobs(payload);
  }

  if (authActionTypes.has(actionType)) {
    return [
      {
        to: user.email,
        subject: getAuthActionSubject(actionType),
        component: buildActionComponent({
          actionType,
          token: email_data.token,
          recipientEmail: user.email,
          redirectTo: email_data.redirect_to,
          userName: user.user_metadata?.full_name,
        }),
        idempotencyKey: `auth-email/${actionType}/${user.id}/primary/${stableTokenPart(
          email_data.token_hash,
          email_data.token
        )}`,
      },
    ];
  }

  if (actionType === "reauthentication") {
    return [
      {
        to: user.email,
        subject: getAuthActionSubject(actionType, email_data.token),
        component: React.createElement(ReauthenticationEmail, {
          productName,
          token: email_data.token ?? "",
          userName: user.user_metadata?.full_name,
          expiryCopy,
        }),
        idempotencyKey: `auth-email/reauthentication/${user.id}/primary/${stableTokenPart(
          email_data.token_hash,
          email_data.token
        )}`,
      },
    ];
  }

  if (securityNotificationTypes.has(actionType)) {
    return [
      {
        to: user.email,
        subject: getSecurityNotificationSubject(actionType),
        component: React.createElement(SecurityNotificationEmail, {
          productName,
          emailActionType: actionType,
          userName: user.user_metadata?.full_name,
          oldEmail: email_data.old_email,
          newEmail: user.email_new,
          oldPhone: email_data.old_phone,
          provider: email_data.provider,
          factorType: email_data.factor_type,
          supportEmail: replyTo,
        }),
        idempotencyKey: `auth-email/${actionType}/${user.id}/notification/${stableTokenPart(
          email_data.old_email,
          email_data.old_phone,
          email_data.provider,
          email_data.factor_type
        )}`,
      },
    ];
  }

  return [
    {
      to: user.email,
      subject: getAuthActionSubject(actionType),
      component: buildActionComponent({
        actionType,
        token: email_data.token,
        recipientEmail: user.email,
        redirectTo: email_data.redirect_to,
        userName: user.user_metadata?.full_name,
      }),
      idempotencyKey: `auth-email/${actionType}/${user.id}/fallback/${stableTokenPart(
        email_data.token_hash,
        email_data.token
      )}`,
    },
  ];
}

async function sendEmail(job: SendJob) {
  const html = await render(job.component);
  const text = await render(job.component, { plainText: true });

  for (let attempt = 0; attempt <= resendRetryDelaysMs.length; attempt++) {
    const { error } = await resend.emails.send(
      {
        from: fromAddress,
        to: [job.to],
        subject: job.subject,
        html,
        text,
        replyTo,
      },
      { idempotencyKey: job.idempotencyKey }
    );

    if (!error) {
      return;
    }

    if (
      attempt === resendRetryDelaysMs.length ||
      !isRetryableResendError(error)
    ) {
      console.error("Resend error:", error);
      throw error;
    }

    const delayMs = resendRetryDelaysMs[attempt];
    console.warn(`Retrying Resend send in ${delayMs}ms:`, error);
    await sleep(delayMs);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);
  const wh = new Webhook(hookSecret);

  try {
    const verifiedPayload = wh.verify(payload, headers) as EmailPayload;
    const jobs = buildSendJobs(verifiedPayload);

    for (const job of jobs) {
      await sendEmail(job);
    }

    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Send email hook error:", error);
    return new Response(
      JSON.stringify({
        error: {
          http_code: error.code || 500,
          message: error.message || "Failed to send email",
        },
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
