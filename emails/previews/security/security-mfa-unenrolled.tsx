import {
  SecurityNotificationEmail,
  type SecurityNotificationEmailProps,
} from "../../templates/security-notification-email";
import { securityNotificationPreviewProps } from "../shared";

const previewProps = securityNotificationPreviewProps(
  "mfa_factor_unenrolled_notification",
  { factorType: "SMS" }
);

function SecurityMfaUnenrolledPreview(
  props: SecurityNotificationEmailProps = previewProps
) {
  return <SecurityNotificationEmail {...props} />;
}

SecurityMfaUnenrolledPreview.PreviewProps = previewProps;

export default SecurityMfaUnenrolledPreview;
