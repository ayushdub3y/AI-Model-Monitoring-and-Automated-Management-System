import sys
from pathlib import Path

# Add project root to sys.path
root_dir = Path(__file__).resolve().parent.parent
if str(root_dir) not in sys.path:
    sys.path.insert(0, str(root_dir))

from backend.app.retraining import train_candidate_model


def main():
    # Paths
    train_path = Path("data/processed/train.csv")
    output_path = Path("storage/models/candidate_model.pkl")

    # Train candidate model
    result = train_candidate_model(
        train_path=str(train_path),
        output_path=str(output_path),
    )

    # Print result
    print("Candidate model training successful!")
    print()
    print("Training result:")
    print(result)
    print()
    print("Candidate model exists:", output_path.exists())


if __name__ == "__main__":
    main()