import {
  ReauthenticationEmail,
  type ReauthenticationEmailProps,
} from "../../templates/reauthentication-email";
import { reauthenticationPreviewProps } from "../shared";

/** Sensitive in-session action verification */
const previewProps = reauthenticationPreviewProps();

function FlowReauthenticationPreview(
  props: ReauthenticationEmailProps = previewProps
) {
  return <ReauthenticationEmail {...props} />;
}

FlowReauthenticationPreview.PreviewProps = previewProps;

export default FlowReauthenticationPreview;
