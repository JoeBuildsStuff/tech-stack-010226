import { updateUserPassword } from '@/app/(Auth)/actions/auth'
import { UpdatePasswordForm } from '@/app/(Auth)/_components/auth-form-controls'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
      <Card className="gap-4 py-4 sm:w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Update your password</CardTitle>
          <CardDescription className="text-center">
            Enter your new password below.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          <UpdatePasswordForm
            action={updateUserPassword}
            formError={error && message ? decodeURIComponent(message as string) : undefined}
          />
        </CardContent>

        {error && message && (
          <CardFooter>
            <Alert variant={error === 'validation_error' ? 'destructive' : 'destructive'} className="w-full">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>
                {error === 'validation_error' ? 'Invalid input' : 'Reset link issue'}
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
                    Return to sign in
                </Link>
            </p>
        </CardFooter>
      </Card>
    </div>
  )
} 
