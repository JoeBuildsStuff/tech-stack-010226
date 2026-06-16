import {
  SecurityNotificationEmail,
  type SecurityNotificationEmailProps,
} from "../../templates/security-notification-email";
import { PREVIEW_EMAIL, securityNotificationPreviewProps } from "../shared";

const previewProps = securityNotificationPreviewProps(
  "email_changed_notification",
  {
    oldEmail: "old@example.com",
    newEmail: PREVIEW_EMAIL,
  }
);

function SecurityEmailChangedPreview(
  props: SecurityNotificationEmailProps = previewProps
) {
  return <SecurityNotificationEmail {...props} />;
}

SecurityEmailChangedPreview.PreviewProps = previewProps;

export default SecurityEmailChangedPreview;
