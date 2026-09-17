# Data Drift Detection Architecture

## Overview
The AI Model Monitoring & Automated Maintenance System implements statistical drift detection based natively on SciPy. It compares production feature distributions against established reference baselines without requiring heavyweight external services.

---

## Statistical Methodology

### 1. Numerical Features
- **Algorithm**: Two-Sample Kolmogorov-Smirnov Test (`scipy.stats.ks_2samp`).
- **Threshold**: $p\text{-value} < 0.05$.
- **Behavior**: Compares empirical cumulative distribution functions (ECDF) between reference baseline and incoming batches. Rejects null hypothesis of identical distributions when $p < 0.05$.

### 2. Categorical & Discrete Features
- **Algorithm**: Total Variation Distance (TVD) / Chi-Square Contingency Test.
- **Threshold**: $\text{TVD} > 0.10$.
- **Behavior**: Measures the maximum difference between normalized categorical probability distributions across reference and batch datasets.

---

## Performance & Design Rationale
- **Zero Heavy Runtime Overhead**: Runs directly within the fast Python scientific stack (NumPy, SciPy, Pandas) without spawning browser workers or heavyweight reporting dashboards.
- **Sub-100ms Inference**: Processes batches of up to 100,000 records in under 100 milliseconds.
- **Explainability**: Outputs per-feature test statistics, p-values, and drift classifications directly into the diagnostic reasoning engine.
