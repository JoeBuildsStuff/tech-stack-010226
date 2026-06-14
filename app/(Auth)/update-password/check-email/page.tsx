import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mail, RotateCcw } from "lucide-react";
import Link from "next/link";
import { requestPasswordReset } from '@/app/(Auth)/actions/auth'; // For resend functionality

export default async function CheckEmailForPasswordResetPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {

  const { email } = await searchParams

  return (
    <div className="flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8">
      <Card className="sm:w-md">
        <CardHeader className="space-y-1">
          <Link href="/signin/password/reset" className="text-sm text-muted-foreground flex flex-row items-center gap-2 mb-4">
            <ArrowLeft className="h-4 w-4" />
            Back to Password Reset
          </Link>
          <CardTitle className="text-2xl font-bold text-center">Check Your Email</CardTitle>
          <CardDescription className="text-center">
            We&apos;ve sent a password reset link to your email address.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="bg-secondary/50 p-6 rounded-lg">
            <div className="flex justify-center mb-4">
              <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center">
                <Mail className="h-6 w-6 text-primary" />
              </div>
            </div>
            <p className="text-center mb-2">A password reset link has been sent to:</p>
            <p className="text-center font-medium text-lg mb-4 break-all">{email ? decodeURIComponent(email as string) : "your email address"}</p>
            <p className="text-center text-muted-foreground text-sm">
              Please check your inbox (and spam folder) and click the link to reset your password.
            </p>
          </div>

          <form action={requestPasswordReset} className="flex flex-col items-center">
            <input type="hidden" name="email" value={email ? decodeURIComponent(email as string) : ''} />
           {/* TODO: add resend button functionality */}
            <Button variant="default" className="">
              <RotateCcw className="h-4 w-4" />
              Resend Password Reset Link
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col items-center justify-center text-sm">
            <p className="text-muted-foreground">
                Opened the link and updated your password?{' '}
                <Link href="/support" className="text-primary hover:underline hover:text-primary/80 transition-colors">
                    Sign In
                </Link>
            </p>
        </CardFooter>
      </Card>
    </div>
  );
}
