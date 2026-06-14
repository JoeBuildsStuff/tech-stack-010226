import Link from 'next/link';
import { signUpWithPassword } from '@/app/(Auth)/actions/auth'; // Changed from signInWithPassword
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, ArrowLeft, Mail } from "lucide-react";

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
      <Card className="sm:w-md">
        <CardHeader className="space-y-1">
            <Link href="/signup" className="text-sm text-muted-foreground flex flex-row items-center gap-2 mb-4">
              <ArrowLeft className="h-4 w-4" />
              back to passwordless options
            </Link>
          <CardTitle className="text-2xl font-bold text-center">Create an account</CardTitle>
          <CardDescription className="text-center">
            Enter your details below to create your account
          </CardDescription>
        </CardHeader>

        {/* card content */}
        <CardContent className="space-y-4">

          {/* email and password form */}  
          <form>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email" 
                  placeholder="m@example.com" 
                  type="email" 
                  name="email"
                  required 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input 
                  id="password" 
                  placeholder="password" 
                  type="password" 
                  name="password"
                  required 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Confirm Password</Label>
                <Input 
                  id="password" 
                  placeholder="password" 
                  type="password" 
                  name="password"
                  required 
                />
              </div>

              <Button 
                type="submit" 
                variant="default"
                className="w-full"
                formAction={signUpWithPassword} // Changed from signInWithPassword
              >
                Sign Up
              </Button>
            </div>
          </form>

          {/* passwordless option alert */}
          <Alert variant={"default"} className="bg-secondary/50 border-none">
          <Mail className="" />
          <AlertTitle className="text-sm">Password Option</AlertTitle>
          <AlertDescription className="pt-2 space-y-2">
          <span>
            We recomend using a <Link
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
        
      </Card>
    </div>
  );
};
