import {
  AuthActionEmail,
  type AuthActionEmailProps,
} from "../../templates/auth-action-email";
import { authActionPreviewProps } from "../shared";

/** Auth screens: 05-signup-password, 06-verify-email (after signup) */
const previewProps = authActionPreviewProps("signup");

function FlowSignupPreview(props: AuthActionEmailProps = previewProps) {
  return <AuthActionEmail {...props} />;
}

FlowSignupPreview.PreviewProps = previewProps;

export default FlowSignupPreview;
