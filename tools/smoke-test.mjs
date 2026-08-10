import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

const baseUrl = process.env.DEVICEPASSPORT_TEST_URL ?? "http://localhost:3000";
const runId = Date.now();
const serial = `CODEX-SMOKE-${runId}`;
const staffEmail = `smoke-${runId}@example.com`;
const temporaryPassword = "SmokePass!234";
const changedPassword = "SmokePass!567";
const tinyPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
let createdDeviceId = "";
let createdClaimId = "";

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

  const settingsResponse = await expectOk(await fetch(`${baseUrl}/api/settings`, { headers: { cookie } }), "Shop settings");
  const { settings } = await settingsResponse.json();
  if (!settings.shopName || !settings.warrantyMonths) throw new Error("Shop settings were not returned.");

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

  const passport = await expectOk(await fetch(`${baseUrl}/passport/${device.id}`), "Public passport");
  const passportHtml = await passport.text();
  if (!passportHtml.includes("Smoke-test evidence note")) throw new Error("Technician notes were not rendered.");
  const photoPath = passportHtml.match(/\/api\/public\/passports\/[^"']+\/photos\/[^"']+/)?.[0];
  if (!photoPath) throw new Error("The evidence photo URL was not rendered.");

  const photo = await expectOk(await fetch(`${baseUrl}${photoPath}`), "Evidence photo");
  if (photo.headers.get("content-type") !== "image/png") throw new Error("Evidence photo has the wrong content type.");
  const label = await expectOk(await fetch(`${baseUrl}/label/${device.id}`), "Print label");
  const labelHtml = await label.text();
  if (!labelHtml.includes("40 × 25 mm")) throw new Error("The printable label page was not rendered.");

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
  if (!claimsPayload.claims.some((item) => item.id === claim.id)) throw new Error("The submitted claim was not in the shop inbox.");
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

  console.log(JSON.stringify({
    login: login.status,
    import: imported.status,
    passport: passport.status,
    photo: photo.status,
    label: label.status,
    claim: claimSubmission.status,
    tracker: tracker.status,
    claimPhoto: claimPhoto.status,
    inbox: claimsInbox.status,
    statusUpdate: statusUpdate.status,
    settings: settingsResponse.status,
    staffCreate: staffCreation.status,
    passwordChange: passwordChange.status,
    roleUpdate: roleUpdate.status,
    supportReportDenied: forbiddenReport.status,
    supportStaffDenied: forbiddenStaff.status,
    audit: auditResponse.status,
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
  database.close();
  console.log(`Cleaned smoke-test data: ${deviceResult.changes} device, ${staffResult.changes} staff, ${auditResult.changes} audit events`);
}
