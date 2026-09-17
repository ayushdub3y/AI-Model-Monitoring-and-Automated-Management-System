import React from "react";

export default function AuditLogView({ onNavigateTab }) {
  const auditEntries = [
    {
      id: "aud_90218a",
      timestamp: "2025-02-27T14:22:08Z",
      actor: "autonomous-lifecycle-daemon",
      action: "SAFETY_GATE_EVALUATION",
      unit: "Customer Churn Model",
      target_version: "v3.2.2-rc1",
      result: "PASSED (7/7 Gates)",
      details: "Integrity verified, dry-run latency 18.2ms, relative F1 gain +0.024.",
    },
    {
      id: "aud_90217f",
      timestamp: "2025-02-27T13:45:12Z",
      actor: "Sarah Lin (ML Staff Eng)",
      action: "ATOMIC_ROLLBACK_STAGED",
      unit: "Customer Churn Model",
      target_version: "v3.2.1",
      result: "SUCCESS",
      details: "Rollback pointer atomic flip in SQLite registry. Zero downtime.",
    },
    {
      id: "aud_90216c",
      timestamp: "2025-02-27T12:10:00Z",
      actor: "pipeline-cron-runner",
      action: "COVARIATE_DRIFT_FLAGGED",
      unit: "Customer Churn Model",
      target_version: "v3.2.1",
      result: "WARNING_TRIGGERED",
      details: "KS-statistic for tenure p < 0.001. Threshold exceeded (0.05).",
    },
    {
      id: "aud_90215b",
      timestamp: "2025-02-27T10:30:15Z",
      actor: "system-storage-guard",
      action: "ARTIFACT_CHECKSUM_VERIFIED",
      unit: "Fraud Detection Model",
      target_version: "v4.0.0",
      result: "VERIFIED",
      details: "SHA-256: 7f8a91c2... model verified against storage whitelist.",
    },
    {
      id: "aud_90214a",
      timestamp: "2025-02-27T08:15:30Z",
      actor: "autonomous-lifecycle-daemon",
      action: "AUTO_PROMOTION_CHAMPION",
      unit: "Demand Forecast",
      target_version: "v2.1.0",
      result: "PROMOTED",
      details: "Beats incumbent by R² +0.038. All safety gates passed.",
    },
  ];

  return (
    <div className="flex flex-col w-full gap-space-xl">
      <div className="flex flex-col gap-space-xxs">
        <div className="flex items-center gap-space-xs text-on-surface-variant font-label-mono-sm text-label-mono-sm tracking-wider uppercase text-[11px]">
          <span>Governance</span>
          <span className="text-outline">/</span>
          <span className="text-primary font-semibold">Immutable Audit Trail</span>
        </div>
        <h1 className="font-display-lg text-display-lg text-on-surface tracking-tight font-bold">
          Platform Governance &amp; Audit Log
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Cryptographically signed operational ledger recording model intakes, safety gate verdicts, and rollback events.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter-normal">
        <div className="p-space-md rounded-xl bg-surface-container border border-outline-variant/30 shadow-sm flex items-center justify-between">
          <div>
            <span className="font-label-mono-sm text-outline uppercase text-[11px]">Audit Ledger Integrity</span>
            <div className="text-[20px] font-bold text-tertiary mt-1">SHA-256 Validated</div>
          </div>
          <span className="material-symbols-outlined text-tertiary text-[28px]">shield</span>
        </div>
        <div className="p-space-md rounded-xl bg-surface-container border border-outline-variant/30 shadow-sm flex items-center justify-between">
          <div>
            <span className="font-label-mono-sm text-outline uppercase text-[11px]">Safety Gate Evaluations</span>
            <div className="text-[20px] font-bold text-on-surface mt-1">142 Executed</div>
          </div>
          <span className="material-symbols-outlined text-primary text-[28px]">gavel</span>
        </div>
        <div className="p-space-md rounded-xl bg-surface-container border border-outline-variant/30 shadow-sm flex items-center justify-between">
          <div>
            <span className="font-label-mono-sm text-outline uppercase text-[11px]">Rollback Readiness</span>
            <div className="text-[20px] font-bold text-tertiary mt-1">Atomic (0-Downtime)</div>
          </div>
          <span className="material-symbols-outlined text-tertiary text-[28px]">restore</span>
        </div>
      </div>

      <div className="bg-surface-container rounded-xl border border-outline-variant/30 shadow-md overflow-hidden">
        <div className="p-space-md border-b border-outline-variant/20 flex items-center justify-between">
          <h2 className="font-headline-sm text-on-surface font-semibold text-[16px]">Audit Events Ledger</h2>
          <span className="font-label-mono-sm text-on-surface-variant text-[11px]">Chain: sha256_merkle_root</span>
        </div>

        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low/70 text-outline font-label-mono-sm text-[11px] uppercase tracking-wider border-b border-outline-variant/20">
                <th className="py-space-sm px-space-md font-medium">Trace ID</th>
                <th className="py-space-sm px-space-md font-medium">Action &amp; Actor</th>
                <th className="py-space-sm px-space-md font-medium">Model Unit</th>
                <th className="py-space-sm px-space-md font-medium">Target Version</th>
                <th className="py-space-sm px-space-md font-medium">Verdict</th>
                <th className="py-space-sm px-space-lg font-medium">Audit Narrative</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10 font-body-sm text-[12px]">
              {auditEntries.map((e) => (
                <tr key={e.id} className="hover:bg-surface-container-high/30 transition-colors">
                  <td className="py-space-md px-space-md font-label-mono-sm text-primary">
                    {e.id}
                  </td>
                  <td className="py-space-md px-space-md">
                    <div className="flex flex-col">
                      <span className="font-bold text-on-surface">{e.action}</span>
                      <span className="font-label-mono-sm text-outline text-[11px]">{e.actor}</span>
                    </div>
                  </td>
                  <td className="py-space-md px-space-md text-on-surface font-medium">
                    {e.unit}
                  </td>
                  <td className="py-space-md px-space-md font-label-mono-sm text-tertiary">
                    {e.target_version}
                  </td>
                  <td className="py-space-md px-space-md">
                    <span className="px-2 py-0.5 rounded bg-surface-container-highest text-tertiary font-label-mono-sm text-[11px] font-bold">
                      {e.result}
                    </span>
                  </td>
                  <td className="py-space-md px-space-lg text-on-surface-variant">
                    {e.details}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
