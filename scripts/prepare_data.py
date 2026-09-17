import pandas as pd
from sklearn.model_selection import train_test_split


# 1. Load raw dataset
df = pd.read_csv("data/raw/telco_churn.csv")

print(f"Original dataset shape: {df.shape}")


# 2. Clean TotalCharges
df["TotalCharges"] = pd.to_numeric(
    df["TotalCharges"],
    errors="coerce"
)

print(
    f"Missing TotalCharges after conversion: "
    f"{df['TotalCharges'].isna().sum()}"
)


# 3. Remove rows where TotalCharges is missing
df = df.dropna(subset=["TotalCharges"])


# 4. Remove customer ID
df = df.drop(columns=["customerID"])


# 5. Convert target to numerical values
df["Churn"] = df["Churn"].map({
    "No": 0,
    "Yes": 1
})


# 6. First split: 70% train, 30% temporary
train_df, temp_df = train_test_split(
    df,
    test_size=0.30,
    random_state=42,
    stratify=df["Churn"]
)


# 7. Second split: divide temporary data equally
reference_df, test_df = train_test_split(
    temp_df,
    test_size=0.50,
    random_state=42,
    stratify=temp_df["Churn"]
)


# 8. Save processed datasets
train_df.to_csv(
    "data/processed/train.csv",
    index=False
)

reference_df.to_csv(
    "data/processed/reference.csv",
    index=False
)

test_df.to_csv(
    "data/processed/test.csv",
    index=False
)


# 9. Print results
print("\nProcessing complete!")

print(f"Train shape:      {train_df.shape}")
print(f"Reference shape:  {reference_df.shape}")
print(f"Test shape:       {test_df.shape}")

print("\nTrain churn distribution:")
print(train_df["Churn"].value_counts())

print("\nReference churn distribution:")
print(reference_df["Churn"].value_counts())

print("\nTest churn distribution:")
print(test_df["Churn"].value_counts())