import type { AuthActionEmailProps } from "../templates/auth-action-email";
import type { ReauthenticationEmailProps } from "../templates/reauthentication-email";
import type { SecurityNotificationEmailProps } from "../templates/security-notification-email";

export const PREVIEW_PRODUCT_NAME = "Your App";
export const PREVIEW_EXPIRY_COPY =
  "This code expires soon. Request a new email if it no longer works.";
export const PREVIEW_USER_NAME = "Alex";
export const PREVIEW_EMAIL = "user@example.com";
export const PREVIEW_TOKEN = "123456";
export const PREVIEW_SUPPORT_EMAIL = "support@example.com";

export function previewVerifyUrl(type: string) {
  return `http://localhost:3000/verify-otp?email=${encodeURIComponent(PREVIEW_EMAIL)}&type=${type}`;
}

export function authActionPreviewProps(
  emailActionType: AuthActionEmailProps["emailActionType"],
  options?: Pick<AuthActionEmailProps, "audience">
): AuthActionEmailProps {
  return {
    productName: PREVIEW_PRODUCT_NAME,
    emailActionType,
    verifyUrl: previewVerifyUrl(emailActionType),
    token: PREVIEW_TOKEN,
    expiryCopy: PREVIEW_EXPIRY_COPY,
    userName: PREVIEW_USER_NAME,
    audience: options?.audience,
  };
}

export function reauthenticationPreviewProps(): ReauthenticationEmailProps {
  return {
    productName: PREVIEW_PRODUCT_NAME,
    token: PREVIEW_TOKEN,
    expiryCopy: PREVIEW_EXPIRY_COPY,
    userName: PREVIEW_USER_NAME,
  };
}

export function securityNotificationPreviewProps(
  emailActionType: SecurityNotificationEmailProps["emailActionType"],
  overrides?: Partial<SecurityNotificationEmailProps>
): SecurityNotificationEmailProps {
  return {
    productName: PREVIEW_PRODUCT_NAME,
    emailActionType,
    userName: PREVIEW_USER_NAME,
    supportEmail: PREVIEW_SUPPORT_EMAIL,
    ...overrides,
  };
}
