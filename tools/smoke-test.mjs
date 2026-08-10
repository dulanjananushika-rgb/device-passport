import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

const baseUrl = process.env.DEVICEPASSPORT_TEST_URL ?? "http://localhost:3000";
const serial = `CODEX-SMOKE-${Date.now()}`;

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
        dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
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

  console.log(JSON.stringify({
    login: login.status,
    import: imported.status,
    passport: passport.status,
    photo: photo.status,
    label: label.status,
    deviceId: device.id,
  }, null, 2));
} finally {
  const database = new DatabaseSync(new URL("../.data/device-passport.db", import.meta.url));
  database.exec("PRAGMA foreign_keys = ON");
  const result = database.prepare("DELETE FROM devices WHERE serial = ?").run(serial);
  database.close();
  console.log(`Cleaned smoke-test devices: ${result.changes}`);
}
