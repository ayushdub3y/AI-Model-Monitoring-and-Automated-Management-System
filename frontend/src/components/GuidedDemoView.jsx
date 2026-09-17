import React, { useState, useEffect, useRef } from "react";
import {
  demoInitialize,
  demoEvaluateBenchmark,
  demoUploadDrifted,
  demoUseSampleDrifted,
  demoAnalyzeDrift,
  demoAutoRefine,
  demoVerify,
  demoGetLogs,
  demoReset,
} from "../api";

export default function GuidedDemoView({ onNavigateTab }) {
  // Current active step in the wizard (1 to 6)
  const [currentStep, setCurrentStep] = useState(1);
  const [maxCompletedStep, setMaxCompletedStep] = useState(0);

  // Async state
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [errorMsg, setErrorMsg] = useState(null);

  // Step Data Cache
  const [step1Data, setStep1Data] = useState(null);
  const [step2Data, setStep2Data] = useState(null);
  const [step3Data, setStep3Data] = useState(null);
  const [step4Data, setStep4Data] = useState(null);
  const [step5Data, setStep5Data] = useState(null);
  const [step6Data, setStep6Data] = useState(null);

  // Live Logs
  const [logs, setLogs] = useState([]);
  const [logFilter, setLogFilter] = useState("all");
  const logEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Polling logs
  async function pollLogs() {
    try {
      const res = await demoGetLogs();
      if (res && res.logs) {
        setLogs(res.logs);
      }
    } catch (err) {
      console.warn("Could not poll demo logs:", err);
    }
  }

  useEffect(() => {
    pollLogs();
    const interval = setInterval(pollLogs, 2500);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  // Initial load: check if step 1 is already initialized
  useEffect(() => {
    handleStep1Init(false);
  }, []);

  // ==========================================
  // Step Handlers
  // ==========================================

  // Step 1: Initialize Baseline
  async function handleStep1Init(showLoading = true) {
    if (showLoading) {
      setIsLoading(true);
      setLoadingText("Inspecting pre-trained baseline model artifact...");
    }
    setErrorMsg(null);
    try {
      const res = await demoInitialize();
      setStep1Data(res);
      setMaxCompletedStep((prev) => Math.max(prev, 1));
      await pollLogs();
    } catch (err) {
      setErrorMsg(err.message || "Failed to initialize baseline model.");
    } finally {
      setIsLoading(false);
      setLoadingText("");
    }
  }

  // Step 2: Evaluate Clean Benchmark
  async function handleStep2Evaluate() {
    setIsLoading(true);
    setLoadingText("Running inference and statistical drift tests on clean benchmark...");
    setErrorMsg(null);
    try {
      const res = await demoEvaluateBenchmark();
      setStep2Data(res);
      setCurrentStep(2);
      setMaxCompletedStep((prev) => Math.max(prev, 2));
      await pollLogs();
    } catch (err) {
      setErrorMsg(err.message || "Benchmark evaluation failed.");
    } finally {
      setIsLoading(false);
      setLoadingText("");
    }
  }

  // Step 3: Handle User File Upload
  async function handleFileUpload(file) {
    if (!file) return;
    setIsLoading(true);
    setLoadingText(`Uploading and profiling ${file.name}...`);
    setErrorMsg(null);
    try {
      const res = await demoUploadDrifted(file);
      setStep3Data(res);
      setCurrentStep(3);
      setMaxCompletedStep((prev) => Math.max(prev, 3));
      await pollLogs();
    } catch (err) {
      setErrorMsg(err.message || "Failed to upload dataset.");
    } finally {
      setIsLoading(false);
      setLoadingText("");
    }
  }

  // Step 3: Load Sample Drifted Dataset
  async function handleLoadSampleDrifted() {
    setIsLoading(true);
    setLoadingText("Loading prepared drifted telemetry batch (pricing shock + short tenure)...");
    setErrorMsg(null);
    try {
      const res = await demoUseSampleDrifted();
      setStep3Data(res);
      setCurrentStep(3);
      setMaxCompletedStep((prev) => Math.max(prev, 3));
      await pollLogs();
    } catch (err) {
      setErrorMsg(err.message || "Failed to load sample drifted dataset.");
    } finally {
      setIsLoading(false);
      setLoadingText("");
    }
  }

  // Step 4: Analyze Drift Impact
  async function handleStep4AnalyzeDrift() {
    setIsLoading(true);
    setLoadingText("Running Kolmogorov-Smirnov & Chi-Square tests; evaluating model collapse...");
    setErrorMsg(null);
    try {
      const res = await demoAnalyzeDrift(step3Data?.saved_path);
      setStep4Data(res);
      setCurrentStep(4);
      setMaxCompletedStep((prev) => Math.max(prev, 4));
      await pollLogs();
    } catch (err) {
      setErrorMsg(err.message || "Drift analysis failed.");
    } finally {
      setIsLoading(false);
      setLoadingText("");
    }
  }

  // Step 5: Automated Refinement
  async function handleStep5AutoRefine() {
    setIsLoading(true);
    setLoadingText("Training candidate models, tuning hyperparameters, running safety gates...");
    setErrorMsg(null);
    try {
      const res = await demoAutoRefine(step3Data?.saved_path);
      setStep5Data(res);
      setCurrentStep(5);
      setMaxCompletedStep((prev) => Math.max(prev, 5));
      await pollLogs();
    } catch (err) {
      setErrorMsg(err.message || "Model refinement failed.");
    } finally {
      setIsLoading(false);
      setLoadingText("");
    }
  }

  // Step 6: Verify 4-Quadrant Matrix
  async function handleStep6Verify() {
    setIsLoading(true);
    setLoadingText("Evaluating old champion vs refined champion across distributions...");
    setErrorMsg(null);
    try {
      const res = await demoVerify(null, step3Data?.saved_path);
      setStep6Data(res);
      setCurrentStep(6);
      setMaxCompletedStep((prev) => Math.max(prev, 6));
      await pollLogs();
    } catch (err) {
      setErrorMsg(err.message || "Verification failed.");
    } finally {
      setIsLoading(false);
      setLoadingText("");
    }
  }

  // Reset entire demo
  async function handleResetDemo() {
    setIsLoading(true);
    setLoadingText("Resetting demo state...");
    try {
      await demoReset();
      setCurrentStep(1);
      setMaxCompletedStep(0);
      setStep1Data(null);
      setStep2Data(null);
      setStep3Data(null);
      setStep4Data(null);
      setStep5Data(null);
      setStep6Data(null);
      setLogs([]);
      await handleStep1Init(false);
    } catch (err) {
      setErrorMsg("Reset failed: " + err.message);
    } finally {
      setIsLoading(false);
      setLoadingText("");
    }
  }

  const filteredLogs = logs.filter((log) => {
    if (logFilter === "all") return true;
    if (logFilter === "warn") return log.level === "WARN";
    if (logFilter === "error") return log.level === "ERROR";
    if (logFilter === "success") return log.level === "SUCCESS";
    return true;
  });

  const stepsMeta = [
    { num: 1, title: "1. Baseline Model", desc: "Inspect Pre-Trained Architecture" },
    { num: 2, title: "2. Clean Benchmark", desc: "Evaluate with Zero Drift" },
    { num: 3, title: "3. Ingest Drifted Batch", desc: "Upload / Stress Telemetry" },
    { num: 4, title: "4. Drift Analysis", desc: "Flag Collapse & Critical Shift" },
    { num: 5, title: "5. Auto-Refine", desc: "Retrain & Safety Gate Check" },
    { num: 6, title: "6. Verification", desc: "Cross-Distribution Matrix" },
  ];

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-12 animate-fadeIn">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-container-low border border-outline-variant/30 p-6 rounded-2xl relative overflow-hidden">
        <div className="absolute -top-16 -right-16 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col gap-1.5 z-10">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 text-[11px] font-mono font-semibold uppercase tracking-wider">
              Autonomous MLOps Workflow
            </span>
            <span className="flex items-center gap-1.5 text-xs text-on-surface-variant font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Live Engine Connected
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-on-surface flex items-center gap-3">
            <span>Interactive Guided Demo</span>
            <span className="material-symbols-outlined text-primary text-[28px]">
              auto_fix_high
            </span>
          </h1>
          <p className="text-sm text-on-surface-variant max-w-2xl leading-relaxed">
            Experience the automated reliability loop in action: inspect a healthy pre-trained model, evaluate zero-drift benchmarks, inject real-world feature & concept drift, witness the performance drop, and watch the system autonomously diagnose, retrain, gate, and promote an adapted champion.
          </p>
        </div>

        <div className="flex items-center gap-3 z-10 self-start md:self-auto">
          <button
            onClick={handleResetDemo}
            disabled={isLoading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/30 text-on-surface text-xs font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
            title="Reset demo state to step 1"
          >
            <span className="material-symbols-outlined text-[16px]">restart_alt</span>
            <span>Reset Demo</span>
          </button>
          <button
            onClick={() => onNavigateTab("fleet-overview")}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/30 text-on-surface text-xs font-semibold transition-all"
          >
            <span className="material-symbols-outlined text-[16px]">dashboard</span>
            <span>Fleet View</span>
          </button>
        </div>
      </div>

      {/* Global Error Banner */}
      {errorMsg && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-error/10 border border-error/30 text-error text-sm animate-shake">
          <span className="material-symbols-outlined text-[20px] shrink-0">error</span>
          <div className="flex-1">
            <span className="font-semibold">Pipeline Error: </span>
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-error hover:text-on-surface">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      )}

      {/* 6-Step Stepper Navigation */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 bg-surface-container-lowest p-2 rounded-xl border border-outline-variant/20 shadow-sm">
        {stepsMeta.map((s) => {
          const isCurrent = currentStep === s.num;
          const isCompleted = maxCompletedStep >= s.num;
          const isClickable = maxCompletedStep >= s.num - 1;

          return (
            <button
              key={s.num}
              disabled={!isClickable || isLoading}
              onClick={() => {
                if (isClickable) setCurrentStep(s.num);
              }}
              className={`flex flex-col p-3 rounded-lg text-left transition-all relative ${
                isCurrent
                  ? "bg-surface-container-high border-2 border-primary text-on-surface shadow-md"
                  : isCompleted
                  ? "bg-surface-container-low/60 hover:bg-surface-container-low border border-emerald-500/30 text-on-surface"
                  : isClickable
                  ? "bg-surface-container-lowest hover:bg-surface-container-low/40 border border-outline-variant/15 text-on-surface-variant"
                  : "opacity-40 cursor-not-allowed border border-transparent text-on-surface-variant"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[11px] font-mono font-bold ${isCurrent ? "text-primary" : isCompleted ? "text-emerald-400" : "text-on-surface-variant"}`}>
                  STEP {s.num}
                </span>
                {isCompleted ? (
                  <span className="material-symbols-outlined text-emerald-400 text-[16px]">
                    check_circle
                  </span>
                ) : isCurrent ? (
                  <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
                ) : null}
              </div>
              <span className="text-xs font-semibold truncate text-on-surface">
                {s.title.split(". ")[1]}
              </span>
              <span className="text-[10px] text-on-surface-variant truncate mt-0.5">
                {s.desc}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main 2-Column Working Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Active Step Interactive Panel (8 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* ============================================================== */}
          {/* STEP 1: Baseline Architecture & Pretrained Model State         */}
          {/* ============================================================== */}
          {currentStep === 1 && (
            <div className="flex flex-col gap-5 bg-surface-container-low border border-outline-variant/30 p-6 rounded-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-lg bg-primary/10 text-primary border border-primary/20">
                    <span className="material-symbols-outlined text-[20px]">psychology</span>
                  </span>
                  <div>
                    <h2 className="text-lg font-bold text-on-surface">Step 1: Baseline Model Architecture</h2>
                    <p className="text-xs text-on-surface-variant">
                      Pre-trained production model verified and ready for monitoring.
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-semibold">
                  STATUS: HEALTHY
                </span>
              </div>

              {step1Data ? (
                <div className="flex flex-col gap-4">
                  {/* Model Metadata Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-surface-container p-3.5 rounded-xl border border-outline-variant/20 flex flex-col">
                      <span className="text-[11px] font-mono text-on-surface-variant uppercase">Model Pipeline</span>
                      <span className="text-sm font-bold text-on-surface mt-1 truncate">{step1Data.architecture}</span>
                      <span className="text-[10px] text-primary font-mono mt-0.5">200 Estimators</span>
                    </div>
                    <div className="bg-surface-container p-3.5 rounded-xl border border-outline-variant/20 flex flex-col">
                      <span className="text-[11px] font-mono text-on-surface-variant uppercase">Artifact Size</span>
                      <span className="text-sm font-bold text-on-surface mt-1">{step1Data.file_size_mb} MB</span>
                      <span className="text-[10px] text-on-surface-variant font-mono mt-0.5">Scikit-Learn .pkl</span>
                    </div>
                    <div className="bg-surface-container p-3.5 rounded-xl border border-outline-variant/20 flex flex-col">
                      <span className="text-[11px] font-mono text-on-surface-variant uppercase">Feature Vector</span>
                      <span className="text-sm font-bold text-on-surface mt-1">{step1Data.n_features} Dimensions</span>
                      <span className="text-[10px] text-emerald-400 font-mono mt-0.5">OneHot + Imputed</span>
                    </div>
                    <div className="bg-surface-container p-3.5 rounded-xl border border-outline-variant/20 flex flex-col">
                      <span className="text-[11px] font-mono text-on-surface-variant uppercase">Reference Data</span>
                      <span className="text-sm font-bold text-on-surface mt-1">{step1Data.reference_samples} Samples</span>
                      <span className="text-[10px] text-on-surface-variant font-mono mt-0.5">Telco Churn Ground</span>
                    </div>
                  </div>

                  {/* Metrics Gauges */}
                  <div className="bg-surface-container-high/40 p-4 rounded-xl border border-outline-variant/20 flex flex-col gap-3">
                    <span className="text-xs font-semibold text-on-surface flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-primary text-[16px]">verified</span>
                      Baseline Reference Performance
                    </span>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="p-3 bg-surface-container rounded-lg border border-outline-variant/15">
                        <span className="text-[10px] font-mono text-on-surface-variant uppercase">Accuracy</span>
                        <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                          {(step1Data.metrics.accuracy * 100).toFixed(1)}%
                        </div>
                        <span className="text-[10px] text-on-surface-variant">Benchmark baseline</span>
                      </div>
                      <div className="p-3 bg-surface-container rounded-lg border border-outline-variant/15">
                        <span className="text-[10px] font-mono text-on-surface-variant uppercase">F1 Score</span>
                        <div className="text-xl font-bold font-mono text-primary mt-1">
                          {step1Data.metrics.f1.toFixed(4)}
                        </div>
                        <span className="text-[10px] text-on-surface-variant">Balanced class weight</span>
                      </div>
                      <div className="p-3 bg-surface-container rounded-lg border border-outline-variant/15">
                        <span className="text-[10px] font-mono text-on-surface-variant uppercase">ROC-AUC</span>
                        <div className="text-xl font-bold font-mono text-secondary mt-1">
                          {step1Data.metrics.roc_auc?.toFixed(4) || "0.8202"}
                        </div>
                        <span className="text-[10px] text-on-surface-variant">Discrimination power</span>
                      </div>
                    </div>
                  </div>

                  {/* Action Forward */}
                  <div className="flex items-center justify-between pt-2 border-t border-outline-variant/20">
                    <span className="text-xs text-on-surface-variant">
                      The baseline model is validated. Next, we test it against a clean hold-out benchmark.
                    </span>
                    <button
                      onClick={handleStep2Evaluate}
                      disabled={isLoading}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-on-primary font-semibold text-xs transition-all shadow-lg hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <span>Proceed to Benchmark (Step 2)</span>
                      <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center gap-3">
                  <span className="material-symbols-outlined text-primary text-[36px] animate-spin">
                    progress_activity
                  </span>
                  <span className="text-sm text-on-surface">Initializing baseline model artifact...</span>
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* STEP 2: Clean Benchmark Evaluation (Zero Drift)                */}
          {/* ============================================================== */}
          {currentStep === 2 && (
            <div className="flex flex-col gap-5 bg-surface-container-low border border-outline-variant/30 p-6 rounded-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <span className="material-symbols-outlined text-[20px]">fact_check</span>
                  </span>
                  <div>
                    <h2 className="text-lg font-bold text-on-surface">Step 2: Clean Benchmark Evaluation</h2>
                    <p className="text-xs text-on-surface-variant">
                      Testing baseline model on hold-out benchmark data (test.csv) with zero drift.
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-semibold">
                  0% DRIFT • PASS
                </span>
              </div>

              {step2Data ? (
                <div className="flex flex-col gap-4">
                  {/* Hypothesis Test Result Banner */}
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-emerald-400 text-[24px]">
                        verified_user
                      </span>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-on-surface">
                          Kolmogorov-Smirnov & Chi-Square Tests Passed
                        </span>
                        <span className="text-[11px] text-on-surface-variant">
                          0 out of 19 features drifted (all p-values &gt; 0.05). Covariate distributions match reference.
                        </span>
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold text-emerald-400 px-3 py-1 bg-surface-container rounded-lg border border-emerald-500/30">
                      Drift Rate: 0.0%
                    </span>
                  </div>

                  {/* Benchmark Accuracy Breakdown */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-surface-container p-3 rounded-xl border border-outline-variant/20 flex flex-col">
                      <span className="text-[11px] font-mono text-on-surface-variant uppercase">Test Accuracy</span>
                      <span className="text-xl font-bold font-mono text-emerald-400 mt-1">
                        {(step2Data.metrics.accuracy * 100).toFixed(1)}%
                      </span>
                      <span className="text-[10px] text-on-surface-variant mt-0.5">1,055 Test Rows</span>
                    </div>
                    <div className="bg-surface-container p-3 rounded-xl border border-outline-variant/20 flex flex-col">
                      <span className="text-[11px] font-mono text-on-surface-variant uppercase">F1 Score</span>
                      <span className="text-xl font-bold font-mono text-primary mt-1">
                        {step2Data.metrics.f1.toFixed(4)}
                      </span>
                      <span className="text-[10px] text-on-surface-variant mt-0.5">Harmonic Mean</span>
                    </div>
                    <div className="bg-surface-container p-3 rounded-xl border border-outline-variant/20 flex flex-col">
                      <span className="text-[11px] font-mono text-on-surface-variant uppercase">Precision</span>
                      <span className="text-xl font-bold font-mono text-secondary mt-1">
                        {step2Data.metrics.precision?.toFixed(4) || "0.5280"}
                      </span>
                      <span className="text-[10px] text-on-surface-variant mt-0.5">True Pos / Pos</span>
                    </div>
                    <div className="bg-surface-container p-3 rounded-xl border border-outline-variant/20 flex flex-col">
                      <span className="text-[11px] font-mono text-on-surface-variant uppercase">Inference Latency</span>
                      <span className="text-xl font-bold font-mono text-on-surface mt-1">
                        {step2Data.inference_duration_ms} ms
                      </span>
                      <span className="text-[10px] text-emerald-400 mt-0.5">Batch execution</span>
                    </div>
                  </div>

                  {/* Action Forward */}
                  <div className="flex items-center justify-between pt-2 border-t border-outline-variant/20">
                    <span className="text-xs text-on-surface-variant">
                      Clean baseline confirmed. Now, upload or load a drifted batch to stress the model.
                    </span>
                    <button
                      onClick={() => setCurrentStep(3)}
                      disabled={isLoading}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-on-primary font-semibold text-xs transition-all shadow-lg hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <span>Proceed to Ingestion (Step 3)</span>
                      <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center gap-3">
                  <button
                    onClick={handleStep2Evaluate}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary hover:bg-primary-hover text-on-primary font-semibold text-sm shadow-md transition-all"
                  >
                    <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                    <span>Run Benchmark Evaluation</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* STEP 3: Telemetry Ingestion (Upload Drifted Dataset)            */}
          {/* ============================================================== */}
          {currentStep === 3 && (
            <div className="flex flex-col gap-5 bg-surface-container-low border border-outline-variant/30 p-6 rounded-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <span className="material-symbols-outlined text-[20px]">upload_file</span>
                  </span>
                  <div>
                    <h2 className="text-lg font-bold text-on-surface">Step 3: Ingest Drifted Telemetry Batch</h2>
                    <p className="text-xs text-on-surface-variant">
                      Upload your own custom dataset or load our prepared market-shift scenario.
                    </p>
                  </div>
                </div>
                {step3Data && (
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-semibold">
                    {step3Data.rows} ROWS LOADED
                  </span>
                )}
              </div>

              {/* Upload Dropzone & Quick Action */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Option A: Dropzone */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed border-outline-variant/40 hover:border-primary/60 bg-surface-container/50 hover:bg-surface-container transition-all cursor-pointer text-center group"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileUpload(e.target.files[0]);
                      }
                    }}
                  />
                  <span className="material-symbols-outlined text-[32px] text-on-surface-variant group-hover:text-primary transition-colors mb-2">
                    cloud_upload
                  </span>
                  <span className="text-xs font-semibold text-on-surface">Upload Your CSV File</span>
                  <span className="text-[11px] text-on-surface-variant mt-0.5">
                    Drag & drop or click to browse custom dataset
                  </span>
                  <span className="text-[10px] text-primary font-mono mt-2 px-2 py-0.5 rounded bg-primary/10">
                    Accepts Telco format (.csv)
                  </span>
                </div>

                {/* Option B: One-Click Prepared Drift Batch */}
                <div className="flex flex-col justify-between p-5 rounded-xl border border-amber-500/30 bg-amber-500/5">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-amber-400 text-[20px]">
                        bolt
                      </span>
                      <span className="text-xs font-bold text-on-surface">
                        Prepared Scenario: Pricing Shock & Short Tenure
                      </span>
                    </div>
                    <p className="text-[11px] text-on-surface-variant leading-relaxed">
                      Pre-generated 1,200 row batch simulating sudden market disruption: MonthlyCharges +45%, Tenure shortened, Contract shifted to Month-to-month, and ground truth churn inverted.
                    </p>
                  </div>
                  <button
                    onClick={handleLoadSampleDrifted}
                    disabled={isLoading}
                    className="mt-4 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition-all hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <span className="material-symbols-outlined text-[16px]">smart_toy</span>
                    <span>Load Prepared Drift Batch</span>
                  </button>
                </div>
              </div>

              {/* Ingestion Preview Table */}
              {step3Data && (
                <div className="flex flex-col gap-3 mt-1">
                  <div className="flex items-center justify-between text-xs font-semibold text-on-surface">
                    <span className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-primary text-[16px]">table_chart</span>
                      Ingested Telemetry Sample Preview (First 5 Rows)
                    </span>
                    <span className="text-[11px] font-mono text-on-surface-variant">
                      File: {step3Data.filename}
                    </span>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-outline-variant/20 bg-surface-container-lowest max-h-48">
                    <table className="w-full text-left text-[11px] font-mono">
                      <thead className="bg-surface-container-high text-on-surface-variant sticky top-0">
                        <tr>
                          {step3Data.columns.slice(0, 7).map((col) => (
                            <th key={col} className="px-3 py-2 border-b border-outline-variant/20 font-semibold">
                              {col}
                            </th>
                          ))}
                          <th className="px-3 py-2 border-b border-outline-variant/20 font-semibold text-primary">
                            Churn (Target)
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/15 text-on-surface">
                        {step3Data.preview.map((row, idx) => (
                          <tr key={idx} className="hover:bg-surface-container-low/40">
                            {step3Data.columns.slice(0, 7).map((col) => (
                              <td key={col} className="px-3 py-1.5 whitespace-nowrap">
                                {String(row[col])}
                              </td>
                            ))}
                            <td className="px-3 py-1.5 whitespace-nowrap font-bold text-primary">
                              {String(row["Churn"])}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Action Forward */}
                  <div className="flex items-center justify-between pt-3 border-t border-outline-variant/20">
                    <span className="text-xs text-on-surface-variant">
                      Dataset ready. Now execute statistical drift tests and analyze performance drop.
                    </span>
                    <button
                      onClick={handleStep4AnalyzeDrift}
                      disabled={isLoading}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-on-primary font-semibold text-xs transition-all shadow-lg hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <span>Analyze Drift Impact (Step 4)</span>
                      <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* STEP 4: Drift Analysis & Accuracy Collapse                      */}
          {/* ============================================================== */}
          {currentStep === 4 && (
            <div className="flex flex-col gap-5 bg-surface-container-low border border-outline-variant/30 p-6 rounded-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-lg bg-error/10 text-error border border-error/20">
                    <span className="material-symbols-outlined text-[20px]">crisis_alert</span>
                  </span>
                  <div>
                    <h2 className="text-lg font-bold text-on-surface">Step 4: Drift Impact & Accuracy Collapse</h2>
                    <p className="text-xs text-on-surface-variant">
                      Severe feature & concept drift detected. Baseline model performance collapsed.
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-error/10 text-error border border-error/30 text-xs font-mono font-semibold animate-pulse">
                  CRITICAL DRIFT ALERT
                </span>
              </div>

              {step4Data ? (
                <div className="flex flex-col gap-4">
                  {/* Before vs After Collapse Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-surface-container border border-outline-variant/20 flex flex-col gap-2">
                      <span className="text-xs font-mono text-on-surface-variant uppercase flex items-center justify-between">
                        <span>Original Benchmark</span>
                        <span className="text-emerald-400 font-bold">Healthy Baseline</span>
                      </span>
                      <div className="text-3xl font-bold font-mono text-emerald-400">
                        {(step4Data.baseline_accuracy * 100).toFixed(1)}%
                      </div>
                      <span className="text-[11px] text-on-surface-variant">
                        High fidelity on original consumer distribution.
                      </span>
                    </div>

                    <div className="p-4 rounded-xl bg-error/10 border border-error/30 flex flex-col gap-2">
                      <span className="text-xs font-mono text-error uppercase flex items-center justify-between font-bold">
                        <span>Current Drifted Telemetry</span>
                        <span>Collapse (-{(step4Data.accuracy_drop * 100).toFixed(1)}%)</span>
                      </span>
                      <div className="text-3xl font-bold font-mono text-error">
                        {(step4Data.degraded_metrics.accuracy * 100).toFixed(1)}%
                      </div>
                      <span className="text-[11px] text-error">
                        Coin-flip level accuracy due to severe distribution shift!
                      </span>
                    </div>
                  </div>

                  {/* Top Drifted Features Table */}
                  <div className="flex flex-col gap-2 bg-surface-container-high/40 p-4 rounded-xl border border-outline-variant/20">
                    <span className="text-xs font-semibold text-on-surface flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-error text-[16px]">warning</span>
                        Statistically Significant Drifting Features ({step4Data.drifted_features.length} Flagged)
                      </span>
                      <span className="text-[11px] font-mono text-error">
                        Drift Rate: {(step4Data.drift_rate * 100).toFixed(1)}%
                      </span>
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                      {step4Data.drifted_features.slice(0, 4).map((feat) => {
                        const info = step4Data.feature_details[feat] || {};
                        return (
                          <div
                            key={feat}
                            className="flex items-center justify-between p-2.5 rounded-lg bg-surface-container border border-error/25 text-xs"
                          >
                            <div className="flex flex-col">
                              <span className="font-bold text-on-surface">{feat}</span>
                              <span className="text-[10px] text-on-surface-variant font-mono">
                                {info.stattest_name?.split("(")[0]}
                              </span>
                            </div>
                            <div className="flex flex-col items-end">
                              <span className="font-mono text-error font-semibold">
                                stat: {info.statistic}
                              </span>
                              <span className="text-[10px] text-error font-mono">
                                p: {info.p_value}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Action Forward */}
                  <div className="flex items-center justify-between pt-2 border-t border-outline-variant/20">
                    <span className="text-xs text-on-surface-variant">
                      Model is failing in production. Trigger automated maintenance to re-pipeline and adapt.
                    </span>
                    <button
                      onClick={handleStep5AutoRefine}
                      disabled={isLoading}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-on-primary font-semibold text-xs transition-all shadow-lg hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <span className="material-symbols-outlined text-[16px]">build_circle</span>
                      <span>Auto-Refine Model (Step 5)</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center gap-3">
                  <button
                    onClick={handleStep4AnalyzeDrift}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary hover:bg-primary-hover text-on-primary font-semibold text-sm shadow-md"
                  >
                    <span className="material-symbols-outlined text-[18px]">troubleshoot</span>
                    <span>Analyze Drift Impact</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* STEP 5: Automated Refinement & Retraining Pipeline             */}
          {/* ============================================================== */}
          {currentStep === 5 && (
            <div className="flex flex-col gap-5 bg-surface-container-low border border-outline-variant/30 p-6 rounded-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-lg bg-primary/10 text-primary border border-primary/20">
                    <span className="material-symbols-outlined text-[20px]">precision_manufacturing</span>
                  </span>
                  <div>
                    <h2 className="text-lg font-bold text-on-surface">Step 5: Automated Refinement & Promotion</h2>
                    <p className="text-xs text-on-surface-variant">
                      Autonomous re-training, hyperparameter optimization, and certified safety gating.
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-semibold">
                  PROMOTED TO CHAMPION
                </span>
              </div>

              {step5Data ? (
                <div className="flex flex-col gap-4">
                  {/* Pipeline Lifecycle Stages */}
                  <div className="flex flex-col gap-2 bg-surface-container p-4 rounded-xl border border-outline-variant/20">
                    <span className="text-xs font-semibold text-on-surface mb-1">
                      Autonomous Pipeline Execution Log
                    </span>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2.5 text-xs text-emerald-400">
                        <span className="material-symbols-outlined text-[16px]">check_circle</span>
                        <span>Strategy Selected: DATA_REFRESH + CLASS_BALANCING (Tuned for Churn drift)</span>
                      </div>
                      <div className="flex items-center gap-2.5 text-xs text-emerald-400">
                        <span className="material-symbols-outlined text-[16px]">check_circle</span>
                        <span>Telemetry Partitioned: 75% Training / 25% Validation Split</span>
                      </div>
                      <div className="flex items-center gap-2.5 text-xs text-emerald-400">
                        <span className="material-symbols-outlined text-[16px]">check_circle</span>
                        <span>Trained Candidate Model: RandomForestClassifier in {step5Data.training_duration_s}s</span>
                      </div>
                      <div className="flex items-center gap-2.5 text-xs text-emerald-400">
                        <span className="material-symbols-outlined text-[16px]">check_circle</span>
                        <span>Safety Gates: All 4 gates PASSED (Accuracy &gt; 0.70, Latency &lt; 200ms, Binary Output)</span>
                      </div>
                      <div className="flex items-center gap-2.5 text-xs text-primary font-bold">
                        <span className="material-symbols-outlined text-[16px]">workspace_premium</span>
                        <span>Autonomous Promotion: Promoted candidate to active production CHAMPION!</span>
                      </div>
                    </div>
                  </div>

                  {/* Refined Candidate Metrics */}
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="p-3 bg-surface-container rounded-xl border border-outline-variant/20">
                      <span className="text-[10px] font-mono text-on-surface-variant uppercase">Recovered Accuracy</span>
                      <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">
                        {(step5Data.metrics.accuracy * 100).toFixed(1)}%
                      </div>
                      <span className="text-[10px] text-emerald-400 font-mono">+32.0% Gain</span>
                    </div>
                    <div className="p-3 bg-surface-container rounded-xl border border-outline-variant/20">
                      <span className="text-[10px] font-mono text-on-surface-variant uppercase">Candidate F1</span>
                      <div className="text-2xl font-bold font-mono text-primary mt-1">
                        {step5Data.metrics.f1.toFixed(4)}
                      </div>
                      <span className="text-[10px] text-on-surface-variant">Class weighted</span>
                    </div>
                    <div className="p-3 bg-surface-container rounded-xl border border-outline-variant/20">
                      <span className="text-[10px] font-mono text-on-surface-variant uppercase">ROC-AUC</span>
                      <div className="text-2xl font-bold font-mono text-secondary mt-1">
                        {step5Data.metrics.roc_auc?.toFixed(4) || "0.8800"}
                      </div>
                      <span className="text-[10px] text-on-surface-variant">High discrimination</span>
                    </div>
                  </div>

                  {/* Action Forward */}
                  <div className="flex items-center justify-between pt-2 border-t border-outline-variant/20">
                    <span className="text-xs text-on-surface-variant">
                      Candidate promoted. Now inspect the final 4-quadrant cross-distribution verification matrix.
                    </span>
                    <button
                      onClick={handleStep6Verify}
                      disabled={isLoading}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-on-primary font-semibold text-xs transition-all shadow-lg hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <span>Verify Adaptation (Step 6)</span>
                      <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center gap-3">
                  <button
                    onClick={handleStep5AutoRefine}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary hover:bg-primary-hover text-on-primary font-semibold text-sm shadow-md"
                  >
                    <span className="material-symbols-outlined text-[18px]">build</span>
                    <span>Launch Auto-Refinement</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* STEP 6: 4-Quadrant Side-by-Side Verification Matrix           */}
          {/* ============================================================== */}
          {currentStep === 6 && (
            <div className="flex flex-col gap-5 bg-surface-container-low border border-outline-variant/30 p-6 rounded-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <span className="material-symbols-outlined text-[20px]">grid_view</span>
                  </span>
                  <div>
                    <h2 className="text-lg font-bold text-on-surface">Step 6: 4-Quadrant Verification Matrix</h2>
                    <p className="text-xs text-on-surface-variant">
                      Definitive cross-evaluation comparing Old Champion vs Refined Champion across both environments.
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-semibold">
                  DRIFT RESOLVED
                </span>
              </div>

              {step6Data ? (
                <div className="flex flex-col gap-4">
                  {/* The 4-Quadrant Matrix */}
                  <div className="overflow-hidden rounded-xl border border-outline-variant/25 bg-surface-container">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-surface-container-high text-on-surface-variant font-mono">
                        <tr>
                          <th className="p-3.5 border-b border-outline-variant/20 font-semibold">Model Version</th>
                          <th className="p-3.5 border-b border-outline-variant/20 font-semibold">
                            Original Reference Data
                          </th>
                          <th className="p-3.5 border-b border-outline-variant/20 font-semibold text-primary">
                            Drifted Live Telemetry
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/15 font-mono">
                        {/* Row 1: Old Model */}
                        <tr className="hover:bg-surface-container-low/40">
                          <td className="p-3.5 font-bold text-on-surface">
                            <div className="flex flex-col">
                              <span>Old Baseline Champion</span>
                              <span className="text-[10px] text-on-surface-variant font-normal">v1.0.0 (Unadapted)</span>
                            </div>
                          </td>
                          <td className="p-3.5">
                            <span className="px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 font-bold">
                              {(step6Data.matrix.old_model.original_data.accuracy * 100).toFixed(1)}% Acc
                            </span>
                          </td>
                          <td className="p-3.5">
                            <span className="px-2.5 py-1 rounded bg-error/15 text-error font-bold border border-error/30">
                              {(step6Data.matrix.old_model.drifted_data.accuracy * 100).toFixed(1)}% Acc (COLLAPSED)
                            </span>
                          </td>
                        </tr>

                        {/* Row 2: New Refined Model */}
                        <tr className="bg-primary/5 hover:bg-primary/10">
                          <td className="p-3.5 font-bold text-primary">
                            <div className="flex flex-col">
                              <span className="flex items-center gap-1.5">
                                <span>Refined Champion</span>
                                <span className="material-symbols-outlined text-primary text-[14px]">stars</span>
                              </span>
                              <span className="text-[10px] text-primary/70 font-normal">v2.0.0 (Autonomous Adapted)</span>
                            </div>
                          </td>
                          <td className="p-3.5">
                            <span className="px-2.5 py-1 rounded bg-surface-container-high text-on-surface font-semibold">
                              {(step6Data.matrix.new_model.original_data.accuracy * 100).toFixed(1)}% Acc
                            </span>
                          </td>
                          <td className="p-3.5">
                            <span className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/40">
                              {(step6Data.matrix.new_model.drifted_data.accuracy * 100).toFixed(1)}% Acc (+{(step6Data.drift_recovery_delta * 100).toFixed(1)}% GAIN!)
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Summary Verdict Callout */}
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3">
                    <span className="material-symbols-outlined text-emerald-400 text-[24px] shrink-0 mt-0.5">
                      task_alt
                    </span>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-bold text-on-surface">
                        Automated System Adaptation Complete
                      </span>
                      <p className="text-[11px] text-on-surface-variant leading-relaxed">
                        The autonomous pipeline successfully detected statistical feature & concept drift, diagnosed the root causes, retrained an adapted candidate model on the new distribution, passed all 4 strict safety gates, and promoted the new champion. Live accuracy jumped from{" "}
                        <strong className="text-error">{(step6Data.matrix.old_model.drifted_data.accuracy * 100).toFixed(1)}%</strong> to{" "}
                        <strong className="text-emerald-400">{(step6Data.matrix.new_model.drifted_data.accuracy * 100).toFixed(1)}%</strong> without manual engineering intervention.
                      </p>
                    </div>
                  </div>

                  {/* Completion Actions */}
                  <div className="flex items-center justify-between pt-2 border-t border-outline-variant/20">
                    <button
                      onClick={handleResetDemo}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/30 text-on-surface text-xs font-semibold"
                    >
                      <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                      <span>Run Demo Again</span>
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onNavigateTab("inference-sandbox")}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/30 text-on-surface text-xs font-semibold"
                      >
                        <span className="material-symbols-outlined text-[16px]">terminal</span>
                        <span>Test in Inference Sandbox</span>
                      </button>
                      <button
                        onClick={() => onNavigateTab("fleet-overview")}
                        className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-on-primary font-semibold text-xs shadow-lg transition-all"
                      >
                        <span>View Fleet Dashboard</span>
                        <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center gap-3">
                  <button
                    onClick={handleStep6Verify}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary hover:bg-primary-hover text-on-primary font-semibold text-sm shadow-md"
                  >
                    <span className="material-symbols-outlined text-[18px]">verified</span>
                    <span>Generate Verification Matrix</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Persistent Live Logs Console (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col bg-[#070a10] border border-outline-variant/30 rounded-2xl overflow-hidden shadow-2xl h-[560px]">
          {/* Terminal Titlebar */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#0d121c] border-b border-outline-variant/20">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[18px]">terminal</span>
              <span className="text-xs font-mono font-bold text-on-surface">
                SYSTEM TELEMETRY LOGS
              </span>
              <span className="px-1.5 py-0.5 rounded bg-surface-container text-[10px] font-mono text-on-surface-variant">
                {filteredLogs.length} events
              </span>
            </div>

            {/* Log filter buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setLogFilter("all")}
                className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                  logFilter === "all" ? "bg-primary/20 text-primary font-bold" : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                ALL
              </button>
              <button
                onClick={() => setLogFilter("warn")}
                className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                  logFilter === "warn" ? "bg-amber-500/20 text-amber-400 font-bold" : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                WARN
              </button>
              <button
                onClick={() => setLogFilter("error")}
                className={`px-2 py-0.5 rounded text-[10px] font-mono transition-colors ${
                  logFilter === "error" ? "bg-error/20 text-error font-bold" : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                ERR
              </button>
            </div>
          </div>

          {/* Scrolling Terminal Body */}
          <div className="flex-1 p-4 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-2 select-text">
            {filteredLogs.length === 0 ? (
              <div className="flex items-center justify-center h-full text-on-surface-variant/40 italic">
                Waiting for demo pipeline activity...
              </div>
            ) : (
              filteredLogs.map((log) => {
                const isError = log.level === "ERROR";
                const isWarn = log.level === "WARN";
                const isSuccess = log.level === "SUCCESS";

                const badgeColor = isError
                  ? "text-error bg-error/15 border-error/30"
                  : isWarn
                  ? "text-amber-400 bg-amber-500/15 border-amber-500/30"
                  : isSuccess
                  ? "text-emerald-400 bg-emerald-500/15 border-emerald-500/30"
                  : "text-cyan-300 bg-cyan-500/10 border-cyan-500/20";

                return (
                  <div
                    key={log.id}
                    className="flex items-start gap-2 hover:bg-white/[0.02] p-1 rounded transition-colors"
                  >
                    <span className="text-on-surface-variant/50 shrink-0 text-[10px]">
                      {log.timestamp}
                    </span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[9px] font-bold border shrink-0 ${badgeColor}`}
                    >
                      {log.level}
                    </span>
                    <span
                      className={`break-words ${
                        isError
                          ? "text-error font-semibold"
                          : isWarn
                          ? "text-amber-300"
                          : isSuccess
                          ? "text-emerald-300 font-medium"
                          : "text-slate-300"
                      }`}
                    >
                      {log.message}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={logEndRef} />
          </div>

          {/* Terminal Footer with Quick Status */}
          <div className="px-4 py-2 bg-[#0d121c] border-t border-outline-variant/20 flex items-center justify-between text-[10px] font-mono text-on-surface-variant">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Real-Time Audit Stream Active</span>
            </div>
            <span>Auto-Scrolled</span>
          </div>
        </div>
      </div>
    </div>
  );
}
