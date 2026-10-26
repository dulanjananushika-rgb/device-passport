import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { generateA4InvoiceHtml } from "../../../lib/invoicing";

interface InvoicePageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: InvoicePageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `A4 Corporate Invoice - ${id}`,
  };
}

export default async function InvoicePage({ params }: InvoicePageProps) {
  const { id } = await params;

  try {
    const invoiceHtml = await generateA4InvoiceHtml(id);

    // Inject floating print button
    const enhancedHtml = invoiceHtml.replace(
      "</body>",
      `<div class="no-print" style="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#0f172a;padding:10px 20px;border-radius:12px;box-shadow:0 10px 25px rgba(0,0,0,0.5);display:flex;gap:12px;z-index:9999;">
        <button onclick="window.print()" style="background:#0284c7;color:#fff;border:none;padding:8px 16px;border-radius:8px;font-weight:bold;cursor:pointer;font-family:sans-serif;font-size:13px;">🖨️ Print A4 Invoice</button>
        <button onclick="window.close()" style="background:#334155;color:#fff;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-family:sans-serif;font-size:13px;">Close</button>
      </div>
      <style>@media print { .no-print { display: none !important; } }</style>
      </body>`
    );

    return <div dangerouslySetInnerHTML={{ __html: enhancedHtml }} />;
  } catch (err) {
    notFound();
  }
}
