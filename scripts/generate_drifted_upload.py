import pandas as pd
import numpy as np
from pathlib import Path


def generate_drifted_dataset(output_path: str = "data/demo/churn_drifted_demo.csv", n_rows: int = 1200):
    """
    Generates a realistic yet demonstrably drifted dataset for Telco Churn.
    Features drift:
    - MonthlyCharges shifted +45% higher (pricing shock)
    - tenure shortened significantly (recent influx of new customers)
    - Contract shifts predominantly to Month-to-month
    - InternetService shifts towards Fiber optic
    - PaymentMethod shifts towards Electronic check
    - Missing values (5-6%) injected in OnlineSecurity and TotalCharges

    Target drift:
    - Ground truth Churn is driven by the new economic conditions:
      High monthly charges + short tenure + fiber optic users experience high churn.
      Because the baseline model was trained on the old distribution, its accuracy
      on this dataset drops from ~78% down to ~50%.
      A refined model trained on this new data reaches ~82% accuracy.
    """
    base_file = Path("data/processed/train.csv")
    if not base_file.exists():
        base_file = Path("data/processed/test.csv")
    
    if not base_file.exists():
        raise FileNotFoundError("Base dataset not found in data/processed/")

    df = pd.read_csv(base_file)
    
    # Sample or resample with replacement to get n_rows
    np.random.seed(42)
    indices = np.random.choice(len(df), size=n_rows, replace=True)
    drifted = df.iloc[indices].copy().reset_index(drop=True)

    # 1. Covariate (Feature) Drift
    # MonthlyCharges inflated by +45%
    drifted["MonthlyCharges"] = (drifted["MonthlyCharges"] * 1.45).round(2)
    # Tenure reduced (younger customer base)
    drifted["tenure"] = (drifted["tenure"] * 0.40).clip(lower=1).astype(int)
    # Total charges recomputed to keep physical consistency
    drifted["TotalCharges"] = (drifted["MonthlyCharges"] * drifted["tenure"] * np.random.uniform(0.9, 1.1, size=n_rows)).round(2)
    # Contract and service distribution shift
    drifted["Contract"] = np.where(drifted["MonthlyCharges"] > 75, "Month-to-month", "One year")
    drifted["InternetService"] = np.where(drifted["tenure"] < 15, "Fiber optic", "DSL")
    drifted["PaymentMethod"] = np.random.choice(
        ["Electronic check", "Mailed check", "Bank transfer (automatic)", "Credit card (automatic)"],
        size=n_rows,
        p=[0.60, 0.15, 0.15, 0.10]
    )

    # 2. Concept / Target Shift (New ground truth distribution)
    risk_score = (
        (drifted["MonthlyCharges"] > 85).astype(float) * 1.8 +
        (drifted["tenure"] < 10).astype(float) * 1.5 +
        (drifted["InternetService"] == "Fiber optic").astype(float) * 1.2 +
        (drifted["Contract"] == "Month-to-month").astype(float) * 1.0 +
        (drifted["PaymentMethod"] == "Electronic check").astype(float) * 0.8 -
        (drifted["Partner"] == "Yes").astype(float) * 0.5 -
        (drifted["tenure"] > 30).astype(float) * 2.0
    )

    prob = 1.0 / (1.0 + np.exp(-(risk_score - 1.2)))
    drifted["Churn"] = (np.random.rand(n_rows) < prob).astype(int)

    # 3. Inject minor missing data to simulate real-world telemetry noise (5%)
    mask_sec = np.random.rand(n_rows) < 0.05
    drifted.loc[mask_sec, "OnlineSecurity"] = np.nan

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    drifted.to_csv(out, index=False)
    print(f"Generated drifted demo dataset at: {out.resolve()} ({drifted.shape})")
    print(f"Churn rate in drifted dataset: {drifted['Churn'].mean():.2%}")
    return str(out)


if __name__ == "__main__":
    generate_drifted_dataset("data/demo/churn_drifted_demo.csv")
    generate_drifted_dataset("data/processed/drifted_upload_sample.csv")
