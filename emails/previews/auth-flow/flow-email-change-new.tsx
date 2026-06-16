import {
  AuthActionEmail,
  type AuthActionEmailProps,
} from "../../templates/auth-action-email";
import { authActionPreviewProps } from "../shared";

/** Account settings: confirm change on new email address */
const previewProps = authActionPreviewProps("email_change", {
  audience: "new",
});

function FlowEmailChangeNewPreview(
  props: AuthActionEmailProps = previewProps
) {
  return <AuthActionEmail {...props} />;
}

FlowEmailChangeNewPreview.PreviewProps = previewProps;

export default FlowEmailChangeNewPreview;
