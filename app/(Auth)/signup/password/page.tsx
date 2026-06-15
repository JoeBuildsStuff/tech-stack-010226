import Link from 'next/link';
import { signUpWithPassword } from '@/app/(Auth)/actions/auth'; // Changed from signInWithPassword
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, ArrowLeft, Mail } from "lucide-react";
import {
  AuthAgreementFooter,
  PasswordSignupForm,
} from "@/app/(Auth)/_components/auth-form-controls";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {

  const {
    error,
    message,
    email,
  } = await searchParams

  return (
    <div className="flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8">
      <Card className="gap-4 py-4 sm:w-md">
        <CardHeader className="space-y-0">
            <Link href="/signup" className="text-sm text-muted-foreground flex flex-row items-center gap-2 mb-4">
              <ArrowLeft className="h-4 w-4" />
              Back to passwordless options
            </Link>
          <CardTitle className="text-2xl font-bold text-center">Create an account</CardTitle>
          <CardDescription className="text-center">
            Create your account with email and a password.
          </CardDescription>
        </CardHeader>

        {/* card content */}
        <CardContent className="space-y-3">

          <PasswordSignupForm
            action={signUpWithPassword}
            formError={error && message ? decodeURIComponent(message as string) : undefined}
          />

          <Alert variant={"default"} className="bg-secondary/50 border-none">
            <Mail className="" />
            <AlertTitle className="text-sm">Prefer passwordless?</AlertTitle>
            <AlertDescription className="pt-2 space-y-2">
              <span>
                We recommend using a{" "}
                <Link
                  href="/signup"
                  className="text-primary underline hover:text-primary/80 transition-colors"
                >
                  passwordless option.
                </Link>
              </span>
            </AlertDescription>
          </Alert>

        {/* already have an account link */}
        <div className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/signin" className="text-primary underline hover:text-primary/80 transition-colors">
            Sign in
          </Link>
        </div>
        </CardContent>

        {/* error alert */}
        {error && message && (
        <CardFooter>
            <Alert variant={"destructive"} className=""> {/* Changed to destructive for signup errors initially */}
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="text-sm">{error === "rate_limit" ? "Slow down there!" : "Uh oh!"}</AlertTitle>
              <AlertDescription className="pt-2 space-y-2">
                {typeof message === 'string' ? <span>{decodeURIComponent(message)}</span> : 'An unexpected error occurred.'}
                {error === "rate_limit" && typeof email === 'string' && (
                  <>
                    <span className=""> Please wait before trying again with:</span>
                    <p className="font-bold">{decodeURIComponent(email)}</p>
                  </>
                )}
              </AlertDescription>
            </Alert>
        </CardFooter>
        )}
        <CardFooter className="border-t pt-4">
          <AuthAgreementFooter />
        </CardFooter>
        
      </Card>
    </div>
  );
};
