import pandas as pd
import joblib


# 1. Load the saved model
model = joblib.load("models/baseline_model.pkl")

print("Model loaded successfully!")
print(f"Model type: {type(model)}")


# 2. Load test data
test_df = pd.read_csv("data/processed/test.csv")

X_test = test_df.drop(columns=["Churn"])
y_test = test_df["Churn"]


# 3. Make predictions
predictions = model.predict(X_test)


# 4. Show a few predictions
print("\nFirst 10 predictions:")
print(predictions[:10])

print("\nActual values:")
print(y_test.iloc[:10].values)