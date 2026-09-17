from pathlib import Path
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from typing import Dict, Any, Optional

from .adapters.registry import load_model_adapter

def generate_shap_summary(
    model_path: str,
    dataset_path: str,
    target_column: Optional[str] = "Churn",
    output_path: str = "storage/shap_summary.png",
    max_features: int = 10
) -> Dict[str, Any]:
    """
    Generate feature importance / SHAP summary for root cause explainability.
    Uses ModelAdapter to extract features and underlying estimators.
    """
    adapter = load_model_adapter(model_path)
    caps = adapter.capabilities() if hasattr(adapter, "capabilities") else {}

    df = pd.read_csv(dataset_path)

    if target_column and target_column in df.columns:
        X = df.drop(columns=[target_column])
    else:
        X = df

    if not caps.get("feature_importance", True):
        return {
            "feature_importance": {},
            "status": "unavailable",
            "message": "Feature importance unavailable for this model type.",
            "sample_size": min(200, len(X)),
            "chart_path": None,
            "method": "Unavailable"
        }

    model = adapter.get_underlying_model()

    # Extract estimator from pipeline
    estimator = model
    feature_names = adapter.get_feature_names() or X.columns.tolist()

    if hasattr(model, "named_steps"):
        estimator = model.named_steps.get("model", model)
        preprocessor = model.named_steps.get("preprocessor")
        if preprocessor:
            try:
                feature_names = preprocessor.get_feature_names_out().tolist()
                # Clean up feature names
                feature_names = [f.split("__")[-1] for f in feature_names]
            except Exception:
                pass

    # Extract importance scores
    importances = None
    if hasattr(estimator, "feature_importances_"):
        importances = estimator.feature_importances_
    elif hasattr(estimator, "coef_"):
        importances = np.abs(estimator.coef_[0])

    if importances is None:
        return {
            "feature_importance": {},
            "status": "unavailable",
            "message": "Feature importance unavailable for this model type.",
            "sample_size": min(200, len(X)),
            "chart_path": None,
            "method": "Unavailable"
        }

    # Align length of importances and feature names
    if len(importances) != len(feature_names):
        feature_names = [f"Feature {i}" for i in range(len(importances))]

    # Sort top features
    paired = sorted(zip(feature_names, importances), key=lambda x: x[1], reverse=True)[:max_features]
    top_names = [p[0] for p in reversed(paired)]
    top_scores = [float(p[1]) for p in reversed(paired)]

    importance_dict = {
        name: round(float(value), 4)
        for name, value in reversed(paired)
    }

    # Render Visual Chart
    if output_path:
        out_file = Path(output_path)
        out_file.parent.mkdir(parents=True, exist_ok=True)

        fig, ax = plt.subplots(figsize=(8, 5), dpi=150)
        fig.patch.set_facecolor("#0f172a")
        ax.set_facecolor("#1e293b")

        colors = plt.cm.viridis(np.linspace(0.4, 0.9, len(top_names)))
        bars = ax.barh(top_names, top_scores, color=colors, edgecolor="none", height=0.65)

        ax.set_title("Root Cause Feature Importance (Impact)", color="#f8fafc", fontsize=13, fontweight="bold", pad=12)
        ax.set_xlabel("Mean Absolute Impact Score", color="#94a3b8", fontsize=10)
        ax.tick_params(colors="#cbd5e1", labelsize=9)
        ax.grid(axis="x", linestyle="--", alpha=0.2, color="#64748b")

        for spine in ax.spines.values():
            spine.set_color("#334155")

        plt.tight_layout()
        plt.savefig(str(out_file), bbox_inches="tight", facecolor=fig.get_facecolor(), edgecolor="none")
        plt.close(fig)

    return {
        "feature_importance": importance_dict,
        "sample_size": min(200, len(X)),
        "chart_path": output_path,
        "method": "Tree-based Feature Impact"
    }

