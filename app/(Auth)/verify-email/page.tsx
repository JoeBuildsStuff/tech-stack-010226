
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";


import Link from "next/link";
import { signInWithMagicLink } from '@/app/(Auth)/actions/auth';
import { ArrowLeft, Mail } from "lucide-react";
import { CooldownSubmitButton } from "@/app/(Auth)/_components/auth-form-controls";


export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {

  const { email } = await searchParams

  return (
    <div className="flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8">
      <Card className="sm:w-md">

        {/* card header */}
        <CardHeader className="space-y-1">
        <Link href="/signin" className="text-sm text-muted-foreground flex flex-row items-center gap-2 mb-4">
              <ArrowLeft className="h-4 w-4" />
              Back to sign in
            </Link>
          <CardTitle className="text-2xl font-bold text-center">Verify your email</CardTitle>
          <CardDescription className="text-center">
            Check your email for a verification link.
          </CardDescription>
        </CardHeader>

        {/* card content */}
        <CardContent className="">
        <div className="bg-secondary/50 p-6 rounded-lg mb-6">
        <div className="flex justify-center mb-4">
          <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center">
            <Mail className="h-6 w-6" />
          </div>
        </div>
        <p className="text-center mb-2">We&apos;ve sent a verification link to:</p>
        <p className="text-center font-medium mb-4">{email}</p>
        <p className="text-center text-muted-foreground text-sm">
          Please check your email and click the verification link to continue.
        </p>
        <p className="text-center text-sm mt-4">
          Wrong email?{" "}
          <Link href="/signup" className="text-primary hover:underline">
            Use a different address.
          </Link>
        </p>
      </div>


        {/* resend verification link button */}
        <form className="flex justify-center items-center" action={signInWithMagicLink}>
          <input
            type="hidden"
            name="email"
            value={typeof email === "string" ? decodeURIComponent(email) : ""}
          />
          <CooldownSubmitButton>
            Resend verification link
          </CooldownSubmitButton>
        </form>
        </CardContent>

        {/* no account sign up link */}
        <CardFooter className="flex flex-row items-center justify-center">
          <div className="text-center text-sm text-muted-foreground flex flex-row items-center justify-center gap-2">
            Need help?{' '}
            <Link href="/support" className="text-primary hover:underline hover:text-primary/80 transition-colors">
              Contact support
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
