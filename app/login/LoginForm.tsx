"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { DEMO_ACCOUNTS, DEMO_DEV_PASSWORD, DEMO_EMAIL, type DemoRole } from "../../lib/demo";

export function LoginForm({ shopName, demo = false }: { shopName: string; demo?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState(demo ? DEMO_EMAIL : process.env.NODE_ENV === "development" ? "owner@lapmart.lk" : "");
  const [password, setPassword] = useState(demo ? DEMO_DEV_PASSWORD : process.env.NODE_ENV === "development" ? "devicepass" : "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activeRole, setActiveRole] = useState<DemoRole | null>(null);

  async function handleOneClickDemo(role: DemoRole) {
    const account = DEMO_ACCOUNTS.find((a) => a.role === role);
    if (account) {
      setEmail(account.email);
      setPassword(account.password);
    }
    setActiveRole(role);
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ demoRole: role }),
      });

      if (!response.ok) {
        // Fallback to standard email + password login
        const fallbackRes = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: account?.email || email, password: account?.password || password }),
        });
        if (!fallbackRes.ok) {
          const data = await fallbackRes.json().catch(() => ({ error: "Demo sign in failed." }));
          setError(data.error ?? "Demo sign in failed.");
          setSubmitting(false);
          setActiveRole(null);
          return;
        }
      }

      window.location.href = "/";
    } catch {
      setError("Network connection issue. Please try again.");
      setSubmitting(false);
      setActiveRole(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "Sign in failed." }));
        setError(data.error ?? "Incorrect email or password.");
        setSubmitting(false);
        return;
      }

      window.location.href = "/";
    } catch {
      setError("Sign in error. Please check your connection.");
      setSubmitting(false);
    }
  }

  return (
    <div className="login-form-wrap">
      <div className="eyebrow">{shopName} workspace</div>
      <h2>{demo ? "Explore the live demo" : "Welcome back"}</h2>
      <p className="login-intro">
        {demo
          ? "Experience real-world laptop health inspection, hardware diagnostic scoring, P&L analytics, and digital warranties."
          : "Sign in with your staff account. Customers never need an account to view a public passport."}
      </p>

      {/* Recruiter & Guest One-Click Demo Login Box */}
      <div className="demo-recruiter-box">
        <div className="demo-recruiter-header">
          <span className="demo-recruiter-badge">⚡ Instant Recruiter Demo</span>
          <span className="demo-recruiter-hint">One-click role access</span>
        </div>
        <p className="demo-recruiter-desc">
          Click any role below to launch the dashboard with live sample data:
        </p>

        <div className="demo-roles-grid">
          {DEMO_ACCOUNTS.map((acc) => (
            <button
              key={acc.role}
              type="button"
              className={`demo-role-btn ${activeRole === acc.role ? "is-loading" : ""}`}
              onClick={() => handleOneClickDemo(acc.role)}
              disabled={submitting}
              title={`Login as ${acc.title}: ${acc.permissions}`}
            >
              <div className="demo-role-top">
                <strong className="demo-role-name">{acc.badge}</strong>
                {activeRole === acc.role ? (
                  <span className="demo-role-spinner">Logging in…</span>
                ) : (
                  <span className="demo-role-action">Enter →</span>
                )}
              </div>
              <span className="demo-role-tagline">{acc.tagline}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="demo-or-divider">
        <span>Or sign in manually</span>
      </div>

      <form className="login-form" onSubmit={submit}>
        <label>
          Email address
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <div className="error-box" role="alert">{error}</div>}
        <button className="button primary" type="submit" disabled={submitting}>
          {submitting && !activeRole ? "Signing in…" : demo ? "Sign in to demo dashboard" : "Sign in to dashboard"}
        </button>
      </form>

      <div className="local-login-note">
        <strong>Demo Credentials &amp; Safety</strong>
        <span>
          Demo password: <code style={{ fontWeight: "bold", color: "var(--forest-2)" }}>devicepass</code> (shared with all demo accounts).
          Changes may reset periodically. Fictional sample devices only.
        </span>
      </div>
    </div>
  );
}
