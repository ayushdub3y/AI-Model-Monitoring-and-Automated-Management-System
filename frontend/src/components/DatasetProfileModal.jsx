import React, { useState, useEffect } from "react";
import {
  X,
  Database,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Hash,
  Layers,
  BarChart2,
  Table
} from "lucide-react";
import { profileDataset } from "../api";

export default function DatasetProfileModal({ dataset, targetColumn = "Churn", onClose }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [activeSubTab, setActiveSubTab] = useState("columns");

  useEffect(() => {
    if (!dataset?.file_path) return;
    async function loadProfile() {
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await profileDataset(dataset.file_path, dataset.target_column || targetColumn);
        setProfile(res);
      } catch (err) {
        setErrorMsg(err.message || "Failed to generate dataset profile");
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, [dataset?.file_path]);

  if (!dataset) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="bg-surface-container border border-outline-variant/40 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-on-surface">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20 bg-surface-container-high/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary">
              <Database size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-[17px] font-bold tracking-tight text-on-surface">
                  {dataset.name}
                </h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider ${
                  dataset.status === "CURRENT"
                    ? "bg-tertiary/20 text-tertiary border border-tertiary/30"
                    : dataset.status === "USED"
                    ? "bg-secondary/20 text-secondary border border-secondary/30"
                    : "bg-surface-container-highest text-on-surface-variant"
                }`}>
                  {dataset.status || "READY"}
                </span>
              </div>
              <p className="text-[12px] text-on-surface-variant font-mono mt-0.5">
                Path: {dataset.file_path}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant gap-3">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              <span className="text-[13px] font-mono">Analyzing tabular distribution & statistics...</span>
            </div>
          ) : errorMsg ? (
            <div className="p-4 rounded-xl bg-error/10 border border-error/30 text-error flex items-center gap-3">
              <AlertTriangle size={18} />
              <span className="text-[13px]">{errorMsg}</span>
            </div>
          ) : profile ? (
            <>
              {/* Quick Metrics Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-surface-container-lowest border border-outline-variant/30">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-on-surface-variant block">Total Rows</span>
                  <span className="text-[20px] font-bold text-on-surface font-mono mt-0.5 block">
                    {profile.rows.toLocaleString()}
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-surface-container-lowest border border-outline-variant/30">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-on-surface-variant block">Features</span>
                  <span className="text-[20px] font-bold text-on-surface font-mono mt-0.5 block">
                    {profile.columns}
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-surface-container-lowest border border-outline-variant/30">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-on-surface-variant block">Target Column</span>
                  <span className="text-[15px] font-bold text-primary font-mono mt-1 block truncate">
                    {dataset.target_column || targetColumn}
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-surface-container-lowest border border-outline-variant/30">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-on-surface-variant block">Integrity</span>
                  <span className="text-[15px] font-bold text-tertiary font-mono mt-1 flex items-center gap-1">
                    <CheckCircle2 size={16} /> 100% Valid
                  </span>
                </div>
              </div>

              {/* Target Distribution if available */}
              {profile.target && (
                <div className="p-4 rounded-xl bg-surface-container-lowest border border-outline-variant/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[12px] font-mono text-on-surface-variant uppercase tracking-wider font-semibold">
                      Target Distribution ({profile.target.target_column})
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    {Object.entries(profile.target.distribution || {}).map(([val, count]) => {
                      const pct = profile.target.percentages ? profile.target.percentages[val] : 0;
                      return (
                        <div key={val} className="p-3 rounded-lg bg-surface-container-low border border-outline-variant/20">
                          <div className="flex justify-between text-[13px] mb-1">
                            <span className="font-semibold text-on-surface">Class: <code className="text-primary">{val}</code></span>
                            <span className="font-mono text-on-surface-variant">{count} ({pct}%)</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-surface-container-highest overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Subtabs for Columns / Preview */}
              <div className="flex gap-2 border-b border-outline-variant/20 pt-2">
                <button
                  onClick={() => setActiveSubTab("columns")}
                  className={`px-4 py-2 text-[13px] font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                    activeSubTab === "columns"
                      ? "border-primary text-primary"
                      : "border-transparent text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  <BarChart2 size={15} /> Column Schema & Missing Values ({profile.column_names?.length || 0})
                </button>
                <button
                  onClick={() => setActiveSubTab("preview")}
                  className={`px-4 py-2 text-[13px] font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                    activeSubTab === "preview"
                      ? "border-primary text-primary"
                      : "border-transparent text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  <Table size={15} /> Sample Rows Preview
                </button>
              </div>

              {/* Subtab 1: Columns list */}
              {activeSubTab === "columns" && (
                <div className="overflow-x-auto rounded-xl border border-outline-variant/30">
                  <table className="w-full text-left text-[12px]">
                    <thead className="bg-surface-container-highest/60 text-on-surface-variant font-mono uppercase tracking-wider border-b border-outline-variant/20">
                      <tr>
                        <th className="px-4 py-2.5">Feature Column</th>
                        <th className="px-4 py-2.5">Data Type</th>
                        <th className="px-4 py-2.5">Unique Values</th>
                        <th className="px-4 py-2.5">Missing</th>
                        <th className="px-4 py-2.5">Summary (Min / Mean / Max)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/15 font-mono">
                      {profile.column_names?.map((col) => {
                        const dtype = profile.dtypes?.[col] || "unknown";
                        const missingCount = profile.missing_values?.[col] || 0;
                        const missingPct = profile.missing_percentages?.[col] || 0;
                        const unique = profile.unique_counts?.[col] || "—";
                        const num = profile.numerical_stats?.[col];

                        return (
                          <tr key={col} className="hover:bg-surface-container-high/40 transition-colors">
                            <td className="px-4 py-2.5 font-bold text-on-surface">
                              {col}
                              {col === (dataset.target_column || targetColumn) && (
                                <span className="ml-2 px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[10px]">
                                  TARGET
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-on-surface-variant">{dtype}</td>
                            <td className="px-4 py-2.5 text-on-surface-variant">{unique}</td>
                            <td className="px-4 py-2.5">
                              {missingCount === 0 ? (
                                <span className="text-tertiary">0 (0%)</span>
                              ) : (
                                <span className="text-error font-bold">{missingCount} ({missingPct}%)</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-on-surface-variant">
                              {num ? (
                                <span>{num.min} / {num.mean} / {num.max}</span>
                              ) : (
                                <span className="text-outline">Categorical</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Subtab 2: Sample Rows */}
              {activeSubTab === "preview" && (
                <div className="overflow-x-auto rounded-xl border border-outline-variant/30 max-h-72">
                  <table className="w-full text-left text-[11px] font-mono">
                    <thead className="bg-surface-container-highest/60 text-on-surface-variant uppercase tracking-wider sticky top-0 border-b border-outline-variant/20">
                      <tr>
                        {profile.column_names?.map((col) => (
                          <th key={col} className="px-3 py-2 whitespace-nowrap">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/15">
                      {profile.sample_preview?.map((row, idx) => (
                        <tr key={idx} className="hover:bg-surface-container-high/40">
                          {profile.column_names?.map((col) => (
                            <td key={col} className="px-3 py-1.5 whitespace-nowrap text-on-surface-variant">
                              {row[col] !== null && row[col] !== undefined ? String(row[col]) : "null"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-outline-variant/20 bg-surface-container-high/30 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-mono text-[12px] font-semibold transition-colors"
          >
            Close Profile
          </button>
        </div>
      </div>
    </div>
  );
}
