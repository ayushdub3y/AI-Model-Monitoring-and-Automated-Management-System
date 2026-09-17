import React, { useState, useEffect } from "react";
import {
  GitBranch,
  GitCommit,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Clock,
  ShieldCheck,
  Zap,
  TrendingUp,
  Cpu
} from "lucide-react";
import { fetchVersions, activateVersion, fetchAlerts } from "../api";

export default function VersionsView({ onRefreshSummary }) {
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [msg, setMsg] = useState(null);

  async function loadData() {
    setLoading(true);
    try {
      const [vList, aList] = await Promise.all([
        fetchVersions(),
        fetchAlerts(),
      ]);
      setVersions(vList);
      setAlerts(aList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleDeploy(versionId, versionName) {
    setLoading(true);
    setMsg(null);
    try {
      const res = await activateVersion(versionId);
      setMsg(`Successfully switched active model pointer to ${versionName}!`);
      await loadData();
      if (onRefreshSummary) onRefreshSummary();
    } catch (err) {
      setMsg(`Error activating version: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="card" style={{ marginBottom: "20px" }}>
        <div className="card-header">
          <div>
            <h2 className="card-title">
              <GitBranch size={18} color="var(--accent-primary)" />
              Model Version Registry & Deployment Manager
            </h2>
            <p className="card-subtitle">
              Version history with active pointer routing. Original models are permanently preserved and instant rollbacks are supported.
            </p>
          </div>

          <span className="badge badge-info">{versions.length} Registered Versions</span>
        </div>

        {msg && (
          <div className="banner banner-success" style={{ marginTop: "10px", marginBottom: 0 }}>
            <CheckCircle2 size={16} />
            <span>{msg}</span>
          </div>
        )}
      </div>

      {/* Version Registry Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "28px" }}>
        {versions.map((ver) => (
          <div
            key={ver.id}
            className="card"
            style={{
              border: ver.is_active ? "2px solid var(--status-healthy)" : "1px solid var(--border-subtle)",
              background: ver.is_active ? "rgba(16, 185, 129, 0.05)" : "var(--bg-card)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                  <span style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--text-primary)", fontFamily: "JetBrains Mono" }}>
                    {ver.version}
                  </span>
                  <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                    — {ver.name}
                  </span>
                  {ver.is_active ? (
                    <span className="badge badge-healthy" style={{ padding: "3px 10px" }}>
                      <span className="pulse-dot healthy" /> ACTIVE IN PRODUCTION
                    </span>
                  ) : (
                    <span className="badge badge-neutral">STANDBY / ARCHIVED</span>
                  )}
                </div>

                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "4px" }}>
                  {ver.description || "Model version artifact stored in SQLite registry"}
                </p>
              </div>

              {/* Action Button */}
              <div>
                {ver.is_active ? (
                  <button className="btn btn-success btn-sm" disabled style={{ opacity: 0.9 }}>
                    <CheckCircle2 size={14} /> Currently Deployed
                  </button>
                ) : (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleDeploy(ver.id, ver.version)}
                    disabled={loading}
                  >
                    <RotateCcw size={14} /> Switch / Rollback to this Version
                  </button>
                )}
              </div>
            </div>

            {/* Version Metrics Bar */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: "12px",
                marginTop: "16px",
                padding: "12px 16px",
                background: "rgba(15, 23, 42, 0.6)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase" }}>F1 Score</div>
                <div style={{ fontSize: "1.05rem", fontWeight: 700, fontFamily: "JetBrains Mono", color: "var(--status-healthy)" }}>
                  {ver.f1_score ?? "—"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase" }}>ROC-AUC</div>
                <div style={{ fontSize: "1.05rem", fontWeight: 700, fontFamily: "JetBrains Mono" }}>
                  {ver.roc_auc ?? "—"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Accuracy</div>
                <div style={{ fontSize: "1.05rem", fontWeight: 700, fontFamily: "JetBrains Mono" }}>
                  {ver.accuracy ?? "—"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Registered Date</div>
                <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                  {ver.created_at ? new Date(ver.created_at).toLocaleTimeString() : "Recent"}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Production Telemetry Alerts History */}
      <div className="card">
        <div className="card-header">
          <div>
            <h3 className="card-title">
              <AlertTriangle size={18} color="var(--status-warning)" />
              Production Telemetry Alerts History ({alerts.length})
            </h3>
            <p className="card-subtitle">Automated alerts logged to SQLite database during monitoring runs</p>
          </div>
        </div>

        {alerts.length > 0 ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Severity</th>
                  <th>Alert Type</th>
                  <th>Message / Reason</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id}>
                    <td style={{ fontSize: "0.8rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {a.created_at ? new Date(a.created_at).toLocaleTimeString() : "Recent"}
                    </td>
                    <td>
                      <span className={`badge badge-${a.severity.toLowerCase()}`}>
                        {a.severity}
                      </span>
                    </td>
                    <td><code>{a.alert_type}</code></td>
                    <td>{a.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "20px" }}>
            No active alerts logged. System is healthy.
          </p>
        )}
      </div>
    </div>
  );
}
