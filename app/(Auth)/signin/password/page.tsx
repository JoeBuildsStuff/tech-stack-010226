import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, ArrowLeft, Mail } from "lucide-react";
import Link from "next/link";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { signInWithPassword } from "@/app/(Auth)/actions/auth";

export default async function PasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { error, message, email, next: nextParam } = await searchParams;
  const next = typeof nextParam === 'string' ? nextParam : null;

  return (
    <div className="flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8">

      <Card className="sm:w-md">
        <CardHeader className="space-y-1">
            <Link href="/signin" className="text-sm text-muted-foreground flex flex-row items-center gap-2 mb-4">
              <ArrowLeft className="h-4 w-4" />
              back to passwordless options
            </Link>
            <CardTitle className="text-2xl font-bold text-center">Welcome Back</CardTitle>
          <CardDescription className="text-center">
            Sign in to your account
          </CardDescription>
          {(!error && message) && (
            <Alert variant={"default"} className="mt-4 border-none text-green-700 bg-green-50 dark:bg-green-950 dark:text-green-500">
              <AlertTitle className="text-sm font-semibold">Success!</AlertTitle>
              <AlertDescription className="text-xs text-green-700 dark:text-green-500">
                {typeof message === 'string' ? decodeURIComponent(message) : 'Action completed successfully.'}
              </AlertDescription>
            </Alert>
          )}
        </CardHeader>
        <CardContent className="space-y-4">

            <form>
                {next && <input type="hidden" name="next" value={next} />}
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" placeholder="m@example.com" type="email" name="email" required />
                    </div>
                    <div className="space-y-2">
                        <div className="flex flex-row items-center gap-2 justify-between">
                        <Label htmlFor="password">Password</Label>
                        <Link href="/signin/password/reset" className="text-xs text-muted-foreground">Forgot password?</Link>
                        </div>
                        <Input id="password" placeholder="password" type="password" name="password" required />
                    </div>
                    <div className="flex flex-col gap-2">
                <Button 
                  type="submit" 
                  variant="default"
                  className="flex-1"
                  formAction={signInWithPassword}
                >
                  Sign in
                </Button>
                </div>
                </div>

            </form>

            <Alert variant={"default"} className="bg-secondary/50 border-none">
          <Mail className="" />
          <AlertTitle className="text-sm">Passwordless Option</AlertTitle>
          <AlertDescription className="pt-2 space-y-2">
          <span>
            We recomend using a <Link
              href="/signin"
              className="text-primary underline hover:text-primary/80 transition-colors"
            >
              passwordless option.
            </Link> 
          </span>
          </AlertDescription>
        </Alert>

                {/* no account sign up link */}
                <div className="text-center text-sm text-muted-foreground flex flex-row items-center justify-center gap-2">
          No account? {' '}
          <Link href="/signup" className="text-primary underline hover:text-primary/80 transition-colors">
            Sign up
          </Link>
        </div>
        </CardContent>

        {(error && message) && (
          <CardFooter>
            <Alert variant={"destructive"} className="">
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
      </Card>

    </div>
  )
}