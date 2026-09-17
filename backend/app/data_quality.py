import pandas as pd


def check_data_quality(
    dataset_path,
    expected_columns=None
):
    df = pd.read_csv(dataset_path)

    issues = []

    # 1. Missing values
    missing = df.isnull().sum()
    missing_columns = {
        column: int(value)
        for column, value in missing.items()
        if value > 0
    }

    if missing_columns:
        issues.append({
            "issue": "Missing values",
            "severity": "WARNING",
            "details": missing_columns
        })

    # 2. Unexpected columns
    if expected_columns is not None:
        actual_columns = set(df.columns)
        expected_columns_set = set(expected_columns)

        unexpected = actual_columns - expected_columns_set
        missing_expected = expected_columns_set - actual_columns

        if unexpected:
            issues.append({
                "issue": "Unexpected columns",
                "severity": "WARNING",
                "details": sorted(unexpected)
            })

        if missing_expected:
            issues.append({
                "issue": "Missing expected columns",
                "severity": "CRITICAL",
                "details": sorted(missing_expected)
            })

    # 3. Duplicate rows
    duplicate_count = int(df.duplicated().sum())

    if duplicate_count > 0:
        issues.append({
            "issue": "Duplicate rows",
            "severity": "WARNING",
            "details": duplicate_count
        })

    # 4. Constant columns
    constant_columns = [
        column
        for column in df.columns
        if df[column].nunique(dropna=False) <= 1
    ]

    if constant_columns:
        issues.append({
            "issue": "Constant columns",
            "severity": "WARNING",
            "details": constant_columns
        })

    return {
        "healthy": len(issues) == 0,
        "issues": issues
    }