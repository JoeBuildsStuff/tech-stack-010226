import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft, KeyRound } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { type EmailOtpType } from "@supabase/supabase-js";
import { OtpVerificationForm } from "@/app/(Auth)/_components/auth-form-controls";

const allowedOtpTypes = new Set([
  "email",
  "signup",
  "magiclink",
  "recovery",
  "invite",
  "email_change",
]);

function getStringParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getSafeNext(next: string | undefined) {
  if (!next) {
    return "/";
  }

  try {
    const parsed = new URL(next);
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return next.startsWith("/") ? next : "/";
  }
}

export default async function VerifyOTPPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const email = getStringParam(params.email);
  const requestedType = getStringParam(params.type) ?? "email";
  const otpType = allowedOtpTypes.has(requestedType) ? requestedType : "email";
  const next = getSafeNext(getStringParam(params.next));
  const error = getStringParam(params.error);
  const message = getStringParam(params.message);

  async function verifyOTP(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const token = formData.get("token") as string;
    const emailValue = formData.get("email") as string;
    const typeValue = formData.get("type") as string;
    const nextValue = getSafeNext(formData.get("next") as string | undefined);
    const search = new URLSearchParams({
      email: emailValue,
      type: typeValue,
      next: nextValue,
    });

    if (!emailValue || !/^\d{6}$/.test(token)) {
      search.set("error", "validation");
      search.set("message", "Enter the 6-digit code from your email.");
      redirect(`/verify-otp?${search.toString()}`);
    }

    const { error } = await supabase.auth.verifyOtp({
      email: emailValue,
      token,
      type: typeValue as EmailOtpType,
    });

    if (error) {
      console.log("otp-verification-error", error);
      search.set("error", "invalid_otp");
      search.set("message", "That code is incorrect or expired.");
      redirect(`/verify-otp?${search.toString()}`);
    }

    if (typeValue === "recovery") {
      redirect("/update-password");
    }

    redirect(nextValue);
  }

  async function resendOTP(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const emailValue = formData.get("email") as string;
    const typeValue = formData.get("type") as string;
    const nextValue = getSafeNext(formData.get("next") as string | undefined);
    const search = new URLSearchParams({
      email: emailValue,
      type: typeValue,
      next: nextValue,
    });

    const { error } = await supabase.auth.signInWithOtp({
      email: emailValue,
      options: {
        shouldCreateUser: true,
      },
    });

    if (error) {
      console.log("otp-resend-error", error);
      search.set("error", error.code === "over_email_send_rate_limit" ? "rate_limit" : "resend_error");
      search.set("message", error.message);
      redirect(`/verify-otp?${search.toString()}`);
    }

    search.set("message", "We sent a new code.");
    redirect(`/verify-otp?${search.toString()}`);
  }

  return (
    <div className="flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8">
      <Card className="sm:w-md">
        <CardHeader className="space-y-1">
          <Link
            href="/signin"
            className="text-sm text-muted-foreground flex flex-row items-center gap-2 mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to sign in
          </Link>
          <CardTitle className="text-2xl font-bold text-center">
            Verify code
          </CardTitle>
          <CardDescription className="text-center">
            Enter the code we sent to your email
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="bg-secondary/50 p-4 rounded-lg">
              <div className="flex justify-center mb-3">
                <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center">
                  <KeyRound className="h-6 w-6" />
                </div>
              </div>
              <p className="text-center mb-2">
                Enter the 6-digit code sent to:
              </p>
              <p className="text-center font-medium mb-4">{email}</p>
              <p className="text-center text-xs text-muted-foreground px-6">
                Code expires in 09:42.
              </p>
            </div>
            <OtpVerificationForm
              verifyAction={verifyOTP}
              resendAction={resendOTP}
              email={email ?? ""}
              type={otpType}
              next={next}
              error={error && message ? decodeURIComponent(message) : undefined}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
