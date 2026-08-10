import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

const baseUrl = process.env.DEVICEPASSPORT_TEST_URL ?? "http://localhost:3000";
const serial = `CODEX-SMOKE-${Date.now()}`;
const tinyPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function expectOk(response, step) {
  if (!response.ok) throw new Error(`${step} failed (${response.status}): ${await response.text()}`);
  return response;
}

try {
  const login = await expectOk(await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "owner@lapmart.lk", password: "devicepass" }),
  }), "Login");
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie) throw new Error("Login did not return a session cookie.");

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
    deviceId: device.id,
    claimId: claim.id,
  }, null, 2));
} finally {
  const database = new DatabaseSync(new URL("../.data/device-passport.db", import.meta.url));
  database.exec("PRAGMA foreign_keys = ON");
  const result = database.prepare("DELETE FROM devices WHERE serial = ?").run(serial);
  database.close();
  console.log(`Cleaned smoke-test devices: ${result.changes}`);
}
