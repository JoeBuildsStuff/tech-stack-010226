import {
  SecurityNotificationEmail,
  type SecurityNotificationEmailProps,
} from "../../templates/security-notification-email";
import { securityNotificationPreviewProps } from "../shared";

const previewProps = securityNotificationPreviewProps(
  "identity_linked_notification",
  { provider: "Google" }
);

function SecurityIdentityLinkedPreview(
  props: SecurityNotificationEmailProps = previewProps
) {
  return <SecurityNotificationEmail {...props} />;
}

SecurityIdentityLinkedPreview.PreviewProps = previewProps;

export default SecurityIdentityLinkedPreview;
