import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const releaseDir = path.join(rootDir, "dist-release");
const stageDir = path.join(releaseDir, "DevicePassport-v1.0.0");
const zipPath = path.join(releaseDir, "DevicePassport-v1.0.0-Commercial.zip");

console.log("🚀 Starting DevicePassport Commercial Release Packaging...");

// Clean existing release directory
if (existsSync(stageDir)) rmSync(stageDir, { recursive: true, force: true });
if (existsSync(zipPath)) rmSync(zipPath, { force: true });
mkdirSync(stageDir, { recursive: true });

// Directories to copy
const copyDirs = ["app", "docs", "examples", "lib", "public", "tools", "tests"];
for (const dir of copyDirs) {
  const src = path.join(rootDir, dir);
  const dest = path.join(stageDir, dir);
  if (existsSync(src)) {
    console.log(`Copying ${dir}/...`);
    cpSync(src, dest, { recursive: true });
  }
}

// Envato CodeCanyon standard documentation folder
const docsSrc = path.join(rootDir, 'docs');
const docDest = path.join(stageDir, 'documentation');
if (existsSync(docsSrc)) {
  console.log('Copying documentation/ for CodeCanyon compliance...');
  cpSync(docsSrc, docDest, { recursive: true });
}

// Files to copy
const copyFiles = [
  ".dockerignore",
  ".env.example",
  ".gitignore",
  "compose.yaml",
  "Dockerfile",
  "eslint.config.mjs",
  "next.config.ts",
  "package.json",
  "package-lock.json",
  "postcss.config.mjs",
  "README.md",
  "render.yaml",
  "tsconfig.json",
];

for (const file of copyFiles) {
  const src = path.join(rootDir, file);
  const dest = path.join(stageDir, file);
  if (existsSync(src)) {
    cpSync(src, dest);
  }
}

// Add Quickstart Instructions for Buyers
const buyerQuickstart = `========================================================================
 DEVICEPASSPORT — REFURBISHED LAPTOP HEALTH & DIGITAL WARRANTY SYSTEM
 Commercial Release v1.0.0
========================================================================

Thank you for purchasing DevicePassport!

GETTING STARTED IN 3 STEPS:
------------------------------------------------------------------------
1. Open the included documentation:
   Double-click "docs/index.html" in any web browser for complete
   visual setup guides, hardware agent tutorials, and deployment steps.

2. Run with Node.js:
   - Ensure Node.js 22.13.0+ is installed.
   - Run: npm install
   - Run: npm run dev
   - Open: http://localhost:3000
   - Default local admin credentials:
     Email: owner@lapmart.lk
     Password: devicepass

3. Run with Docker (Recommended for production):
   - Run: docker compose up -d --build
   - Open: http://localhost:3000

WINDOWS HARDWARE TESTER AGENT:
------------------------------------------------------------------------
To run the automated hardware diagnostic collector and 6-step interactive
tests (Screen dead-pixel, 60-key keyboard matrix, webcam, audio tones) on
laptops in your shop:
1. Sign in to the shop dashboard as Owner.
2. Go to Settings -> Windows tester stations -> Create station.
3. Copy "tools/windows" to the laptop (or use the installer cmd).
4. Run "install-device-passport-tester.cmd" or "start-device-passport-tester.ps1".

NEED SUPPORT OR CUSTOMIZATIONS?
------------------------------------------------------------------------
Check "docs/index.html" or contact us through the marketplace support channel.
Enjoy building trust with your laptop buyers!
`;

writeFileSync(path.join(stageDir, "QUICKSTART.txt"), buyerQuickstart, "utf8");

// Use PowerShell Compress-Archive to generate clean zip
console.log("📦 Compressing into release archive...");
try {
  execSync(
    `powershell -Command "Compress-Archive -Path '${stageDir}' -DestinationPath '${zipPath}' -Force"`,
    { stdio: "inherit" }
  );
  console.log(`\n🎉 Success! Commercial Release packaged at:\n${zipPath}`);
} catch (error) {
  console.error("Compression failed:", error);
  process.exit(1);
}
