import {
  SecurityNotificationEmail,
  type SecurityNotificationEmailProps,
} from "../../templates/security-notification-email";
import { securityNotificationPreviewProps } from "../shared";

const previewProps = securityNotificationPreviewProps(
  "password_changed_notification"
);

function SecurityPasswordChangedPreview(
  props: SecurityNotificationEmailProps = previewProps
) {
  return <SecurityNotificationEmail {...props} />;
}

SecurityPasswordChangedPreview.PreviewProps = previewProps;

export default SecurityPasswordChangedPreview;
