import { readFile, rm } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { createHmac } from "node:crypto";

const baseUrl = process.env.DEVICEPASSPORT_TEST_URL ?? "http://localhost:3000";
const runId = Date.now();
const serial = `CODEX-SMOKE-${runId}`;
const staffEmail = `smoke-${runId}@example.com`;
const temporaryPassword = "SmokePass!234";
const changedPassword = "SmokePass!567";
const invoiceReference = `SMOKE-INV-${runId}`;
const supplierName = `Smoke Supplier ${runId}`;
const testerAgentName = `Smoke Tester ${runId}`;
const restoreTestIp = `198.51.100.${(runId % 200) + 1}`;
const tinyPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
let createdDeviceId = "";
let createdClaimId = "";
let createdSupplierId = "";
let createdIntakeId = "";
let createdTesterAgentId = "";
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
  const warrantyReminderTarget = new Date(Date.now() + 10 * 86_400_000);
  warrantyReminderTarget.setUTCMonth(warrantyReminderTarget.getUTCMonth() - settings.warrantyMonths);
  const saleDateForReminder = warrantyReminderTarget.toISOString().slice(0, 10);
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

  const technicianProcurement = await expectOk(await fetch(`${baseUrl}/api/procurement`, { headers: { cookie: changedStaffCookie } }), "Technician procurement access");
  const technicianTestRuns = await expectOk(await fetch(`${baseUrl}/api/test-runs`, { headers: { cookie: changedStaffCookie } }), "Technician connected-test access");

  const testerAgentCreation = await expectOk(await fetch(`${baseUrl}/api/tester-agents`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: testerAgentName }),
  }), "Tester agent creation");
  const { agent: createdTesterAgent, token: testerAgentToken } = await testerAgentCreation.json();
  createdTesterAgentId = createdTesterAgent.id;
  if (!testerAgentToken.startsWith(`${createdTesterAgent.id}.`)) throw new Error("The tester token did not contain its station identity.");

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
  const forbiddenAnalytics = await fetch(`${baseUrl}/api/analytics`, { headers: { cookie: changedStaffCookie } });
  if (forbiddenAnalytics.status !== 403) throw new Error(`Support analytics permission expected 403, received ${forbiddenAnalytics.status}.`);
  const forbiddenProcurement = await fetch(`${baseUrl}/api/procurement`, { headers: { cookie: changedStaffCookie } });
  if (forbiddenProcurement.status !== 403) throw new Error(`Support procurement permission expected 403, received ${forbiddenProcurement.status}.`);
  const forbiddenTesterAgents = await fetch(`${baseUrl}/api/tester-agents`, { headers: { cookie: changedStaffCookie } });
  if (forbiddenTesterAgents.status !== 403) throw new Error(`Support tester-agent permission expected 403, received ${forbiddenTesterAgents.status}.`);
  const forbiddenTestRuns = await fetch(`${baseUrl}/api/test-runs`, { headers: { cookie: changedStaffCookie } });
  if (forbiddenTestRuns.status !== 403) throw new Error(`Support connected-test permission expected 403, received ${forbiddenTestRuns.status}.`);
  const unauthenticatedTesterAgents = await fetch(`${baseUrl}/api/tester-agents`);
  if (unauthenticatedTesterAgents.status !== 401) throw new Error(`Unauthenticated tester-agent access expected 401, received ${unauthenticatedTesterAgents.status}.`);

  const supplierCreation = await expectOk(await fetch(`${baseUrl}/api/procurement/suppliers`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ name: supplierName, contactName: "Smoke Vendor", email: "vendor@example.com", phone: "+94 77 555 0000" }),
  }), "Supplier creation");
  const { supplier: createdSupplier } = await supplierCreation.json();
  createdSupplierId = createdSupplier.id;
  const forbiddenSupplierCreation = await fetch(`${baseUrl}/api/procurement/suppliers`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: changedStaffCookie },
    body: JSON.stringify({ name: `${supplierName} forbidden`, contactName: "", email: "", phone: "" }),
  });
  if (forbiddenSupplierCreation.status !== 403) throw new Error(`Support supplier permission expected 403, received ${forbiddenSupplierCreation.status}.`);

  const intakeCreation = await expectOk(await fetch(`${baseUrl}/api/procurement`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ supplierId: createdSupplier.id, deviceName: "Smoke Test Laptop", model: "Smoke Model", serial, supplierInvoice: `SUP-${runId}`, purchasedAt: new Date().toISOString().slice(0, 10), purchaseCostLkr: "100000", notes: "Smoke intake received with charger." }),
  }), "Stock intake creation");
  const { intake: createdIntake } = await intakeCreation.json();
  createdIntakeId = createdIntake.id;
  if (createdIntake.status !== "Awaiting test" || createdIntake.purchaseCostCents !== 10_000_000 || createdIntake.deviceId) throw new Error("New stock did not enter the Awaiting test queue with its exact purchase cost.");
  const duplicateIntake = await fetch(`${baseUrl}/api/procurement`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ supplierId: createdSupplier.id, deviceName: "Duplicate", model: "Duplicate", serial, supplierInvoice: `DUP-${runId}`, purchasedAt: new Date().toISOString().slice(0, 10), purchaseCostLkr: "1", notes: "" }),
  });
  if (duplicateIntake.status !== 400) throw new Error(`Duplicate intake serial expected 400, received ${duplicateIntake.status}.`);
  const initialProcurement = await expectOk(await fetch(`${baseUrl}/api/procurement`, { headers: { cookie } }), "Initial procurement dashboard");
  const initialProcurementPayload = await initialProcurement.json();
  if (!initialProcurementPayload.procurement.intakes.some((item) => item.id === createdIntake.id && item.status === "Awaiting test") || initialProcurementPayload.procurement.metrics.inventoryValueCents < 10_000_000) throw new Error("The initial intake queue or stock valuation was incorrect.");
  const intakeLabel = await expectOk(await fetch(`${baseUrl}/intake-label/${createdIntake.id}`, { headers: { cookie } }), "Private intake label");
  const intakeLabelHtml = await intakeLabel.text();
  if (!intakeLabelHtml.includes(createdIntake.id) || !intakeLabelHtml.includes(serial)) throw new Error("The printable intake label did not contain the intake identity and serial.");
  const unauthenticatedIntakeLabel = await fetch(`${baseUrl}/intake-label/${createdIntake.id}`, { redirect: "manual" });
  if (![303, 307, 308].includes(unauthenticatedIntakeLabel.status)) throw new Error(`Unauthenticated intake label expected a redirect, received ${unauthenticatedIntakeLabel.status}.`);
  const unauthenticatedProcurement = await fetch(`${baseUrl}/api/procurement`);
  if (unauthenticatedProcurement.status !== 401) throw new Error(`Unauthenticated procurement expected 401, received ${unauthenticatedProcurement.status}.`);

  const report = JSON.parse(await readFile(new URL("../examples/sample-device-report.json", import.meta.url), "utf8"));
  report.device.serialNumber = serial;
  const reportJson = JSON.stringify(report);
  const signature = createHmac("sha256", testerAgentToken).update(reportJson, "utf8").digest("hex");
  const tamperedUpload = await fetch(`${baseUrl}/api/agent/test-runs`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${testerAgentToken}` },
    body: JSON.stringify({ reportJson: `${reportJson} `, signature, checks: {} }),
  });
  if (tamperedUpload.status !== 401) throw new Error(`Tampered signed report expected 401, received ${tamperedUpload.status}.`);
  const signedUpload = await expectOk(await fetch(`${baseUrl}/api/agent/test-runs`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${testerAgentToken}` },
    body: JSON.stringify({
      reportJson,
      signature,
      checks: { display: "pass", keyboard: "pass", camera: "pass", audio: "pass", ports: "pass", wireless: "pass" },
      notes: "Smoke-test evidence note: cosmetic condition verified.",
      photos: [{ name: "smoke-proof.png", dataUrl: tinyPng }],
    }),
  }), "Signed tester upload");
  const { testRun: uploadedTestRun } = await signedUpload.json();
  if (!uploadedTestRun.signatureVerified || uploadedTestRun.serial !== serial) throw new Error("The tester upload was not marked as signature verified.");
  const replayUpload = await fetch(`${baseUrl}/api/agent/test-runs`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${testerAgentToken}` },
    body: JSON.stringify({ reportJson, signature }),
  });
  if (replayUpload.status !== 409) throw new Error(`Signed report replay expected 409, received ${replayUpload.status}.`);
  const connectedInbox = await expectOk(await fetch(`${baseUrl}/api/test-runs`, { headers: { cookie } }), "Connected report inbox");
  const connectedInboxPayload = await connectedInbox.json();
  if (!connectedInboxPayload.testRuns.some((item) => item.id === uploadedTestRun.id && item.signatureVerified && item.serial === serial)) throw new Error("The signed upload did not reach the connected report inbox.");
  const imported = await expectOk(await fetch(`${baseUrl}/api/reports`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      testRunId: uploadedTestRun.id,
      checks: { display: "pass", keyboard: "pass", camera: "pass", audio: "pass", ports: "pass", wireless: "pass" },
      notes: "Smoke-test evidence note: cosmetic condition verified.",
      photos: [{ name: "smoke-proof.png", dataUrl: tinyPng }],
    }),
  }), "Report import");
  const { device } = await imported.json();
  createdDeviceId = device.id;
  if (device.lifecycleStatus !== "Ready" || device.sale || device.warrantyEnds) throw new Error("A new verified passport did not enter the Ready lifecycle state.");
  if (device.diagnostics?.batteryCycleCount !== 184 || device.diagnostics?.storagePowerOnHours !== 1842 || device.diagnostics?.cpuStressPassed !== true || device.diagnostics?.cpuStressCompletedWorkers !== 4 || device.diagnostics?.cpuPeakTemperatureC !== 72) throw new Error("Tester V2 evidence was not preserved on the device record.");
  const importedInbox = await expectOk(await fetch(`${baseUrl}/api/test-runs`, { headers: { cookie } }), "Imported report removal");
  if ((await importedInbox.json()).testRuns.some((item) => item.id === uploadedTestRun.id)) throw new Error("An imported connected report remained in the pending inbox.");

  const taskCreation = await expectOk(await fetch(`${baseUrl}/api/procurement/intakes/${createdIntake.id}/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ category: "Part", description: "Replacement battery and installation", costLkr: "15000" }),
  }), "Refurbishment task creation");
  const { task: createdTask } = await taskCreation.json();
  if (createdTask.costCents !== 1_500_000 || createdTask.completed) throw new Error("The refurbishment task or cost was not recorded correctly.");
  const taskCompletion = await expectOk(await fetch(`${baseUrl}/api/procurement/tasks/${createdTask.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ completed: true }),
  }), "Refurbishment task completion");
  const completedTaskIntake = (await taskCompletion.json()).intake;
  if (completedTaskIntake.deviceId !== device.id || completedTaskIntake.status !== "Ready" || completedTaskIntake.refurbishmentCostCents !== 1_500_000 || !completedTaskIntake.tasks.some((item) => item.id === createdTask.id && item.completed)) throw new Error("Diagnostic auto-link or refurbishment task completion did not reach Ready stock.");
  const forbiddenTaskUpdate = await fetch(`${baseUrl}/api/procurement/tasks/${createdTask.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: changedStaffCookie },
    body: JSON.stringify({ completed: false }),
  });
  if (forbiddenTaskUpdate.status !== 403) throw new Error(`Support refurbishment permission expected 403, received ${forbiddenTaskUpdate.status}.`);

  const financeUpdate = await expectOk(await fetch(`${baseUrl}/api/finance/devices/${device.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ purchaseCostLkr: "100000", refurbishmentCostLkr: "15000" }),
  }), "Device finance update");
  const financedDevice = (await financeUpdate.json()).device;
  if (financedDevice.purchaseCostCents !== 10_000_000 || financedDevice.refurbishmentCostCents !== 1_500_000) throw new Error("Device costs were not stored as exact minor units.");
  const forbiddenFinanceUpdate = await fetch(`${baseUrl}/api/finance/devices/${device.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: changedStaffCookie },
    body: JSON.stringify({ purchaseCostLkr: "1", refurbishmentCostLkr: "1" }),
  });
  if (forbiddenFinanceUpdate.status !== 403) throw new Error(`Support finance update permission expected 403, received ${forbiddenFinanceUpdate.status}.`);

  const readyNotifications = await expectOk(await fetch(`${baseUrl}/api/notifications`, { headers: { cookie } }), "Ready-stock notifications");
  const readyNotificationPayload = await readyNotifications.json();
  const readyNotification = readyNotificationPayload.notifications.find((item) => item.entityId === device.id && item.type === "ReadyDevice");
  if (!readyNotification || readyNotification.status !== "Pending") throw new Error("Ready stock did not create an internal notification.");

  const forbiddenActivation = await fetch(`${baseUrl}/api/devices/${device.id}/activate`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: changedStaffCookie },
    body: JSON.stringify({ customerName: "Smoke Test Customer", customerPhone: "+94 77 000 0000", customerEmail: "", invoiceReference, soldAt: saleDateForReminder }),
  });
  if (forbiddenActivation.status !== 403) throw new Error(`Support sale activation permission expected 403, received ${forbiddenActivation.status}.`);

  const passport = await expectOk(await fetch(`${baseUrl}/passport/${device.id}`), "Public passport");
  const passportHtml = await passport.text();
  if (!passportHtml.includes("Smoke-test evidence note")) throw new Error("Technician notes were not rendered.");
  if (!passportHtml.includes("184 cycles") || !passportHtml.includes("1,842 power-on hours") || !passportHtml.includes("4/4 workers completed") || !passportHtml.includes("72°C peak")) throw new Error("The public passport did not render Tester V2 diagnostic evidence.");
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
      soldAt: saleDateForReminder,
      salePriceLkr: "160000",
    }),
  }), "Sale activation");
  const { device: activatedDevice } = await activation.json();
  if (activatedDevice.lifecycleStatus !== "Sold" || !activatedDevice.sale?.handoverToken || !activatedDevice.sale?.warrantyEnds) throw new Error("The sale did not activate a customer warranty.");

  const saleNotifications = await expectOk(await fetch(`${baseUrl}/api/notifications`, { headers: { cookie } }), "Warranty reminder notifications");
  const saleNotificationPayload = await saleNotifications.json();
  const resolvedReadyNotification = saleNotificationPayload.notifications.find((item) => item.id === readyNotification.id);
  const warrantyNotification = saleNotificationPayload.notifications.find((item) => item.entityId === device.id && (item.type === "Warranty30" || item.type === "Warranty7"));
  if (resolvedReadyNotification?.status !== "Resolved" || !warrantyNotification || warrantyNotification.status !== "Pending") throw new Error("Sale activation did not resolve Ready stock and create a warranty reminder.");

  const duplicateActivation = await fetch(`${baseUrl}/api/devices/${device.id}/activate`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ customerName: "Duplicate Customer", customerPhone: "+94 77 111 1111", customerEmail: "", invoiceReference: `${invoiceReference}-DUP`, soldAt: saleDateForReminder }),
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
  if (!warrantyCardHtml.includes("No service claims recorded")) throw new Error("The clean private service history state was not rendered.");

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

  const claimNotifications = await expectOk(await fetch(`${baseUrl}/api/notifications`, { headers: { cookie } }), "New-claim notifications");
  const claimNotificationPayload = await claimNotifications.json();
  const claimNotification = claimNotificationPayload.notifications.find((item) => item.entityId === claim.id && item.type === "NewClaim");
  if (!claimNotification || claimNotification.status !== "Pending" || !claimNotification.message.includes(claim.trackingToken)) throw new Error("The new claim notification or customer template was not created.");
  const emailComposer = await expectOk(await fetch(`${baseUrl}/api/notifications/${claimNotification.id}/open`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ channel: "Email" }),
  }), "Notification email composer");
  const emailComposerPayload = await emailComposer.json();
  if (!emailComposerPayload.href.startsWith("mailto:smoke%40example.com") || emailComposerPayload.notification.status !== "Opened" || !emailComposerPayload.notification.actions.some((action) => action.action === "Composer opened" && action.channel === "Email")) throw new Error("The email composer action was not prepared and logged.");
  const missingWhatsApp = await fetch(`${baseUrl}/api/notifications/${claimNotification.id}/open`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ channel: "WhatsApp" }),
  });
  if (missingWhatsApp.status !== 400) throw new Error(`Missing WhatsApp contact expected 400, received ${missingWhatsApp.status}.`);
  const notificationDone = await expectOk(await fetch(`${baseUrl}/api/notifications/${claimNotification.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ status: "Done" }),
  }), "Notification completion");
  const notificationDonePayload = await notificationDone.json();
  if (notificationDonePayload.notification.status !== "Done" || !notificationDonePayload.notification.actions.some((action) => action.action === "Marked done")) throw new Error("Notification completion was not logged.");
  const unauthenticatedNotifications = await fetch(`${baseUrl}/api/notifications`);
  if (unauthenticatedNotifications.status !== 401) throw new Error(`Unauthenticated notification inbox expected 401, received ${unauthenticatedNotifications.status}.`);
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
    body: JSON.stringify({ priority: "Urgent", assignedToId: createdStaff.id, dueDate: serviceDueDate, internalNote: privateRepairNote, serviceCostLkr: "3500" }),
  }), "Claim service plan update");
  const { claim: plannedClaim } = await servicePlanUpdate.json();
  if (plannedClaim.priority !== "Urgent" || plannedClaim.assignedToId !== createdStaff.id || plannedClaim.dueDate !== serviceDueDate || plannedClaim.serviceCostCents !== 350_000 || !plannedClaim.internalNotes.some((note) => note.note === privateRepairNote)) throw new Error("The internal service plan or warranty cost was not saved.");
  const forbiddenServiceCost = await fetch(`${baseUrl}/api/claims/${claim.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: changedStaffCookie },
    body: JSON.stringify({ serviceCostLkr: "1" }),
  });
  if (forbiddenServiceCost.status !== 403) throw new Error(`Support warranty cost permission expected 403, received ${forbiddenServiceCost.status}.`);
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
  const serviceHistory = await expectOk(await fetch(`${baseUrl}/warranty/${activatedDevice.sale.handoverToken}`), "Consolidated warranty service history");
  const serviceHistoryHtml = await serviceHistory.text();
  if (!serviceHistoryHtml.includes(claim.id) || !serviceHistoryHtml.includes("Smoke-test technician review started") || !serviceHistoryHtml.includes("Open claim timeline")) throw new Error("The private warranty card did not consolidate the device service history.");
  if (serviceHistoryHtml.includes(privateRepairNote)) throw new Error("An internal repair note leaked to the consolidated customer service history.");
  const auditResponse = await expectOk(await fetch(`${baseUrl}/api/audit`, { headers: { cookie } }), "Audit history");
  const auditPayload = await auditResponse.json();
  if (!auditPayload.audit.some((event) => event.summary.includes(staffEmail))) throw new Error("Staff audit activity was not recorded.");

  const analyticsResponse = await expectOk(await fetch(`${baseUrl}/api/analytics`, { headers: { cookie } }), "Owner finance analytics");
  const analyticsPayload = await analyticsResponse.json();
  const analyticsDevice = analyticsPayload.analytics.devices.find((item) => item.deviceId === device.id);
  if (!analyticsDevice || analyticsDevice.salePriceCents !== 16_000_000 || analyticsDevice.warrantyCostCents !== 350_000 || analyticsDevice.grossProfitCents !== 4_150_000) throw new Error("Finance analytics did not calculate the expected LKR 41,500 device profit.");
  const analyticsExport = await expectOk(await fetch(`${baseUrl}/api/analytics/export`, { headers: { cookie } }), "Finance CSV export");
  const analyticsCsv = await analyticsExport.text();
  if (!analyticsExport.headers.get("content-type")?.includes("text/csv") || !analyticsCsv.includes(device.id) || !analyticsCsv.includes("41500.00")) throw new Error("The finance CSV did not contain the expected device profit row.");
  const unauthenticatedAnalytics = await fetch(`${baseUrl}/api/analytics`);
  if (unauthenticatedAnalytics.status !== 401) throw new Error(`Unauthenticated analytics expected 401, received ${unauthenticatedAnalytics.status}.`);
  const finalProcurement = await expectOk(await fetch(`${baseUrl}/api/procurement`, { headers: { cookie } }), "Final supplier performance");
  const finalProcurementPayload = await finalProcurement.json();
  const finalIntake = finalProcurementPayload.procurement.intakes.find((item) => item.id === createdIntake.id);
  const supplierPerformance = finalProcurementPayload.procurement.supplierPerformance.find((item) => item.supplierId === createdSupplier.id);
  if (!finalIntake || finalIntake.status !== "Sold" || finalIntake.deviceId !== device.id || finalIntake.grossProfitCents !== 4_150_000) throw new Error("The procurement lifecycle did not reach Sold with the expected profit.");
  if (!supplierPerformance || supplierPerformance.sold !== 1 || supplierPerformance.claims !== 1 || supplierPerformance.affectedDevices !== 1 || supplierPerformance.grossProfitCents !== 4_150_000) throw new Error("Supplier reliability and profit performance were not calculated correctly.");

  const backupCreation = await expectOk(await fetch(`${baseUrl}/api/backups`, { method: "POST", headers: { cookie } }), "Manual database backup");
  const { backup } = await backupCreation.json();
  createdBackupNames.push(backup.name);
  const backupDownload = await expectOk(await fetch(`${baseUrl}/api/backups/${encodeURIComponent(backup.name)}`, { headers: { cookie } }), "Backup download");
  const backupBytes = await backupDownload.arrayBuffer();
  if (!backupDownload.headers.get("content-type")?.includes("sqlite3") || backupBytes.byteLength < 4096) throw new Error("The backup download was not a valid SQLite payload.");

  const unconfirmedRestore = await fetch(`${baseUrl}/api/backups/restore`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie, "x-forwarded-for": restoreTestIp },
    body: JSON.stringify({ name: backup.name, confirmation: "restore", password: "devicepass" }),
  });
  if (unconfirmedRestore.status !== 400) throw new Error(`Unconfirmed restore expected 400, received ${unconfirmedRestore.status}.`);

  const restoreResponse = await expectOk(await fetch(`${baseUrl}/api/backups/restore`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie, "x-forwarded-for": restoreTestIp },
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
    readyNotifications: readyNotifications.status,
    warrantyNotifications: saleNotifications.status,
    claimNotifications: claimNotifications.status,
    emailComposer: emailComposer.status,
    missingWhatsApp: missingWhatsApp.status,
    notificationDone: notificationDone.status,
    notificationsProtected: unauthenticatedNotifications.status,
    tracker: tracker.status,
    claimPhoto: claimPhoto.status,
    inbox: claimsInbox.status,
    servicePlan: servicePlanUpdate.status,
    jobSheet: jobSheet.status,
    jobSheetProtected: unauthenticatedJobSheet.status,
    statusUpdate: statusUpdate.status,
    serviceHistory: serviceHistory.status,
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
    supportAnalyticsDenied: forbiddenAnalytics.status,
    financeUpdate: financeUpdate.status,
    supportFinanceDenied: forbiddenFinanceUpdate.status,
    warrantyCostDenied: forbiddenServiceCost.status,
    analytics: analyticsResponse.status,
    analyticsExport: analyticsExport.status,
    analyticsProtected: unauthenticatedAnalytics.status,
    technicianProcurement: technicianProcurement.status,
    technicianTestRuns: technicianTestRuns.status,
    testerAgentCreate: testerAgentCreation.status,
    signedUpload: signedUpload.status,
    tamperedUploadDenied: tamperedUpload.status,
    replayUploadDenied: replayUpload.status,
    connectedInbox: connectedInbox.status,
    supportTesterAgentsDenied: forbiddenTesterAgents.status,
    supportTestRunsDenied: forbiddenTestRuns.status,
    supportProcurementDenied: forbiddenProcurement.status,
    supplierCreate: supplierCreation.status,
    supportSupplierDenied: forbiddenSupplierCreation.status,
    intakeCreate: intakeCreation.status,
    duplicateIntakeDenied: duplicateIntake.status,
    procurement: initialProcurement.status,
    intakeLabel: intakeLabel.status,
    intakeLabelProtected: unauthenticatedIntakeLabel.status,
    procurementProtected: unauthenticatedProcurement.status,
    refurbishmentTask: taskCreation.status,
    taskCompletion: taskCompletion.status,
    supportTaskDenied: forbiddenTaskUpdate.status,
    supplierPerformance: finalProcurement.status,
    deviceId: device.id,
    claimId: claim.id,
  }, null, 2));
} finally {
  const database = new DatabaseSync(new URL("../.data/device-passport.db", import.meta.url));
  database.exec("PRAGMA foreign_keys = ON");
  const testerAgentResult = database.prepare("DELETE FROM tester_agents WHERE id = ? OR name = ?").run(createdTesterAgentId, testerAgentName);
  const supplierResult = database.prepare("DELETE FROM suppliers WHERE id = ? OR name = ?").run(createdSupplierId, supplierName);
  const deviceResult = database.prepare("DELETE FROM devices WHERE serial = ?").run(serial);
  const staffResult = database.prepare("DELETE FROM staff_users WHERE email = ?").run(staffEmail);
  const notificationResult = database.prepare("DELETE FROM notification_queue WHERE entity_id = ? OR entity_id = ?").run(createdDeviceId, createdClaimId);
  const auditResult = database.prepare(`
    DELETE FROM audit_events
    WHERE actor = ? OR actor = ? OR summary LIKE ? OR summary LIKE ? OR summary LIKE ? OR summary LIKE ? OR summary LIKE ? OR summary LIKE ? OR summary LIKE ? OR summary LIKE ?
  `).run(staffEmail, testerAgentName, `%${staffEmail}%`, `%${serial}%`, `%${createdDeviceId}%`, `%${createdClaimId}%`, `%${createdSupplierId}%`, `%${createdIntakeId}%`, `%${supplierName}%`, `%${testerAgentName}%`);
  const backupAudit = database.prepare("DELETE FROM audit_events WHERE summary LIKE ?");
  let backupAuditChanges = 0;
  for (const backupName of createdBackupNames) backupAuditChanges += Number(backupAudit.run(`%${backupName}%`).changes);
  database.close();
  for (const backupName of createdBackupNames) await rm(new URL(`../.data/backups/${backupName}`, import.meta.url), { force: true });
  console.log(`Cleaned smoke-test data: ${testerAgentResult.changes} tester agent, ${supplierResult.changes} supplier, ${deviceResult.changes} device, ${staffResult.changes} staff, ${notificationResult.changes} notifications, ${Number(auditResult.changes) + backupAuditChanges} audit events, ${createdBackupNames.length} backups`);
}
