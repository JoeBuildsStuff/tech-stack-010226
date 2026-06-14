"use client"

import { useState } from "react"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { updateNotificationPreferences } from "../actions"

type NotificationPreferences = {
  email_notifications: boolean
  marketing_emails: boolean
  security_alerts: boolean
}

export function NotificationForm({ initialPreferences }: { initialPreferences: NotificationPreferences }) {
  const [preferences, setPreferences] = useState(initialPreferences)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)

    const formData = new FormData()
    formData.append('email_notifications', preferences.email_notifications ? 'on' : 'off')
    formData.append('marketing_emails', preferences.marketing_emails ? 'on' : 'off')
    formData.append('security_alerts', preferences.security_alerts ? 'on' : 'off')

    await updateNotificationPreferences(formData)
    setIsSubmitting(false)
  }

  return (
    <form onSubmit={handleSubmit}>
      <FieldSet>
        <FieldLegend>Email Notifications</FieldLegend>
        <FieldDescription>
          Choose which emails you&apos;d like to receive from us.
        </FieldDescription>
        
        <FieldGroup>
          <Field orientation="horizontal">
            <Switch
              id="email_notifications"
              checked={preferences.email_notifications}
              onCheckedChange={(checked) => setPreferences(prev => ({ ...prev, email_notifications: checked }))}
            />
            <FieldContent>
              <FieldLabel htmlFor="email_notifications">
                Email Notifications
              </FieldLabel>
              <FieldDescription>
                Receive important updates and account-related emails.
              </FieldDescription>
            </FieldContent>
          </Field>

          <Field orientation="horizontal">
            <Switch
              id="marketing_emails"
              checked={preferences.marketing_emails}
              onCheckedChange={(checked) => setPreferences(prev => ({ ...prev, marketing_emails: checked }))}
            />
            <FieldContent>
              <FieldLabel htmlFor="marketing_emails">
                Marketing Emails
              </FieldLabel>
              <FieldDescription>
                Receive product updates, tips, and promotional content.
              </FieldDescription>
            </FieldContent>
          </Field>

          <Field orientation="horizontal">
            <Switch
              id="security_alerts"
              checked={preferences.security_alerts}
              onCheckedChange={(checked) => setPreferences(prev => ({ ...prev, security_alerts: checked }))}
            />
            <FieldContent>
              <FieldLabel htmlFor="security_alerts">
                Security Alerts
              </FieldLabel>
              <FieldDescription>
                Receive notifications about security-related activities on your account.
              </FieldDescription>
            </FieldContent>
          </Field>
        </FieldGroup>
      </FieldSet>

      <div className="flex gap-4 mt-6">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Save Preferences"}
        </Button>
        <Button type="button" variant="outline" asChild>
          <a href="/dashboard/profile/notifications">Cancel</a>
        </Button>
      </div>
    </form>
  )
}

