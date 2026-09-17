import pandas as pd
import numpy as np


def profile_dataset(file_path, target_column=None):
    df = pd.read_csv(file_path)

    missing_counts = df.isnull().sum()
    missing_percentages = ((missing_counts / len(df)) * 100).round(2)

    column_types = {}
    numerical_stats = {}

    for col in df.columns:
        dtype_str = str(df[col].dtype)
        column_types[col] = dtype_str

        if pd.api.types.is_numeric_dtype(df[col]):
            non_null = df[col].dropna()
            if len(non_null) > 0:
                numerical_stats[col] = {
                    "mean": round(float(non_null.mean()), 2),
                    "std": round(float(non_null.std()), 2) if len(non_null) > 1 else 0.0,
                    "min": round(float(non_null.min()), 2),
                    "max": round(float(non_null.max()), 2),
                    "median": round(float(non_null.median()), 2)
                }

    profile = {
        "rows": len(df),
        "columns": len(df.columns),
        "column_names": df.columns.tolist(),
        "dtypes": column_types,
        "missing_values": {k: int(v) for k, v in missing_counts.items()},
        "missing_percentages": {k: float(v) for k, v in missing_percentages.items()},
        "unique_counts": {k: int(df[k].nunique()) for k in df.columns},
        "numerical_stats": numerical_stats,
        "sample_preview": df.head(5).to_dict(orient="records")
    }

    if target_column and target_column in df.columns:
        target_counts = df[target_column].value_counts()
        target_percentages = (
            df[target_column]
            .value_counts(normalize=True)
            .mul(100)
            .round(2)
        )

        profile["target"] = {
            "column": target_column,
            "class_counts": {str(k): int(v) for k, v in target_counts.items()},
            "class_percentages": {str(k): float(v) for k, v in target_percentages.items()}
        }

    return profile