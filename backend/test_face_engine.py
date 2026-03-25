import torch
from facenet_pytorch import MTCNN, InceptionResnetV1
import cv2
import numpy as np

print("Testing FaceEngine (MTCNN + FaceNet) on Python 3.13...")
try:
    device = torch.device('cpu') # Force CPU for test
    detector = MTCNN(device=device)
    recognizer = InceptionResnetV1(pretrained='vggface2').eval().to(device)
    print("✅ Models loaded successfully!")
    
    # Test detection
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    boxes, _ = detector.detect(img)
    print("✅ Detector test passed (no crash).")
    
    # Test embedding
    dummy_face = torch.randn(1, 3, 160, 160).to(device)
    embedding = recognizer(dummy_face)
    print("✅ Embedding test passed!")
    
except Exception as e:
    print(f"❌ FaceEngine error: {e}")
