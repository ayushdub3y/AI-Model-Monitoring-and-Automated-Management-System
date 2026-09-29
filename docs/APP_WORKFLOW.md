# App Workflow Document (Draft)

## 1. Big picture

```mermaid
flowchart LR
    S[1. Set up unit] --> R[2. Run monitoring]
    R --> D[3. Diagnose]
    D --> F[4. Refine]
    F --> G[5. Gates]
    G --> P[6. Promote]
    P --> R
    P -.-> B[Rollback anytime]
```

## 2. Set up a unit

```mermaid
flowchart TD
    A[Create Monitoring Unit<br/>name, task type, thresholds, mode] --> B[Upload champion model]
    B --> C[Upload reference data]
    C --> D[Upload current data]
    D --> E{Columns match<br/>the model?}
    E -- yes --> Ready[Ready]
    E -- no --> M[Map columns by hand] --> Ready
```

## 3. One monitoring run

```mermaid
flowchart TD
    Start[Run monitoring] --> Q[Data quality + schema check]
    Q --> P[Feature drift + prediction drift]
    P --> L{Labels present?}
    L -- yes --> M[Compute performance metrics]
    L -- no --> N[Mark DELAYED / UNAVAILABLE]
    M --> H[5-pillar health score]
    N --> H
    H --> W{Healthy?}
    W -- yes --> Save[Save run]
    W -- no --> Al[Create alert] --> Save
```

## 4. Diagnose and refine

```mermaid
flowchart TD
    A[Diagnosis: evidence + severity] --> B{Drift expected<br/>per baseline?}
    B -- yes --> Skip[No retraining] 
    B -- no --> C[Pick one strategy]
    C --> D[Train candidate]
    D --> E[Run 7 gates]
    E --> F{All pass?}
    F -- no --> Rej[REJECTED<br/>champion unchanged]
    F -- yes --> Mode{Promotion mode}
    Mode -- AUTO --> Champ[Becomes champion]
    Mode -- ASSISTED --> Stage[Staged challenger<br/>waits for human]
    Mode -- MANUAL --> Adv[Advice only]
    Stage -->|approve| Champ
    Stage -->|reject| Rej
```

## 5. Candidate life cycle

```mermaid
stateDiagram-v2
    [*] --> CHALLENGER
    CHALLENGER --> REJECTED: a gate fails
    CHALLENGER --> STAGED: gates pass, ASSISTED
    CHALLENGER --> CHAMPION: gates pass, AUTO
    STAGED --> CHAMPION: human approves
    STAGED --> REJECTED: human declines
    CHAMPION --> RETIRED: newer champion
    RETIRED --> CHAMPION: rollback
```

## 6. Request path (technical)

```mermaid
sequenceDiagram
    participant UI as Browser
    participant API as FastAPI
    participant E as Engine
    participant DB as SQLite + files
    UI->>API: POST /api/pipeline/run
    API->>API: auth, limits
    API->>E: load model, data
    E->>DB: read artifacts
    E-->>API: health report
    API->>DB: save run, alerts, audit
    API-->>UI: result JSON
```

## 7. Rollback

Versions tab → pick an older version → confirm → active pointer switches for that unit only → audit event `ROLLBACK`. No files are deleted or copied.
