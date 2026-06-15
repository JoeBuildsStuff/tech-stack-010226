"use client";

import Link from "next/link";
import type { ComponentProps, KeyboardEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Eye, EyeOff, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";

type ServerAction = (formData: FormData) => void | Promise<void>;

const PASSWORD_RULE_TEXT =
  "Use at least 12 characters, including a number or symbol.";

function isStrongPassword(password: string) {
  return password.length >= 12 && /[\d\W_]/.test(password);
}

export function PendingButton({
  children,
  pendingChildren,
  disabled,
  className,
  variant = "default",
  formAction,
}: {
  children: ReactNode;
  pendingChildren: ReactNode;
  disabled?: boolean;
  className?: string;
  variant?: ComponentProps<typeof Button>["variant"];
  formAction?: ServerAction;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant={variant}
      className={className}
      disabled={disabled || pending}
      formAction={formAction}
    >
      {pending ? pendingChildren : children}
    </Button>
  );
}

export function AuthAgreementFooter() {
  return (
    <p className="text-center text-xs leading-5 text-muted-foreground">
      By continuing, you agree to our{" "}
      <Link href="/terms" className="underline underline-offset-2">
        Terms of Service
      </Link>{" "}
      and{" "}
      <Link href="/privacy" className="underline underline-offset-2">
        Privacy Policy
      </Link>
      .
    </p>
  );
}

function PasswordField({
  id,
  name,
  label,
  labelAction,
  value,
  onChange,
  autoComplete,
  error,
  placeholder = "password",
  showRules = true,
}: {
  id: string;
  name: string;
  label: string;
  labelAction?: ReactNode;
  value?: string;
  onChange?: (value: string) => void;
  autoComplete?: string;
  error?: string;
  placeholder?: string;
  showRules?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const capsId = `${id}-caps`;

  function updateCapsLock(event: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(event.getModifierState("CapsLock"));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={id}>{label}</Label>
        {labelAction}
      </div>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          onKeyUp={updateCapsLock}
          onKeyDown={updateCapsLock}
          onBlur={() => setCapsLock(false)}
          autoComplete={autoComplete}
          required
          minLength={showRules ? 12 : undefined}
          placeholder={placeholder}
          aria-invalid={!!error}
          aria-describedby={[
            showRules ? descriptionId : null,
            capsLock ? capsId : null,
            error ? errorId : null,
          ]
            .filter(Boolean)
            .join(" ")}
          className="pr-10"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute right-1 top-1/2 -translate-y-1/2"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </Button>
      </div>
      {showRules && (
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {PASSWORD_RULE_TEXT}
        </p>
      )}
      {capsLock && (
        <p id={capsId} className="text-xs text-yellow-600 dark:text-yellow-400">
          Caps Lock is on.
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function PasswordSignInForm({
  action,
  next,
  email,
  formError,
  forgotPasswordHref,
}: {
  action: ServerAction;
  next: string | null;
  email?: string;
  formError?: string;
  forgotPasswordHref?: string;
}) {
  const [password, setPassword] = useState("");

  return (
    <form>
      {next && <input type="hidden" name="next" value={next} />}
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            placeholder="m@example.com"
            type="email"
            name="email"
            defaultValue={email}
            autoComplete="email"
            required
          />
        </div>
        <PasswordField
          id="password"
          name="password"
          label="Password"
          labelAction={
            forgotPasswordHref ? (
              <Link
                href={forgotPasswordHref}
                className="text-xs text-muted-foreground hover:underline"
              >
                Forgot password?
              </Link>
            ) : undefined
          }
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          error={formError}
          showRules={false}
        />
        <PendingButton
          formAction={action}
          className="w-full"
          pendingChildren="Signing in..."
        >
          Sign in
        </PendingButton>
      </div>
    </form>
  );
}

export function PasswordSignupForm({
  action,
  formError,
}: {
  action: ServerAction;
  formError?: string;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const passwordError =
    password && !isStrongPassword(password) ? PASSWORD_RULE_TEXT : undefined;
  const confirmError =
    confirmPassword && password !== confirmPassword
      ? "Passwords do not match."
      : undefined;
  const canSubmit = isStrongPassword(password) && password === confirmPassword;

  return (
    <form>
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            placeholder="m@example.com"
            type="email"
            name="email"
            autoComplete="email"
            required
          />
        </div>
        <PasswordField
          id="password"
          name="password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          error={passwordError}
          showRules={false}
        />
        <PasswordField
          id="confirmPassword"
          name="confirmPassword"
          label="Confirm password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
          error={confirmError}
          showRules={false}
        />
        {formError && <p className="text-xs text-destructive">{formError}</p>}
        <PendingButton
          formAction={action}
          className="w-full"
          pendingChildren="Creating account..."
          disabled={!canSubmit}
        >
          Sign up
        </PendingButton>
      </div>
    </form>
  );
}

export function UpdatePasswordForm({
  action,
  formError,
}: {
  action: ServerAction;
  formError?: string;
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const passwordError =
    password && !isStrongPassword(password) ? PASSWORD_RULE_TEXT : undefined;
  const confirmError =
    confirmPassword && password !== confirmPassword
      ? "Passwords do not match."
      : undefined;
  const canSubmit = isStrongPassword(password) && password === confirmPassword;

  return (
    <form action={action}>
      <div className="space-y-4">
        <PasswordField
          id="password"
          name="password"
          label="New password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          error={passwordError}
          placeholder="••••••••"
          showRules={false}
        />
        <PasswordField
          id="confirmPassword"
          name="confirmPassword"
          label="Confirm new password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
          error={confirmError}
          placeholder="••••••••"
          showRules={false}
        />
        {formError && <p className="text-xs text-destructive">{formError}</p>}
        <PendingButton
          className="w-full"
          pendingChildren="Updating password..."
          disabled={!canSubmit}
        >
          Update password
        </PendingButton>
      </div>
    </form>
  );
}

export function ResetRequestForm({
  resetAction,
  magicLinkAction,
  email,
}: {
  resetAction: ServerAction;
  magicLinkAction: ServerAction;
  email?: string;
}) {
  return (
    <form>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            placeholder="m@example.com"
            type="email"
            name="email"
            defaultValue={email}
            autoComplete="email"
            required
          />
        </div>
        <div className="flex flex-row gap-2 w-full">
          <PendingButton
            formAction={resetAction}
            className="flex-1"
            pendingChildren="Sending..."
          >
            Send reset link
          </PendingButton>
          <PendingButton
            formAction={magicLinkAction}
            className="flex-1"
            pendingChildren="Sending..."
          >
            Send magic link instead
          </PendingButton>
        </div>
      </div>
    </form>
  );
}

export function CooldownSubmitButton({
  children,
  pendingChildren = "Sending...",
  cooldownLabel = "Resend available in",
  seconds = 60,
  variant = "default",
  className,
}: {
  children: ReactNode;
  pendingChildren?: ReactNode;
  cooldownLabel?: string;
  seconds?: number;
  variant?: ComponentProps<typeof Button>["variant"];
  className?: string;
}) {
  const { pending } = useFormStatus();
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setRemaining((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [remaining]);

  if (remaining > 0) {
    return (
      <Button type="submit" variant={variant} className={className} disabled>
        {`${cooldownLabel} ${remaining} seconds`}
      </Button>
    );
  }

  return (
    <Button
      type="submit"
      variant={variant}
      className={className}
      disabled={pending}
    >
      <RotateCcw className="h-4 w-4" />
      {pending ? pendingChildren : children}
    </Button>
  );
}

export function OtpVerificationForm({
  verifyAction,
  resendAction,
  email,
  type,
  next,
  error,
}: {
  verifyAction: ServerAction;
  resendAction: ServerAction;
  email: string;
  type: string;
  next: string;
  error?: string;
}) {
  const [token, setToken] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const tokenError =
    error || (token && token.length < 6 ? "Enter all 6 digits." : undefined);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <form>
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="next" value={next} />
        <div className="space-y-4">
          <div className="flex justify-center mb-4 mt-2">
            <InputOTP
              ref={inputRef}
              maxLength={6}
              name="token"
              value={token}
              onChange={(value) =>
                setToken(value.replace(/\D/g, "").slice(0, 6))
              }
              pasteTransformer={(value) => value.replace(/\D/g, "").slice(0, 6)}
              aria-invalid={!!tokenError}
              aria-describedby={tokenError ? "otp-error" : undefined}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
              </InputOTPGroup>
              <InputOTPSeparator className="text-border" />
              <InputOTPGroup>
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
          </div>
          {tokenError && (
            <p id="otp-error" className="text-center text-xs text-destructive">
              {tokenError}
            </p>
          )}
          <PendingButton
            formAction={verifyAction}
            className="w-full"
            pendingChildren="Verifying..."
            disabled={token.length !== 6}
          >
            Verify code
          </PendingButton>
        </div>
      </form>
      <form action={resendAction}>
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="next" value={next} />
        <CooldownSubmitButton variant="outline" className="w-full">
          Resend code
        </CooldownSubmitButton>
      </form>
    </div>
  );
}
