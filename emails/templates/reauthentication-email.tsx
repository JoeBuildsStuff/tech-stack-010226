import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";
import {
  bodyWrapper,
  code,
  codeContainer,
  container,
  footerText,
  heading,
  hr,
  main,
  paragraph,
} from "./email-styles";

export interface ReauthenticationEmailProps {
  productName: string;
  token: string;
  expiryCopy: string;
  userName?: string;
}

export const ReauthenticationEmail = ({
  productName,
  token,
  expiryCopy,
  userName,
}: ReauthenticationEmailProps) => {
  const name = userName || "there";

  return (
    <Html lang="en" dir="ltr">
      <Head>
        <title>Verify your identity</title>
      </Head>
      <Preview>{token} is your verification code</Preview>
      <Body style={main}>
        <div lang="en" dir="ltr" style={bodyWrapper}>
          <Container style={container}>
            <Heading style={heading}>Verify your identity</Heading>
            <Text style={paragraph}>
              Hi {name}, enter this code in {productName} to continue with your
              sensitive account action.
            </Text>
            <Section style={codeContainer}>
              <code style={code}>{token}</code>
            </Section>
            <Hr style={hr} />
            <Text style={footerText}>
              If you didn&apos;t request this code, you can safely ignore this
              email.
            </Text>
            <Text style={footerText}>{expiryCopy}</Text>
          </Container>
        </div>
      </Body>
    </Html>
  );
};

export default ReauthenticationEmail;
