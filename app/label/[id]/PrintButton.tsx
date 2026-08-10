"use client";

export function PrintButton() {
  return (
    <button className="button primary label-print-button" type="button" onClick={() => window.print()}>
      Print label
    </button>
  );
}
