import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import os
import cv2
import numpy as np

print("Testing PoseLandmarker on Python 3.13...")
try:
    model_path = "pose_landmarker_lite.task"
    if not os.path.exists(model_path):
        # Check in core directory
        model_path = os.path.join("core", "pose_landmarker_lite.task")
    
    if os.path.exists(model_path):
        base_options = python.BaseOptions(model_asset_path=model_path)
        options = vision.PoseLandmarkerOptions(
            base_options=base_options,
            running_mode=vision.RunningMode.IMAGE
        )
        detector = vision.PoseLandmarker.create_from_options(options)
        print("✅ detector created successfully!")
        
        # Test with a dummy image
        dummy_img = np.zeros((480, 640, 3), dtype=np.uint8)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=dummy_img)
        detector.detect(mp_image)
        print("✅ Detection test passed!")
    else:
        print(f"⚠️ Model file not found at {model_path}. Skipping detection test.")
except Exception as e:
    print(f"❌ Failed to run PoseLandmarker: {e}")
