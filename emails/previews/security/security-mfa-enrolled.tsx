import {
  SecurityNotificationEmail,
  type SecurityNotificationEmailProps,
} from "../../templates/security-notification-email";
import { securityNotificationPreviewProps } from "../shared";

const previewProps = securityNotificationPreviewProps(
  "mfa_factor_enrolled_notification",
  { factorType: "authenticator app" }
);

function SecurityMfaEnrolledPreview(
  props: SecurityNotificationEmailProps = previewProps
) {
  return <SecurityNotificationEmail {...props} />;
}

SecurityMfaEnrolledPreview.PreviewProps = previewProps;

export default SecurityMfaEnrolledPreview;
