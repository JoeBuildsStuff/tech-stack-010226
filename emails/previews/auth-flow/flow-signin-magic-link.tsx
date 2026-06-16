import {
  AuthActionEmail,
  type AuthActionEmailProps,
} from "../../templates/auth-action-email";
import { authActionPreviewProps } from "../shared";

/** Auth screens: 01-signin, 06-verify-email (magic link resend), 07-verify-otp */
const previewProps = authActionPreviewProps("magiclink");

function FlowSignInMagicLinkPreview(
  props: AuthActionEmailProps = previewProps
) {
  return <AuthActionEmail {...props} />;
}

FlowSignInMagicLinkPreview.PreviewProps = previewProps;

export default FlowSignInMagicLinkPreview;
