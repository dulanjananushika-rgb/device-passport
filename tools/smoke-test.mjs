import { readFile, rm } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

const baseUrl = process.env.DEVICEPASSPORT_TEST_URL ?? "http://localhost:3000";
const runId = Date.now();
const serial = `CODEX-SMOKE-${runId}`;
const staffEmail = `smoke-${runId}@example.com`;
const temporaryPassword = "SmokePass!234";
const changedPassword = "SmokePass!567";
const invoiceReference = `SMOKE-INV-${runId}`;
const tinyPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
let createdDeviceId = "";
let createdClaimId = "";
const createdBackupNames = [];

async function expectOk(response, step) {
  if (!response.ok) throw new Error(`${step} failed (${response.status}): ${await response.text()}`);
  return response;
}

async function loginAs(email, password) {
  const response = await expectOk(await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  }), `Login for ${email}`);
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie) throw new Error(`Login for ${email} did not return a session cookie.`);
  return { response, cookie };
}

try {
  const { response: login, cookie } = await loginAs("owner@lapmart.lk", "devicepass");

  const healthResponse = await expectOk(await fetch(`${baseUrl}/api/health`), "Public health check");
  const health = await healthResponse.json();
  if (health.status !== "healthy" || health.database !== "connected") throw new Error("The public health check did not report a connected database.");
  if (healthResponse.headers.get("x-frame-options") !== "DENY") throw new Error("Production security headers were not applied.");

  const settingsResponse = await expectOk(await fetch(`${baseUrl}/api/settings`, { headers: { cookie } }), "Shop settings");
  const { settings } = await settingsResponse.json();
  if (!settings.shopName || !settings.warrantyMonths) throw new Error("Shop settings were not returned.");
  const systemResponse = await expectOk(await fetch(`${baseUrl}/api/system`, { headers: { cookie } }), "System readiness");
  const { system } = await systemResponse.json();
  if (!system.checks.some((check) => check.key === "database" && check.ok)) throw new Error("System readiness did not validate the database.");

  const staffCreation = await expectOk(await fetch(`${baseUrl}/api/staff`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: "Smoke Test Technician", email: staffEmail, role: "Technician", password: temporaryPassword }),
  }), "Staff account creation");
  const { staff: createdStaff } = await staffCreation.json();
  const { cookie: technicianCookie } = await loginAs(staffEmail, temporaryPassword);
  const passwordChange = await expectOk(await fetch(`${baseUrl}/api/account/password`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: technicianCookie },
    body: JSON.stringify({ currentPassword: temporaryPassword, newPassword: changedPassword }),
  }), "Staff password change");
  const { cookie: changedStaffCookie } = await loginAs(staffEmail, changedPassword);

  const roleUpdate = await expectOk(await fetch(`${baseUrl}/api/staff/${createdStaff.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: createdStaff.name, role: "Support", active: true, password: "" }),
  }), "Staff role update");
  const forbiddenReport = await fetch(`${baseUrl}/api/reports`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: changedStaffCookie },
    body: "{}",
  });
  if (forbiddenReport.status !== 403) throw new Error(`Support report permission expected 403, received ${forbiddenReport.status}.`);
  const forbiddenStaff = await fetch(`${baseUrl}/api/staff`, { headers: { cookie: changedStaffCookie } });
  if (forbiddenStaff.status !== 403) throw new Error(`Support staff permission expected 403, received ${forbiddenStaff.status}.`);
  const forbiddenSystem = await fetch(`${baseUrl}/api/system`, { headers: { cookie: changedStaffCookie } });
  if (forbiddenSystem.status !== 403) throw new Error(`Support system permission expected 403, received ${forbiddenSystem.status}.`);

  const report = JSON.parse(await readFile(new URL("../examples/sample-device-report.json", import.meta.url), "utf8"));
  report.device.serialNumber = serial;
  const imported = await expectOk(await fetch(`${baseUrl}/api/reports`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      report,
      checks: { display: "pass", keyboard: "pass", camera: "pass", audio: "pass", ports: "pass", wireless: "pass" },
      notes: "Smoke-test evidence note: cosmetic condition verified.",
      photos: [{
        name: "smoke-proof.png",
        dataUrl: tinyPng,
      }],
    }),
  }), "Report import");
  const { device } = await imported.json();
  createdDeviceId = device.id;
  if (device.lifecycleStatus !== "Ready" || device.sale || device.warrantyEnds) throw new Error("A new verified passport did not enter the Ready lifecycle state.");

  const forbiddenActivation = await fetch(`${baseUrl}/api/devices/${device.id}/activate`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: changedStaffCookie },
    body: JSON.stringify({ customerName: "Smoke Test Customer", customerPhone: "+94 77 000 0000", customerEmail: "", invoiceReference, soldAt: new Date().toISOString().slice(0, 10) }),
  });
  if (forbiddenActivation.status !== 403) throw new Error(`Support sale activation permission expected 403, received ${forbiddenActivation.status}.`);

  const passport = await expectOk(await fetch(`${baseUrl}/passport/${device.id}`), "Public passport");
  const passportHtml = await passport.text();
  if (!passportHtml.includes("Smoke-test evidence note")) throw new Error("Technician notes were not rendered.");
  if (!passportHtml.includes("Activates at customer handover")) throw new Error("The unsold passport did not show its activation state.");
  const photoPath = passportHtml.match(/\/api\/public\/passports\/[^"']+\/photos\/[^"']+/)?.[0];
  if (!photoPath) throw new Error("The evidence photo URL was not rendered.");

  const photo = await expectOk(await fetch(`${baseUrl}${photoPath}`), "Evidence photo");
  if (photo.headers.get("content-type") !== "image/png") throw new Error("Evidence photo has the wrong content type.");
  const label = await expectOk(await fetch(`${baseUrl}/label/${device.id}`), "Print label");
  const labelHtml = await label.text();
  if (!labelHtml.includes("40 × 25 mm")) throw new Error("The printable label page was not rendered.");

  const activation = await expectOk(await fetch(`${baseUrl}/api/devices/${device.id}/activate`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      customerName: "Smoke Test Customer",
      customerEmail: "smoke@example.com",
      customerPhone: "+94 77 000 0000",
      invoiceReference,
      soldAt: new Date().toISOString().slice(0, 10),
    }),
  }), "Sale activation");
  const { device: activatedDevice } = await activation.json();
  if (activatedDevice.lifecycleStatus !== "Sold" || !activatedDevice.sale?.handoverToken || !activatedDevice.sale?.warrantyEnds) throw new Error("The sale did not activate a customer warranty.");

  const duplicateActivation = await fetch(`${baseUrl}/api/devices/${device.id}/activate`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ customerName: "Duplicate Customer", customerPhone: "+94 77 111 1111", customerEmail: "", invoiceReference: `${invoiceReference}-DUP`, soldAt: new Date().toISOString().slice(0, 10) }),
  });
  if (duplicateActivation.status !== 400) throw new Error(`Duplicate sale activation expected 400, received ${duplicateActivation.status}.`);

  const salesResponse = await expectOk(await fetch(`${baseUrl}/api/sales`, { headers: { cookie } }), "Sales inventory");
  const salesPayload = await salesResponse.json();
  if (!salesPayload.devices.some((item) => item.id === device.id && item.sale?.invoiceReference === invoiceReference)) throw new Error("The activated sale was not returned by the sales API.");
  const migratedSeed = salesPayload.devices.find((item) => item.id === "DVP-LK-240831");
  if (migratedSeed?.sale?.warrantyEnds !== "2027-02-10" || migratedSeed.sale.soldAt !== "2026-08-10") throw new Error("The legacy sale migration changed a calendar date.");
  const warrantyCard = await expectOk(await fetch(`${baseUrl}/warranty/${activatedDevice.sale.handoverToken}`), "Private warranty card");
  const warrantyCardHtml = await warrantyCard.text();
  if (!warrantyCardHtml.includes(invoiceReference) || !warrantyCardHtml.includes("Smoke Test Customer")) throw new Error("The private warranty card did not render the handover details.");

  const claimSubmission = await expectOk(await fetch(`${baseUrl}/api/public/passports/${device.id}/claims`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      customerName: "Smoke Test Customer",
      customerEmail: "smoke@example.com",
      customerPhone: "",
      category: "Battery",
      description: "Battery runtime dropped suddenly during normal customer use.",
      photos: [{ name: "claim-proof.png", dataUrl: tinyPng }],
      website: "",
    }),
  }), "Claim submission");
  const { claim } = await claimSubmission.json();
  createdClaimId = claim.id;
  const tracker = await expectOk(await fetch(`${baseUrl}/claim/${claim.trackingToken}`), "Private claim tracker");
  const trackerHtml = await tracker.text();
  if (!trackerHtml.includes(claim.id) || !trackerHtml.includes("Warranty claim received")) throw new Error("The claim tracker did not render the new claim.");
  const claimPhotoPath = trackerHtml.match(/\/api\/public\/claims\/[^"']+\/photos\/[^"']+/)?.[0];
  if (!claimPhotoPath) throw new Error("The claim evidence photo URL was not rendered.");
  const claimPhoto = await expectOk(await fetch(`${baseUrl}${claimPhotoPath}`), "Claim evidence photo");

  const claimsInbox = await expectOk(await fetch(`${baseUrl}/api/claims`, { headers: { cookie } }), "Claims inbox");
  const claimsPayload = await claimsInbox.json();
  const inboxClaim = claimsPayload.claims.find((item) => item.id === claim.id);
  if (!inboxClaim || inboxClaim.priority !== "Normal" || !inboxClaim.dueDate) throw new Error("The submitted claim did not enter the service queue with an SLA.");
  const serviceDueDate = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  const privateRepairNote = `Private diagnosis ${runId}: battery calibration required.`;
  const servicePlanUpdate = await expectOk(await fetch(`${baseUrl}/api/claims/${claim.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ priority: "Urgent", assignedToId: createdStaff.id, dueDate: serviceDueDate, internalNote: privateRepairNote }),
  }), "Claim service plan update");
  const { claim: plannedClaim } = await servicePlanUpdate.json();
  if (plannedClaim.priority !== "Urgent" || plannedClaim.assignedToId !== createdStaff.id || plannedClaim.dueDate !== serviceDueDate || !plannedClaim.internalNotes.some((note) => note.note === privateRepairNote)) throw new Error("The internal service plan was not saved.");
  const jobSheet = await expectOk(await fetch(`${baseUrl}/job-sheet/${claim.id}`, { headers: { cookie } }), "Private service job sheet");
  const jobSheetHtml = await jobSheet.text();
  if (!jobSheetHtml.includes(privateRepairNote) || !jobSheetHtml.includes("Warranty service job sheet")) throw new Error("The service job sheet did not include the private repair plan.");
  const publicAfterServicePlan = await expectOk(await fetch(`${baseUrl}/claim/${claim.trackingToken}`), "Tracker after private service update");
  if ((await publicAfterServicePlan.text()).includes(privateRepairNote)) throw new Error("An internal repair note leaked to the customer tracker.");
  const unauthenticatedJobSheet = await fetch(`${baseUrl}/job-sheet/${claim.id}`, { redirect: "manual" });
  if (![303, 307, 308].includes(unauthenticatedJobSheet.status)) throw new Error(`Unauthenticated job sheet expected a redirect, received ${unauthenticatedJobSheet.status}.`);
  const statusUpdate = await expectOk(await fetch(`${baseUrl}/api/claims/${claim.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ status: "Reviewing", note: "Smoke-test technician review started." }),
  }), "Claim status update");
  const updatedTracker = await expectOk(await fetch(`${baseUrl}/claim/${claim.trackingToken}`), "Updated claim tracker");
  const updatedTrackerHtml = await updatedTracker.text();
  if (!updatedTrackerHtml.includes("Smoke-test technician review started")) throw new Error("The customer timeline did not show the shop update.");
  const auditResponse = await expectOk(await fetch(`${baseUrl}/api/audit`, { headers: { cookie } }), "Audit history");
  const auditPayload = await auditResponse.json();
  if (!auditPayload.audit.some((event) => event.summary.includes(staffEmail))) throw new Error("Staff audit activity was not recorded.");

  const backupCreation = await expectOk(await fetch(`${baseUrl}/api/backups`, { method: "POST", headers: { cookie } }), "Manual database backup");
  const { backup } = await backupCreation.json();
  createdBackupNames.push(backup.name);
  const backupDownload = await expectOk(await fetch(`${baseUrl}/api/backups/${encodeURIComponent(backup.name)}`, { headers: { cookie } }), "Backup download");
  const backupBytes = await backupDownload.arrayBuffer();
  if (!backupDownload.headers.get("content-type")?.includes("sqlite3") || backupBytes.byteLength < 4096) throw new Error("The backup download was not a valid SQLite payload.");

  const unconfirmedRestore = await fetch(`${baseUrl}/api/backups/restore`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: backup.name, confirmation: "restore", password: "devicepass" }),
  });
  if (unconfirmedRestore.status !== 400) throw new Error(`Unconfirmed restore expected 400, received ${unconfirmedRestore.status}.`);

  const restoreResponse = await expectOk(await fetch(`${baseUrl}/api/backups/restore`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: backup.name, confirmation: "RESTORE", password: "devicepass" }),
  }), "Verified database restore");
  const { result: restoreResult } = await restoreResponse.json();
  createdBackupNames.push(restoreResult.safetyBackup.name);
  const restoredSettings = await expectOk(await fetch(`${baseUrl}/api/settings`, { headers: { cookie } }), "Post-restore reconnect");

  let rateLimitedLogin;
  for (let attempt = 0; attempt < 9; attempt += 1) {
    rateLimitedLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: `limited-${runId}@example.com`, password: "wrong-password" }),
    });
  }
  if (rateLimitedLogin?.status !== 429 || !rateLimitedLogin.headers.get("retry-after")) throw new Error("Login rate limiting did not activate after repeated failures.");

  console.log(JSON.stringify({
    login: login.status,
    health: healthResponse.status,
    system: systemResponse.status,
    import: imported.status,
    passport: passport.status,
    photo: photo.status,
    label: label.status,
    activation: activation.status,
    warrantyCard: warrantyCard.status,
    sales: salesResponse.status,
    claim: claimSubmission.status,
    tracker: tracker.status,
    claimPhoto: claimPhoto.status,
    inbox: claimsInbox.status,
    servicePlan: servicePlanUpdate.status,
    jobSheet: jobSheet.status,
    jobSheetProtected: unauthenticatedJobSheet.status,
    statusUpdate: statusUpdate.status,
    settings: settingsResponse.status,
    staffCreate: staffCreation.status,
    passwordChange: passwordChange.status,
    roleUpdate: roleUpdate.status,
    supportReportDenied: forbiddenReport.status,
    supportStaffDenied: forbiddenStaff.status,
    supportSaleDenied: forbiddenActivation.status,
    duplicateSaleDenied: duplicateActivation.status,
    audit: auditResponse.status,
    backup: backupCreation.status,
    backupDownload: backupDownload.status,
    restoreGuard: unconfirmedRestore.status,
    restore: restoreResponse.status,
    postRestore: restoredSettings.status,
    loginRateLimit: rateLimitedLogin.status,
    supportSystemDenied: forbiddenSystem.status,
    deviceId: device.id,
    claimId: claim.id,
  }, null, 2));
} finally {
  const database = new DatabaseSync(new URL("../.data/device-passport.db", import.meta.url));
  database.exec("PRAGMA foreign_keys = ON");
  const deviceResult = database.prepare("DELETE FROM devices WHERE serial = ?").run(serial);
  const staffResult = database.prepare("DELETE FROM staff_users WHERE email = ?").run(staffEmail);
  const auditResult = database.prepare(`
    DELETE FROM audit_events
    WHERE actor = ? OR summary LIKE ? OR summary LIKE ? OR summary LIKE ? OR summary LIKE ?
  `).run(staffEmail, `%${staffEmail}%`, `%${serial}%`, `%${createdDeviceId}%`, `%${createdClaimId}%`);
  const backupAudit = database.prepare("DELETE FROM audit_events WHERE summary LIKE ?");
  let backupAuditChanges = 0;
  for (const backupName of createdBackupNames) backupAuditChanges += Number(backupAudit.run(`%${backupName}%`).changes);
  database.close();
  for (const backupName of createdBackupNames) await rm(new URL(`../.data/backups/${backupName}`, import.meta.url), { force: true });
  console.log(`Cleaned smoke-test data: ${deviceResult.changes} device, ${staffResult.changes} staff, ${Number(auditResult.changes) + backupAuditChanges} audit events, ${createdBackupNames.length} backups`);
}
