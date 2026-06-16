import {
  SecurityNotificationEmail,
  type SecurityNotificationEmailProps,
} from "../../templates/security-notification-email";
import { securityNotificationPreviewProps } from "../shared";

const previewProps = securityNotificationPreviewProps(
  "phone_changed_notification",
  { oldPhone: "+1 (555) 010-9999" }
);

function SecurityPhoneChangedPreview(
  props: SecurityNotificationEmailProps = previewProps
) {
  return <SecurityNotificationEmail {...props} />;
}

SecurityPhoneChangedPreview.PreviewProps = previewProps;

export default SecurityPhoneChangedPreview;
