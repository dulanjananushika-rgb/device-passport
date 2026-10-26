import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const shotsDir = path.join(rootDir, "dist-codester", "screenshots");
fs.mkdirSync(shotsDir, { recursive: true });

async function main() {
  console.log("📸 Starting high-res Codester screenshot capture from live Vercel production...");
  
  // 1. Authenticate with live Vercel backend
  const loginRes = await fetch("https://device-passport-one.vercel.app/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "owner@lapmart.lk", password: "devicepass" }),
  });
  const cookieHeader = loginRes.headers.get("set-cookie");
  const cookieValue = cookieHeader.split(";")[0].split("=")[1];
  console.log("✓ Session cookie obtained.");

  // 2. Launch headless Chrome
  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const port = 9340;
  const chrome = spawn(chromePath, [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    "--disable-gpu",
    "--window-size=1600,1000",
  ]);

  await new Promise((r) => setTimeout(r, 1500));

  try {
    const versionRes = await fetch(`http://127.0.0.1:${port}/json/version`);
    const versionData = await versionRes.json();
    const wsUrl = versionData.webSocketDebuggerUrl;

    const ws = new WebSocket(wsUrl);
    await new Promise((resolve) => (ws.onopen = resolve));

    let msgId = 1;
    function send(method, params = {}) {
      return new Promise((resolve) => {
        const id = msgId++;
        const handler = (event) => {
          const res = JSON.parse(event.data);
          if (res.id === id) {
            ws.removeEventListener("message", handler);
            resolve(res.result);
          }
        };
        ws.addEventListener("message", handler);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });

    function sendPage(method, params = {}) {
      return new Promise((resolve) => {
        const id = msgId++;
        const handler = (event) => {
          const res = JSON.parse(event.data);
          if (res.id === id) {
            ws.removeEventListener("message", handler);
            resolve(res.result);
          }
        };
        ws.addEventListener("message", handler);
        ws.send(JSON.stringify({ id, method, params, sessionId }));
      });
    }

    await sendPage("Network.enable");
    await sendPage("Network.setCookie", {
      name: "devicepassport_session",
      value: cookieValue,
      domain: "device-passport-one.vercel.app",
      path: "/",
      httpOnly: true,
      secure: true,
    });
    await sendPage("Page.enable");

    async function capture(url, setupFn, outName) {
      console.log(`Navigating to ${url}...`);
      await sendPage("Page.navigate", { url });
      await new Promise((r) => setTimeout(r, 2500));
      if (setupFn) {
        await sendPage("Runtime.evaluate", { expression: setupFn });
        await new Promise((r) => setTimeout(r, 1200));
      }
      const shot = await sendPage("Page.captureScreenshot", { format: "png" });
      const outPath = path.join(shotsDir, outName);
      fs.writeFileSync(outPath, Buffer.from(shot.data, "base64"));
      console.log(`✓ Saved ${outName} (${(shot.data.length * 0.75 / 1024).toFixed(1)} KB)`);
    }

    // Shot 1: Dark Mode Dashboard Overview
    await capture(
      "https://device-passport-one.vercel.app/",
      `(() => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (!isDark) {
          const t = document.querySelector('.theme-toggle-button');
          if (t) t.click();
        }
      })()`,
      "01_dashboard_dark.png"
    );

    // Shot 2: POS Sales Workspace
    await capture(
      "https://device-passport-one.vercel.app/",
      `(() => {
        const btns = Array.from(document.querySelectorAll('.sidebar .nav-item'));
        const salesBtn = btns.find(b => b.textContent.includes('Sales'));
        if (salesBtn) salesBtn.click();
      })()`,
      "02_pos_terminal.png"
    );

    // Shot 3: Hardware Diagnostics Station (Settings)
    await capture(
      "https://device-passport-one.vercel.app/",
      `(() => {
        const btns = Array.from(document.querySelectorAll('.sidebar .nav-item'));
        const sBtn = btns.find(b => b.textContent.includes('Settings'));
        if (sBtn) sBtn.click();
        const card = document.querySelector('.tester-download-card');
        if (card) card.scrollIntoView({ behavior: 'instant', block: 'center' });
      })()`,
      "03_hardware_tester_stations.png"
    );

    // Shot 4: Customer Repair Workshop & Job Sheet Desk
    await capture(
      "https://device-passport-one.vercel.app/",
      `(() => {
        const btns = Array.from(document.querySelectorAll('.sidebar .nav-item'));
        const rBtn = btns.find(b => b.textContent.includes('Repairs'));
        if (rBtn) rBtn.click();
      })()`,
      "04_customer_repairs_desk.png"
    );

    // Shot 5: Public Verified Device Passport
    await capture(
      "https://device-passport-one.vercel.app/passport/DVP-LK-240831",
      `(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
      })()`,
      "05_public_verified_device_passport.png"
    );

    // Shot 6: Day-End Z-Report Settlement
    await capture(
      "https://device-passport-one.vercel.app/settlement",
      null,
      "06_day_end_z_report_settlement.png"
    );

    // Shot 7: Live Showroom Online Catalog
    await capture(
      "https://device-passport-one.vercel.app/catalog",
      null,
      "07_live_showroom_catalog.png"
    );

    // Shot 8: Automated Social Media Graphic Generator
    await capture(
      "https://device-passport-one.vercel.app/social-card/DVP-LK-240831",
      null,
      "08_social_media_flyer_generator.png"
    );

    ws.close();
  } finally {
    chrome.kill();
  }
  console.log("🎉 All 8 high-res screenshots captured successfully!");
}

main().catch(console.error);
