# Auth Flow Screenshots v2

Planned updates for the next auth screenshot pass.

## Highest Priority

- Change `back to signin` to `Back to sign in`.
- Change `back to passwordless options` to `Back to passwordless options`.
- Replace `Password Option` with clearer copy such as `Prefer using a password?` or `Password sign-in`.
- Fix `We recomend` to `We recommend`.
- Change `continue here` to `Continue with password`.
- Change `No account?` to `Don't have an account?`.
- Change `Opened the link and updated your password?` to `Already updated your password?`.
- On passwordless sign-up, replace `Enter your details below to create your account` with `Create your account with email or a social provider.`

## Page Notes

### 01 Passwordless Sign In

- Use `Email me a sign-in link` as the primary email action.
- Use `Send a 6-digit code instead` as the secondary email action.
- Reduce the password option card to a lighter text row: `Prefer using a password? Sign in with password`.
- Replace judgmental password copy with `Password sign-in is available if you need it.`

### 02 Password Sign In

- Make the passwordless option less visually heavy.
- Add show/hide password.
- Add Caps Lock warning.
- Add inline error region below fields.
- Add loading state copy such as `Signing in...`.
- Standardize CTA casing to `Sign in`.

### 03 Password Reset Request

- Use `Send password reset link` as the primary action.
- Move magic link to a secondary text link: `Sign in with a magic link instead`.
- Keep the info card scoped to password reset.

### 04 Passwordless Sign Up

- Clarify passwordless account creation with copy like `We'll verify your email before creating your account.`
- Make the password option callout lighter.

### 05 Password Sign Up

- Show password requirements.
- Add password strength feedback.
- Add show/hide password.
- Add confirm password validation.
- Add terms/privacy acceptance if required.
- Replace `Password Option` with `Prefer passwordless? Create your account with a magic link instead.`

### 06 Verify Email

- Add `Wrong email? Use a different address.`
- Add resend cooldown state, for example `Resend available in 45 seconds`.

### 07 Verify OTP

- Ensure paste supports `123456`, `123-456`, and space-separated codes.
- Add auto-focus, auto-advance, and backspace behavior.
- Add error state: `That code is incorrect or expired.`
- Add expiration timer copy such as `Code expires in 09:42.`
- Disable resend until the cooldown has elapsed.

### 08 Update Password

- Show password rules before failure.
- Add show/hide password.
- Add strength indicator.
- Add confirm password mismatch state.
- Add expired or invalid reset link state.
- Add success state after update.
- Prefer `Return to sign in`.

### 09 Password Reset Check Email

- Replace `Back to Password Reset` with `Use a different email`.
- Replace `Opened the link and updated your password? Sign In` with `Already updated your password? Sign in`.
- Consider masking the email address on shared devices.

