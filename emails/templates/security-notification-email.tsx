import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Text,
} from "@react-email/components";
import * as React from "react";
import {
  bodyWrapper,
  container,
  footerText,
  heading,
  hr,
  main,
  paragraph,
} from "./email-styles";

export interface SecurityNotificationEmailProps {
  productName: string;
  emailActionType: string;
  userName?: string;
  oldEmail?: string;
  newEmail?: string;
  oldPhone?: string;
  provider?: string;
  factorType?: string;
  supportEmail?: string;
}

const getNotificationContent = ({
  productName,
  emailActionType,
  oldEmail,
  newEmail,
  oldPhone,
  provider,
  factorType,
}: SecurityNotificationEmailProps) => {
  switch (emailActionType) {
    case "password_changed_notification":
      return {
        preview: `Your ${productName} password was changed`,
        heading: "Your password was changed",
        text: `The password for your ${productName} account was changed.`,
      };
    case "email_changed_notification":
      return {
        preview: `Your ${productName} email address was changed`,
        heading: "Your email address was changed",
        text: `The email address on your ${productName} account was changed${
          oldEmail ? ` from ${oldEmail}` : ""
        }${newEmail ? ` to ${newEmail}` : ""}.`,
      };
    case "phone_changed_notification":
      return {
        preview: `Your ${productName} phone number was changed`,
        heading: "Your phone number was changed",
        text: `The phone number on your ${productName} account was changed${
          oldPhone ? ` from ${oldPhone}` : ""
        }.`,
      };
    case "identity_linked_notification":
      return {
        preview: `A sign-in method was linked to ${productName}`,
        heading: "A sign-in method was linked",
        text: `A ${provider || "new"} sign-in method was linked to your ${productName} account.`,
      };
    case "identity_unlinked_notification":
      return {
        preview: `A sign-in method was removed from ${productName}`,
        heading: "A sign-in method was removed",
        text: `A ${provider || "previous"} sign-in method was removed from your ${productName} account.`,
      };
    case "mfa_factor_enrolled_notification":
      return {
        preview: `A multi-factor method was added to ${productName}`,
        heading: "A multi-factor method was added",
        text: `A ${factorType || "multi-factor authentication"} method was added to your ${productName} account.`,
      };
    case "mfa_factor_unenrolled_notification":
      return {
        preview: `A multi-factor method was removed from ${productName}`,
        heading: "A multi-factor method was removed",
        text: `A ${factorType || "multi-factor authentication"} method was removed from your ${productName} account.`,
      };
    default:
      return {
        preview: `${productName} security notification`,
        heading: "Security notification",
        text: `A security change was made to your ${productName} account.`,
      };
  }
};

export const SecurityNotificationEmail = (
  props: SecurityNotificationEmailProps
) => {
  const name = props.userName || "there";
  const content = getNotificationContent(props);
  const contactText = props.supportEmail
    ? `If this wasn't you, contact support at ${props.supportEmail} immediately.`
    : "If this wasn't you, contact support immediately.";

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
            <Text style={paragraph}>Hi {name},</Text>
            <Text style={paragraph}>{content.text}</Text>
            <Hr style={hr} />
            <Text style={footerText}>{contactText}</Text>
          </Container>
        </div>
      </Body>
    </Html>
  );
};

export default SecurityNotificationEmail;
