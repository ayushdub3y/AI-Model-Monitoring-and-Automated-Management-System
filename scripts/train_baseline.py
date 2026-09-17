import pandas as pd
import joblib

from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score


# 1. Load the processed datasets
train_df = pd.read_csv("data/processed/train.csv")
test_df = pd.read_csv("data/processed/test.csv")


# 2. Separate features and target
X_train = train_df.drop(columns=["Churn"])
y_train = train_df["Churn"]

X_test = test_df.drop(columns=["Churn"])
y_test = test_df["Churn"]


# 3. Identify categorical and numerical columns
categorical_columns = X_train.select_dtypes(
    include=["object"]
).columns.tolist()

numerical_columns = X_train.select_dtypes(
    exclude=["object"]
).columns.tolist()


print("Categorical columns:")
print(categorical_columns)

print("\nNumerical columns:")
print(numerical_columns)


# 4. Create preprocessing pipeline
preprocessor = ColumnTransformer(
    transformers=[
        (
            "categorical",
            OneHotEncoder(handle_unknown="ignore"),
            categorical_columns
        )
    ],
    remainder="passthrough"
)


# 5. Create baseline model
model = RandomForestClassifier(
    n_estimators=200,
    random_state=42,
    class_weight="balanced"
)


# 6. Combine preprocessing + model
pipeline = Pipeline(
    steps=[
        ("preprocessor", preprocessor),
        ("model", model)
    ]
)


# 7. Train
print("\nTraining baseline model...")

pipeline.fit(X_train, y_train)


# 8. Make predictions
y_pred = pipeline.predict(X_test)
y_probability = pipeline.predict_proba(X_test)[:, 1]


# 9. Evaluate
accuracy = accuracy_score(y_test, y_pred)
f1 = f1_score(y_test, y_pred)
auc = roc_auc_score(y_test, y_probability)


print("\n===== BASELINE MODEL RESULTS =====")
print(f"Accuracy: {accuracy:.4f}")
print(f"F1 Score: {f1:.4f}")
print(f"ROC-AUC:  {auc:.4f}")


# 10. Save the entire pipeline
joblib.dump(
    pipeline,
    "models/baseline_model.pkl"
)

print("\nModel saved to:")
print("models/baseline_model.pkl")