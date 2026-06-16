import {
  AuthActionEmail,
  type AuthActionEmailProps,
} from "../../templates/auth-action-email";
import { authActionPreviewProps } from "../shared";

/** Auth screens: 03-signin-password-reset, 09-update-password-check-email */
const previewProps = authActionPreviewProps("recovery");

function FlowPasswordResetPreview(
  props: AuthActionEmailProps = previewProps
) {
  return <AuthActionEmail {...props} />;
}

FlowPasswordResetPreview.PreviewProps = previewProps;

export default FlowPasswordResetPreview;
