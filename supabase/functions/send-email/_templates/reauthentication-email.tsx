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
} from "npm:@react-email/components@0.0.22";
import * as React from "npm:react@18.3.1";
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
} from "./email-styles.ts";

interface ReauthenticationEmailProps {
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
