import type { DiagnosticReport, InspectionChecks, InspectionPhotoInput } from "./inspection";

export type TesterAgent = {
  id: string;
  name: string;
  active: boolean;
  lastSeenAt: string;
  createdBy: string;
  createdAt: string;
};

export type PendingTestRun = {
  id: string;
  agentId: string;
  agentName: string;
  report: DiagnosticReport;
  checks: Partial<InspectionChecks>;
  notes: string;
  photos: InspectionPhotoInput[];
  signatureVerified: true;
  receivedAt: string;
  serial: string;
  model: string;
};

export type SignedTestRunInput = {
  reportJson: string;
  signature: string;
  checks?: unknown;
  notes?: unknown;
  photos?: unknown;
};
