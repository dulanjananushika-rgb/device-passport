"use client";

export function PrintTestSummary() {
  return <button className="button primary" type="button" onClick={() => window.print()}>Print test summary</button>;
}
