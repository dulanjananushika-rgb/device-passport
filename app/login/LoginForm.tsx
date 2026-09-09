"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { DEMO_EMAIL, DEMO_PASSWORD } from "../../lib/demo";

export function LoginForm({ shopName, demo = false }: { shopName: string; demo?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState(demo ? DEMO_EMAIL : process.env.NODE_ENV === "development" ? "owner@lapmart.lk" : "");
  const [password, setPassword] = useState(demo ? DEMO_PASSWORD : process.env.NODE_ENV === "development" ? "devicepass" : "");
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

    router.push("/");
    router.refresh();
  }

  return (
    <div className="login-form-wrap">
      <div className="eyebrow">{shopName} workspace</div>
      <h2>{demo ? "Explore the live demo" : "Welcome back"}</h2>
      <p className="login-intro">{demo ? "Try device inspections, sales, warranties, claims, and shop analytics with shared sample data. The demo login is already filled in." : "Sign in with your staff account. Customers never need an account to view a public passport."}</p>
      <form className="login-form" onSubmit={submit}>
        <label>Email address<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Password<input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error && <div className="error-box" role="alert">{error}</div>}
        <button className="button primary" type="submit" disabled={submitting}>{submitting ? "Signing in…" : demo ? "Explore demo dashboard" : "Sign in to dashboard"}</button>
      </form>
      {demo ? <div className="local-login-note"><strong>Public portfolio demo</strong><span>Use fictional information only. Changes are shared with other visitors and may reset when the server sleeps or restarts.</span></div> : process.env.NODE_ENV === "development" ? <div className="local-login-note"><strong>Local development</strong><span>The seeded Owner account is prefilled. Additional staff accounts are managed inside the dashboard.</span></div> : null}
    </div>
  );
}
