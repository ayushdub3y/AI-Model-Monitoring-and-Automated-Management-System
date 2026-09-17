from pathlib import Path
import joblib
import pandas as pd

from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.ensemble import RandomForestClassifier
from sklearn.pipeline import Pipeline


def train_candidate_model(train_path: str, output_path: str):
    """
    Backward-compatible candidate training function.
    """
    df = pd.read_csv(train_path)
    X = df.drop(columns=["Churn"])
    y = df["Churn"]

    categorical_columns = X.select_dtypes(include=["object"]).columns.tolist()

    preprocessor = ColumnTransformer(
        transformers=[
            (
                "categorical",
                OneHotEncoder(handle_unknown="ignore"),
                categorical_columns,
            )
        ],
        remainder="passthrough",
    )

    model = RandomForestClassifier(
        n_estimators=200,
        random_state=42,
        class_weight="balanced",
    )

    pipeline = Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("model", model),
        ]
    )

    pipeline.fit(X, y)

    out_path = Path(output_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, out_path)

    return {
        "model_type": "scikit-learn",
        "estimator_type": "RandomForestClassifier",
        "training_rows": len(df),
        "feature_count": len(X.columns),
        "output_path": str(out_path),
    }