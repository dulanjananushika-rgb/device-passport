const checks = [
  {
    name: "DEVICEPASSPORT_ADMIN_EMAIL",
    ok: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.DEVICEPASSPORT_ADMIN_EMAIL ?? ""),
    help: "Set a valid Owner seed email.",
  },
  {
    name: "DEVICEPASSPORT_ADMIN_PASSWORD",
    ok: (process.env.DEVICEPASSPORT_ADMIN_PASSWORD ?? "").length >= 12,
    help: "Use an Owner seed password with at least 12 characters.",
  },
  {
    name: "DEVICEPASSPORT_SESSION_SECRET",
    ok: (process.env.DEVICEPASSPORT_SESSION_SECRET ?? "").length >= 32,
    help: "Use a unique session secret with at least 32 characters.",
  },
  {
    name: "NEXT_PUBLIC_APP_URL",
    ok: /^https:\/\/[^\s/]+(?:\/.*)?$/.test(process.env.NEXT_PUBLIC_APP_URL ?? ""),
    help: "Set the deployed HTTPS application origin.",
  },
];

for (const check of checks) console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name} — ${check.ok ? "configured" : check.help}`);
if (checks.some((check) => !check.ok)) process.exitCode = 1;
