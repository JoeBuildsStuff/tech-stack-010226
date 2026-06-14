import { updateUserPassword } from '@/app/(Auth)/actions/auth'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle } from 'lucide-react'
import Link from 'next/link'

export default async function UpdatePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { error, message } = await searchParams

  return (
    <div className="flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8">
      <Card className="sm:w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Update Your Password</CardTitle>
          <CardDescription className="text-center">
            Enter your new password below.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <form action={updateUserPassword}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={6} // Example: enforce a minimum password length
                  placeholder="••••••••"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  minLength={6}
                  placeholder="••••••••"
                />
              </div>
              <Button type="submit" className="w-full">
                Update Password
              </Button>
            </div>
          </form>
        </CardContent>

        {error && message && (
          <CardFooter>
            <Alert variant={error === 'validation_error' ? 'destructive' : 'destructive'} className="w-full">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>
                {error === 'validation_error' ? 'Invalid Input' : 'Error Updating Password'}
              </AlertTitle>
              <AlertDescription>
                {typeof message === 'string' ? (
                  decodeURIComponent(message)
                ) : (
                  'An unexpected error occurred. Please try again.'
                )}
              </AlertDescription>
            </Alert>
          </CardFooter>
        )}
        <CardFooter className="flex flex-col items-center justify-center text-sm">
            <p className="text-muted-foreground">
                Remembered your password?{' '}
                <Link href="/signin" className="text-primary hover:underline">
                    Sign In
                </Link>
            </p>
        </CardFooter>
      </Card>
    </div>
  )
} 