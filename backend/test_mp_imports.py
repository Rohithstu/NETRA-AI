import mediapipe as mp
print(f"Mediapipe version: {mp.__version__}")
try:
    from mediapipe.tasks import python
    print("from mediapipe.tasks import python: SUCCESS")
except ImportError as e:
    print(f"from mediapipe.tasks import python: FAILED ({e})")

try:
    from mediapipe.tasks.python import vision
    print("from mediapipe.tasks.python import vision: SUCCESS")
except ImportError as e:
    print(f"from mediapipe.tasks.python import vision: FAILED ({e})")
