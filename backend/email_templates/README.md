# VaaniLearn AI — Brevo SMTP & Supabase Email Templates Guide

This directory contains responsive, branded email templates for your Supabase Authentication pipeline, configured with Brevo SMTP relay (`smtp-relay.brevo.com`).

---

## 1. Brevo SMTP Settings in Supabase

Your Brevo SMTP credentials in the Supabase Dashboard:

* **Location:** `Supabase Dashboard` &rarr; `Project Settings` &rarr; `Authentication` &rarr; `SMTP Settings`
* **Enable Custom SMTP:** `ON`
* **Sender Email:** `your-verified-sender@domain.edu` (e.g., `noreply@vaanilearn.ai` or your verified Brevo sender)
* **Sender Name:** `VaaniLearn AI`
* **Host:** `smtp-relay.brevo.com`
* **Port:** `587`
* **User:** `[Your Brevo SMTP Login]`
* **Password:** `[Your Brevo SMTP Master Key]`

---

## 2. Configuring Email Templates in Supabase

Go to: `Supabase Dashboard` &rarr; `Authentication` &rarr; `Email Templates`

### A. Confirm Signup (OTP Verification)
* **Template Tab:** `Confirm signup`
* **Subject:** `Verify your VaaniLearn AI account`
* **Body:** Copy and paste the entire HTML from [`signup_verification_otp.html`](./signup_verification_otp.html).
* **CRITICAL NOTE:** This template uses `{{ .Token }}` which inserts the **6-digit numerical OTP code** into the email for your OTP input screen!

### B. Reset Password (Password Recovery)
* **Template Tab:** `Reset password`
* **Subject:** `Reset your VaaniLearn AI password`
* **Body:** Copy and paste the HTML from [`password_recovery.html`](./password_recovery.html).

### C. Welcome Email
* Can be sent on first login or triggered via a Supabase database webhook / Edge Function on user confirmation.
* HTML template: [`welcome_email.html`](./welcome_email.html).

