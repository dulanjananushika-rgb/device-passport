import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { generateThermalReceiptHtml } from "../../../lib/invoicing";

interface ReceiptPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ width?: string }>;
}

export async function generateMetadata({ params }: ReceiptPageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `POS Thermal Receipt - ${id}`,
  };
}

export default async function ReceiptPage({ params, searchParams }: ReceiptPageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const paperWidth = sp.width === "58" ? 58 : 80;

  try {
    const receiptHtml = await generateThermalReceiptHtml(id, paperWidth);

    // Inject auto-print floating bar
    const enhancedHtml = receiptHtml.replace(
      "</body>",
      `<div class="no-print" style="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#0f172a;padding:10px 20px;border-radius:12px;box-shadow:0 10px 25px rgba(0,0,0,0.5);display:flex;gap:12px;z-index:9999;">
        <button onclick="window.print()" style="background:#10b981;color:#fff;border:none;padding:8px 16px;border-radius:8px;font-weight:bold;cursor:pointer;font-family:sans-serif;font-size:13px;">🖨️ Print Receipt</button>
        <button onclick="window.close()" style="background:#334155;color:#fff;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-family:sans-serif;font-size:13px;">Close</button>
      </div>
      <style>@media print { .no-print { display: none !important; } }</style>
      <script>window.addEventListener('load', () => { setTimeout(() => { window.print(); }, 500); });</script>
      </body>`
    );

    return <div dangerouslySetInnerHTML={{ __html: enhancedHtml }} />;
  } catch (err) {
    notFound();
  }
}
