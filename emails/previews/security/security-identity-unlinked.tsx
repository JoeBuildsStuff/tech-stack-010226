import {
  SecurityNotificationEmail,
  type SecurityNotificationEmailProps,
} from "../../templates/security-notification-email";
import { securityNotificationPreviewProps } from "../shared";

const previewProps = securityNotificationPreviewProps(
  "identity_unlinked_notification",
  { provider: "GitHub" }
);

function SecurityIdentityUnlinkedPreview(
  props: SecurityNotificationEmailProps = previewProps
) {
  return <SecurityNotificationEmail {...props} />;
}

SecurityIdentityUnlinkedPreview.PreviewProps = previewProps;

export default SecurityIdentityUnlinkedPreview;
