import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { ArrowLeft, Mail } from "lucide-react";
import Link from "next/link";
import { requestPasswordReset } from '@/app/(Auth)/actions/auth'; // For resend functionality
import { CooldownSubmitButton } from "@/app/(Auth)/_components/auth-form-controls";

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
            Use a different email
          </Link>
          <CardTitle className="text-2xl font-bold text-center">Check your email</CardTitle>
          <CardDescription className="text-center">
            We&apos;ve sent a password reset link to your email address.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="bg-secondary/50 p-4 rounded-lg">
            <div className="flex justify-center mb-3">
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
            <CooldownSubmitButton>
              Resend password reset link
            </CooldownSubmitButton>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col items-center justify-center text-sm">
            <p className="text-muted-foreground">
                Already updated your password?{' '}
                <Link href="/signin" className="text-primary hover:underline hover:text-primary/80 transition-colors">
                    Sign in
                </Link>
            </p>
        </CardFooter>
      </Card>
    </div>
  );
}
