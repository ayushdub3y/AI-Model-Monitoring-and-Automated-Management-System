import React, { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import FleetDashboardView from "./components/FleetDashboardView";
import ModelDetailView from "./components/ModelDetailView";
import PipelineView from "./components/PipelineView";
import HealthView from "./components/HealthView";
import DiagnosisView from "./components/DiagnosisView";
import RefinementView from "./components/RefinementView";
import VersionsView from "./components/VersionsView";
import InferenceView from "./components/InferenceView";
import AlertsView from "./components/AlertsView";
import AuditLogView from "./components/AuditLogView";
import SettingsView from "./components/SettingsView";
import GuidedDemoView from "./components/GuidedDemoView";
import {
  fetchMonitoringUnits,
  createMonitoringUnit,
  fetchDashboardSummary,
  runFullPipeline,
  loadSampleData,
} from "./api";

export default function App() {
  const [activeTab, setActiveTab] = useState("guided-demo");
  const [units, setUnits] = useState([]);
  const [selectedUnitId, setSelectedUnitId] = useState(1);
  const [summary, setSummary] = useState(null);
  const [pipelineData, setPipelineData] = useState(null);
  const [isRunningQuick, setIsRunningQuick] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);

  async function refreshFleetData() {
    try {
      const unitsList = await fetchMonitoringUnits();
      setUnits(unitsList || []);
      if (unitsList && unitsList.length > 0 && !selectedUnitId) {
        setSelectedUnitId(unitsList[0].id);
      }
      const sumRes = await fetchDashboardSummary(selectedUnitId || 1);
      setSummary(sumRes);
    } catch (err) {
      console.error("Could not fetch fleet summary:", err);
    }
  }

  useEffect(() => {
    refreshFleetData();
    const interval = setInterval(refreshFleetData, 12000);
    return () => clearInterval(interval);
  }, [selectedUnitId]);

  function showToast(message) {
    setToastMsg(message);
    setTimeout(() => setToastMsg(null), 4000);
  }

  async function handleCreateUnit(unitData) {
    try {
      showToast("Registering new Monitoring Unit...");
      const res = await createMonitoringUnit(unitData);
      showToast(`Monitoring Unit '${res.unit?.name || unitData.name}' created!`);
      await refreshFleetData();
      if (res.unit?.id) {
        setSelectedUnitId(res.unit.id);
        setActiveTab("models");
      }
    } catch (err) {
      showToast(`Error creating unit: ${err.message}`);
    }
  }

  function handleSelectUnitFromFleet(unitId) {
    setSelectedUnitId(unitId);
    setActiveTab("models");
  }

  async function handleQuickRun() {
    setIsRunningQuick(true);
    showToast(`Launching Autonomous Pipeline for Unit #${selectedUnitId || 1}...`);
    try {
      const res = await runFullPipeline({
        unit_id: selectedUnitId || 1,
        force_refinement: true,
      });
      setPipelineData(res);
      await refreshFleetData();
      setActiveTab("monitoring-runs");
      showToast("Pipeline completed! New candidate evaluated and deployed.");
    } catch (err) {
      showToast(`Pipeline Error: ${err.message}`);
    } finally {
      setIsRunningQuick(false);
    }
  }

  const currentUnit =
    units.find((u) => u.id === selectedUnitId) || units[0] || {
      id: 1,
      name: "Customer Churn Model",
      task_type: "classification",
      target_column: "Churn",
      promotion_mode: "AUTO",
      health_status: "CRITICAL",
    };

  // Tab alias mapping for legacy internal navigation
  const resolvedTab = (() => {
    if (activeTab === "fleet") return "fleet-overview";
    if (activeTab === "detail") return "models";
    if (activeTab === "pipeline") return "monitoring-runs";
    if (activeTab === "health") return "health-and-drift";
    if (activeTab === "diagnosis") return "model-maintenance";
    if (activeTab === "refinement") return "candidates";
    if (activeTab === "inference") return "inference-sandbox";
    return activeTab;
  })();

  return (
    <div className="bg-background min-h-screen text-on-surface">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-surface-container-high border border-primary px-4 py-3 rounded-xl shadow-2xl text-[13px] font-semibold text-on-surface flex items-center gap-2 animate-fadeIn">
          <span className="material-symbols-outlined text-primary text-[18px]">
            notifications_active
          </span>
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Persistent Left Sidebar */}
      <Sidebar
        activeTab={resolvedTab}
        onSelectTab={setActiveTab}
        alertsCount={2}
      />

      {/* Main Viewport Container */}
      <div className="pl-72">
        {/* Persistent Top Header */}
        <Header
          activeTab={resolvedTab}
          units={units}
          selectedUnitId={selectedUnitId}
          onSelectUnit={setSelectedUnitId}
          activeModel={summary?.active_model}
          systemStatus={summary?.health_status || "HEALTHY"}
          onNavigateTab={setActiveTab}
        />

        {/* Dynamic Route Content */}
        <main className="w-full pt-16 bg-background min-h-screen px-margin-screen py-space-lg">
          {resolvedTab === "guided-demo" && (
            <GuidedDemoView onNavigateTab={setActiveTab} />
          )}

          {resolvedTab === "fleet-overview" && (
            <FleetDashboardView
              units={units}
              summary={summary}
              onSelectUnit={handleSelectUnitFromFleet}
              onCreateUnit={handleCreateUnit}
              onQuickRun={handleQuickRun}
              isRunning={isRunningQuick}
              onNavigateTab={setActiveTab}
            />
          )}

          {resolvedTab === "models" && (
            <ModelDetailView
              unit={currentUnit}
              onBackToFleet={() => setActiveTab("fleet-overview")}
              onRefreshFleet={refreshFleetData}
            />
          )}

          {resolvedTab === "health-and-drift" && (
            <HealthView onNavigateTab={setActiveTab} />
          )}

          {resolvedTab === "alerts" && (
            <AlertsView
              selectedUnitId={selectedUnitId}
              onNavigateTab={setActiveTab}
            />
          )}

          {resolvedTab === "monitoring-runs" && (
            <PipelineView
              pipelineData={pipelineData}
              setPipelineData={setPipelineData}
              onNavigateTab={setActiveTab}
              onRefreshSummary={refreshFleetData}
            />
          )}

          {resolvedTab === "model-maintenance" && (
            <DiagnosisView onNavigateTab={setActiveTab} />
          )}

          {resolvedTab === "candidates" && (
            <RefinementView onNavigateTab={setActiveTab} />
          )}

          {resolvedTab === "versions" && (
            <VersionsView onNavigateTab={setActiveTab} />
          )}

          {resolvedTab === "audit-log" && (
            <AuditLogView onNavigateTab={setActiveTab} />
          )}

          {resolvedTab === "inference-sandbox" && (
            <InferenceView
              activeModel={summary?.active_model}
              unitId={selectedUnitId}
            />
          )}

          {resolvedTab === "settings" && <SettingsView />}
        </main>
      </div>
    </div>
  );
}
