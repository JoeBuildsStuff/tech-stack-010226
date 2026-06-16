import {
  AuthActionEmail,
  type AuthActionEmailProps,
} from "../../templates/auth-action-email";
import { authActionPreviewProps } from "../shared";

/** Admin invite flow (not in main auth screenshot set) */
const previewProps = authActionPreviewProps("invite");

function FlowInvitePreview(props: AuthActionEmailProps = previewProps) {
  return <AuthActionEmail {...props} />;
}

FlowInvitePreview.PreviewProps = previewProps;

export default FlowInvitePreview;
