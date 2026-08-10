"use client";

import { FormEvent, useState } from "react";

export function LoginForm() {
  const [email, setEmail] = useState(process.env.NODE_ENV === "development" ? "owner@lapmart.lk" : "");
  const [password, setPassword] = useState(process.env.NODE_ENV === "development" ? "devicepass" : "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: "Sign in failed." }));
      setError(data.error ?? "Sign in failed.");
      setSubmitting(false);
      return;
    }

    window.location.assign("/");
  }

  return (
    <div className="login-form-wrap">
      <div className="eyebrow">Shop workspace</div>
      <h2>Welcome back</h2>
      <p className="login-intro">Sign in with your DevicePassport account. Customers never need an account to view a public passport.</p>
      <form className="login-form" onSubmit={submit}>
        <label>Email address<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Password<input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error && <div className="error-box" role="alert">{error}</div>}
        <button className="button primary" type="submit" disabled={submitting}>{submitting ? "Signing in…" : "Sign in to dashboard"}</button>
      </form>
      <div className="local-login-note"><strong>Local development</strong><span>Demo credentials are prefilled. Production requires environment credentials.</span></div>
    </div>
  );
}
