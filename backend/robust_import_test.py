import sys
import os

with open("import_test_log.txt", "w") as f:
    f.write(f"Python version: {sys.version}\n")
    try:
        import mediapipe as mp
        f.write(f"Mediapipe version: {mp.__version__}\n")
    except Exception as e:
        f.write(f"Failed to import mediapipe: {e}\n")

    try:
        from mediapipe.tasks import python
        f.write("Successfully imported mediapipe.tasks.python\n")
    except Exception as e:
        f.write(f"Failed to import mediapipe.tasks.python: {e}\n")

    try:
        from mediapipe.tasks.python import vision
        f.write("Successfully imported mediapipe.tasks.python.vision\n")
    except Exception as e:
        f.write(f"Failed to import mediapipe.tasks.python.vision: {e}\n")
