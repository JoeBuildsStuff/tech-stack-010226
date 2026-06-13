import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "npm:@react-email/components@0.0.22";
import * as React from "npm:react@18.3.1";
import {
  bodyWrapper,
  button,
  buttonContainer,
  code,
  codeContainer,
  container,
  footerText,
  heading,
  hr,
  main,
  paragraph,
} from "./email-styles.ts";

interface AuthActionEmailProps {
  productName: string;
  emailActionType: string;
  verifyUrl: string;
  token: string;
  expiryCopy: string;
  userName?: string;
  audience?: "current" | "new";
}

const getEmailContent = (
  productName: string,
  emailActionType: string,
  userName?: string,
  audience?: "current" | "new"
) => {
  const name = userName || "there";

  switch (emailActionType) {
    case "signup":
      return {
        preview: `Confirm your ${productName} email address`,
        heading: "Confirm your email",
        text: `Hi ${name}, enter this code to confirm your email address for ${productName}.`,
        buttonText: "Enter Code",
        footerText:
          "If you didn't create an account, you can safely ignore this email.",
      };
    case "magiclink":
      return {
        preview: `Your ${productName} login code`,
        heading: "Your login code",
        text: `Hi ${name}, enter this code to log in to your ${productName} account.`,
        buttonText: "Enter Code",
        footerText:
          "If you didn't request this login code, you can safely ignore this email.",
      };
    case "recovery":
      return {
        preview: `Reset your ${productName} password`,
        heading: "Reset your password",
        text: `Hi ${name}, enter this code to continue resetting your ${productName} password.`,
        buttonText: "Enter Code",
        footerText:
          "If you didn't request a password reset, you can safely ignore this email.",
      };
    case "invite":
      return {
        preview: `You've been invited to ${productName}`,
        heading: "You've been invited",
        text: `Hi ${name}, enter this code to accept your invitation to ${productName}.`,
        buttonText: "Enter Code",
        footerText:
          "If you weren't expecting this invitation, you can safely ignore this email.",
      };
    case "email_change": {
      const target =
        audience === "current"
          ? "your current email address"
          : "your new email address";

      return {
        preview: `Confirm your ${productName} email change`,
        heading: "Confirm your email change",
        text: `Hi ${name}, enter this code to confirm ${target} for ${productName}.`,
        buttonText: "Enter Code",
        footerText:
          "If you didn't request this email change, contact support immediately.",
      };
    }
    default:
      return {
        preview: `${productName} action required`,
        heading: "Action required",
        text: `Hi ${name}, enter this code to continue in ${productName}.`,
        buttonText: "Enter Code",
        footerText:
          "If you didn't request this action, you can safely ignore this email.",
      };
  }
};

export const AuthActionEmail = ({
  productName,
  emailActionType,
  verifyUrl,
  token,
  expiryCopy,
  userName,
  audience,
}: AuthActionEmailProps) => {
  const content = getEmailContent(
    productName,
    emailActionType,
    userName,
    audience
  );

  return (
    <Html lang="en" dir="ltr">
      <Head>
        <title>{content.heading}</title>
      </Head>
      <Preview>{content.preview}</Preview>
      <Body style={main}>
        <div lang="en" dir="ltr" style={bodyWrapper}>
          <Container style={container}>
            <Heading style={heading}>{content.heading}</Heading>
            <Text style={paragraph}>{content.text}</Text>
            <Section style={codeContainer}>
              <code style={code}>{token}</code>
            </Section>
            <Section style={buttonContainer}>
              <Button style={button} href={verifyUrl}>
                {content.buttonText}
              </Button>
            </Section>
            <Hr style={hr} />
            <Text style={footerText}>{content.footerText}</Text>
            <Text style={footerText}>{expiryCopy}</Text>
          </Container>
        </div>
      </Body>
    </Html>
  );
};

export default AuthActionEmail;
