import {
  AuthActionEmail,
  type AuthActionEmailProps,
} from "../../templates/auth-action-email";
import { authActionPreviewProps } from "../shared";

/** Account settings: confirm change on current email address */
const previewProps = authActionPreviewProps("email_change", {
  audience: "current",
});

function FlowEmailChangeCurrentPreview(
  props: AuthActionEmailProps = previewProps
) {
  return <AuthActionEmail {...props} />;
}

FlowEmailChangeCurrentPreview.PreviewProps = previewProps;

export default FlowEmailChangeCurrentPreview;
