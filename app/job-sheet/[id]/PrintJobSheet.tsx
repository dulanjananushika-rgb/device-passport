"use client";

export function PrintJobSheet() {
  return <button className="button primary job-sheet-print" type="button" onClick={() => window.print()}>Print job sheet</button>;
}
