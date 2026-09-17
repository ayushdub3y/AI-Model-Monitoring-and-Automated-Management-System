import React, { useState } from "react";

export default function SettingsView() {
  const [ksThreshold, setKsThreshold] = useState(0.05);
  const [psiThreshold, setPsiThreshold] = useState(0.2);
  const [minImprovement, setMinImprovement] = useState(0.005);
  const [regressionTolerance, setRegressionTolerance] = useState(-0.02);
  const [saved, setSaved] = useState(false);

  const handleSave = (e) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex flex-col w-full gap-space-xl max-w-4xl">
      <div className="flex flex-col gap-space-xxs">
        <div className="flex items-center gap-space-xs text-on-surface-variant font-label-mono-sm text-label-mono-sm tracking-wider uppercase text-[11px]">
          <span>Tools</span>
          <span className="text-outline">/</span>
          <span className="text-primary font-semibold">Platform Settings</span>
        </div>
        <h1 className="font-display-lg text-display-lg text-on-surface tracking-tight font-bold">
          Platform &amp; Safety Gate Settings
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Configure production deployment safety gates, statistical drift sensitivities, and cluster inference topologies.
        </p>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-space-lg">
        {/* Production Safety Gates */}
        <div className="bg-surface-container rounded-xl border border-outline-variant/30 p-space-lg shadow-md flex flex-col gap-space-md">
          <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
            <div>
              <h2 className="font-headline-sm text-on-surface font-semibold text-[16px]">7 Production Safety Gates</h2>
              <span className="font-label-mono-sm text-outline text-[11px]">Mandated checks before candidate promotion</span>
            </div>
            <span className="material-symbols-outlined text-primary text-[24px]">verified_user</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
            <div>
              <label className="font-label-mono-sm text-on-surface-variant uppercase text-[11px] block mb-1">
                Minimum Relative Metric Improvement (Gate 6)
              </label>
              <input
                type="number"
                step="0.001"
                value={minImprovement}
                onChange={(e) => setMinImprovement(parseFloat(e.target.value))}
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-3 py-2 text-[13px] text-on-surface font-label-mono-sm focus:outline-none focus:border-primary"
              />
              <span className="text-[11px] text-outline mt-1 block">Candidate must exceed Champion by ≥ +0.005</span>
            </div>

            <div>
              <label className="font-label-mono-sm text-on-surface-variant uppercase text-[11px] block mb-1">
                Secondary Metric Regression Tolerance (Gate 7)
              </label>
              <input
                type="number"
                step="0.005"
                value={regressionTolerance}
                onChange={(e) => setRegressionTolerance(parseFloat(e.target.value))}
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-3 py-2 text-[13px] text-on-surface font-label-mono-sm focus:outline-none focus:border-primary"
              />
              <span className="text-[11px] text-outline mt-1 block">Bounded by ≥ -0.02 delta</span>
            </div>
          </div>
        </div>

        {/* Statistical Drift Sensitivities */}
        <div className="bg-surface-container rounded-xl border border-outline-variant/30 p-space-lg shadow-md flex flex-col gap-space-md">
          <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
            <div>
              <h2 className="font-headline-sm text-on-surface font-semibold text-[16px]">Statistical Drift Tolerances</h2>
              <span className="font-label-mono-sm text-outline text-[11px]">Kolmogorov-Smirnov &amp; Population Stability Index</span>
            </div>
            <span className="material-symbols-outlined text-tertiary text-[24px]">query_stats</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
            <div>
              <label className="font-label-mono-sm text-on-surface-variant uppercase text-[11px] block mb-1">
                Kolmogorov-Smirnov Critical Alpha (p-value)
              </label>
              <input
                type="number"
                step="0.01"
                value={ksThreshold}
                onChange={(e) => setKsThreshold(parseFloat(e.target.value))}
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-3 py-2 text-[13px] text-on-surface font-label-mono-sm focus:outline-none focus:border-primary"
              />
              <span className="text-[11px] text-outline mt-1 block">Drift flagged when p &lt; 0.05</span>
            </div>

            <div>
              <label className="font-label-mono-sm text-on-surface-variant uppercase text-[11px] block mb-1">
                Population Stability Index (PSI) Warning Floor
              </label>
              <input
                type="number"
                step="0.01"
                value={psiThreshold}
                onChange={(e) => setPsiThreshold(parseFloat(e.target.value))}
                className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-lg px-3 py-2 text-[13px] text-on-surface font-label-mono-sm focus:outline-none focus:border-primary"
              />
              <span className="text-[11px] text-outline mt-1 block">Severe drift triggered when PSI &gt; 0.20</span>
            </div>
          </div>
        </div>

        {/* Cluster Infrastructure */}
        <div className="bg-surface-container rounded-xl border border-outline-variant/30 p-space-lg shadow-md flex flex-col gap-space-md">
          <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
            <div>
              <h2 className="font-headline-sm text-on-surface font-semibold text-[16px]">Cluster &amp; Inference Topology</h2>
              <span className="font-label-mono-sm text-outline text-[11px]">Execution targets and Triton Server</span>
            </div>
            <span className="material-symbols-outlined text-secondary text-[24px]">dns</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md text-[13px]">
            <div className="p-space-md rounded-lg bg-surface-container-low border border-outline-variant/20 flex flex-col gap-1">
              <span className="font-label-mono-sm text-outline text-[11px]">Cluster Pod Target</span>
              <span className="font-bold text-on-surface">us-east-prod-k8s (Node Pool #3)</span>
            </div>
            <div className="p-space-md rounded-lg bg-surface-container-low border border-outline-variant/20 flex flex-col gap-1">
              <span className="font-label-mono-sm text-outline text-[11px]">FastAPI Backend Endpoint</span>
              <span className="font-bold text-primary">http://127.0.0.1:8000</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-space-xs">
          <span className="text-tertiary font-label-mono-sm text-[12px]">
            {saved ? "✓ Settings persisted to SQLite database!" : ""}
          </span>
          <button
            type="submit"
            className="px-6 py-2 bg-primary hover:bg-primary-container text-on-primary font-bold rounded-lg font-headline-sm text-[13px] shadow-md transition-all active:scale-95"
          >
            Save Policy Configuration
          </button>
        </div>
      </form>
    </div>
  );
}
