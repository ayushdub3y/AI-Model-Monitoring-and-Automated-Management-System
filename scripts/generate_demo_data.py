import pandas as pd
import numpy as np
from pathlib import Path


def generate_drifted_and_mismatched_datasets():
    Path("data/processed").mkdir(parents=True, exist_ok=True)
    test_path = Path("data/processed/test.csv")

    if not test_path.exists():
        raise FileNotFoundError(f"Base test dataset not found: {test_path}")

    df = pd.read_csv(test_path)
    print(f"Loaded base test dataset: {df.shape}")

    # ==========================================
    # 1. Create Realistic Drifted Dataset
    # ==========================================
    drifted_df = df.copy()

    # Shift MonthlyCharges up by +30-40%
    drifted_df["MonthlyCharges"] = (drifted_df["MonthlyCharges"] * 1.35).round(2)

    # Shift tenure down (shorter contract tenure)
    drifted_df["tenure"] = (drifted_df["tenure"] * 0.55).clip(lower=1).astype(int)

    # Shift Contract distribution towards Month-to-month
    drifted_df.loc[drifted_df.index[:int(len(drifted_df) * 0.4)], "Contract"] = "Month-to-month"

    # Inject ~5% missing values in OnlineSecurity and TotalCharges
    np.random.seed(42)
    mask_sec = np.random.rand(len(drifted_df)) < 0.06
    mask_tot = np.random.rand(len(drifted_df)) < 0.05
    drifted_df.loc[mask_sec, "OnlineSecurity"] = np.nan
    drifted_df.loc[mask_tot, "TotalCharges"] = np.nan

    drifted_path = Path("data/processed/drifted_batch.csv")
    drifted_df.to_csv(drifted_path, index=False)
    print(f"Generated drifted dataset: {drifted_path} ({drifted_df.shape})")

    # ==========================================
    # 2. Create Schema Mismatched Dataset
    # ==========================================
    mismatched_df = df.copy().drop(columns=["tenure", "Contract"])
    mismatched_df["UnexpectedColumn_XYZ"] = 999
    mismatched_path = Path("data/processed/mismatched_batch.csv")
    mismatched_df.to_csv(mismatched_path, index=False)
    print(f"Generated mismatched dataset: {mismatched_path} ({mismatched_df.shape})")

    print("\nDemo datasets ready for monitoring & refinement demonstration!")


if __name__ == "__main__":
    generate_drifted_and_mismatched_datasets()
