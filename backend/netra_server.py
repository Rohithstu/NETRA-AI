import sys
import os
import cv2
import numpy as np
import base64
import json
import time
import asyncio
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from dotenv import load_dotenv
import requests
from core.memory_engine import MemoryEngine

import torch
from imagekitio import ImageKit
from motor.motor_asyncio import AsyncIOMotorClient

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# --- CRITICAL PROTOBUF FIX ---
os.environ["PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION"] = "python"

# Legacy Keras compatibility mapping for TensorFlow 2.16+
try:
    import tf_keras
    sys.modules['keras'] = tf_keras
    os.environ["TF_USE_LEGACY_KERAS"] = "1"
except ImportError:
    pass

# Add the core directory to path so we can import fusion_engine
sys.path.append(os.path.join(os.path.dirname(__file__), "core"))

# --- CRITICAL PATCH FOR WINDOWS WinError 6 ---
try:
    import torch.hub
    def patched_get_git_branch(repo_dir): return 'master'
    def patched_generate_repo_dir(model_dir, repo_owner, repo_name, ref):
        return os.path.join(model_dir, f"{repo_owner}_{repo_name}_{ref}")
    
    # Force torch.hub to bypass git/subprocess if it fails
    torch.hub._get_git_branch = patched_get_git_branch
    # If the handle is invalid, it's usually because it tries to call git.
    # We can try to prevent git calls by making it think it's already there or not needed.
except Exception as e:
    print(f"⚠️ Failed to apply torch.hub patch: {e}")
# ---------------------------------------------

from fusion_engine import FusionEngine
from emotion_engine import EmotionEngine
from behavior_engine import BehaviorEngine

app = FastAPI(title="Netra AI Core Server")

# Allow CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

print("🚀 Initializing Netra Fusion Engine (YOLOv8 + MiDaS)...")
try:
    engine = FusionEngine(yolo_model_path=os.path.join(os.path.dirname(__file__), "yolov8s.pt"))
except Exception as e:
    print(f"❌ Failed to initialize Fusion Engine: {e}")
    engine = None

print("🧠 Initializing Social & Emotional Intelligence Engines...")
try:
    emotion_engine = EmotionEngine(use_depth=True)
except Exception as e:
    print(f"❌ CRITICAL ERROR: Failed to initialize Emotion Engine: {e}")
    import traceback
    traceback.print_exc()
    emotion_engine = None

try:
    behavior_engine = BehaviorEngine(use_depth=True)
except Exception as e:
    print(f"⚠️ Failed to initialize Behavior Engine: {e}")
    behavior_engine = None

print("💽 Initializing Hybrid Memory Engine...")
memory_engine = MemoryEngine(storage_path=os.path.join(os.path.dirname(__file__), "memory_db.json"))

# --- DATABASE & STORAGE INITIALIZATION ---
# MongoDB Setup
mongo_uri = os.getenv("MONGO_URI", "").strip().strip('"').strip("'")
db_client = AsyncIOMotorClient(mongo_uri) if mongo_uri else None
db = db_client["netra_ai"] if db_client is not None else None
events_collection = db["vision_events"] if db is not None else None

# ImageKit Setup
ik_public = os.getenv("IMAGEKIT_PUBLIC_KEY", "").strip().strip('"').strip("'")
ik_private = os.getenv("IMAGEKIT_PRIVATE_KEY", "").strip().strip('"').strip("'")
ik_endpoint = os.getenv("IMAGEKIT_PUBLIC_ENDPOINT", "").strip().strip('"').strip("'")

imagekit = None
if ik_private and ik_endpoint:
    try:
        # Compatibility for version 5+ of imagekitio
        imagekit = ImageKit(private_key=ik_private, base_url=ik_endpoint)
        print("✅ ImageKit initialized successfully (v5).")
    except TypeError:
        # Compatibility for legacy versions
        try:
            imagekit = ImageKit(public_key=ik_public, private_key=ik_private, url_endpoint=ik_endpoint)
            print("✅ ImageKit initialized successfully (legacy).")
        except Exception as e:
            print(f"⚠️ ImageKit init failed: {e}")
            imagekit = None
    except Exception as e:
        print(f"⚠️ ImageKit init failed: {e}")
        imagekit = None

print(f"📦 Storage & Database: {'Enabled' if events_collection is not None and imagekit is not None else 'Partially Enabled'}")

async def store_event_async(frame, detections, emotions, behaviors):
    """Store high-risk event frame in ImageKit and metadata in MongoDB."""
    if imagekit is None or events_collection is None:
        return
    
    img_client = imagekit
    db_collection = events_collection
    assert img_client is not None
    assert db_collection is not None
    
    try:
        # Encode frame to base64 for ImageKit
        _, buffer = cv2.imencode('.jpg', frame)
        img_base64 = base64.b64encode(buffer).decode('utf-8')
        
        # 1. Upload to ImageKit
        upload_res = img_client.upload(
            file=img_base64,
            file_name=f"netra_event_{int(time.time())}.jpg",
            options={"folder": "/netra_events/", "tags": ["high_risk", "netra_ai"]}
        )
        
        image_url = upload_res.url
        
        # 2. Save metadata to MongoDB
        event_doc = {
            "timestamp": time.time(),
            "datetime": datetime.now().isoformat(),
            "image_url": image_url,
            "detections": detections,
            "emotions": emotions,
            "behaviors": behaviors,
            "severity": "high"
        }
        
        await db_collection.insert_one(event_doc)
        print(f"✅ Logged high-risk event to MongoDB: {image_url}")
        
    except Exception as e:
        print(f"❌ Failed to store event: {e}")

# --- API ROUTES (MUST COME BEFORE STATIC MOUNTS) ---

class GuidanceRequest(BaseModel):
    pathStatus: dict
    objects: list

class AssistantRequest(BaseModel):
    text: str
    context: dict

@app.post("/api/gemini_guide")
def gemini_guide(request: GuidanceRequest):
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return {"error": "AI not configured."}
    
    try:
        # Event Builder: Convert raw data to structured scene context
        scene_summary = memory_engine.get_summary()
        
        prompt = f"""
        You are 'Netra', a real-time assistive AI for a blind person.
        Your goal: Provide ultra-concise, safe navigation guidance.
        
        SCENE CONTEXT:
        - Recent patterns: {scene_summary}
        - Current Path Status: {request.pathStatus}
        - Detected Objects: {request.objects}
        
        RULES:
        1. Speak ONLY if there is a change or hazard.
        2. Prioritize high-risk objects (distance < 1.5m).
        3. Be extremely concise (max 10 words).
        4. Output format: JSON {{"direction": "Move Left/Right/Stop/Continue", "reason": "short reason"}}
        """
        
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.1, "response_mime_type": "application/json"}
        }
        
        res = requests.post(url, json=payload, timeout=5)
        res_data = res.json()
        
        candidates = res_data.get("candidates", [])
        if not candidates or not candidates[0].get("content", {}).get("parts"):
            print(f"⚠️ Gemini Guide Empty Response: {res_data}")
            return {"direction": "Continue Forward", "reason": "No immediate hazards detected", "status": "safe"}
            
        text = candidates[0]["content"]["parts"][0]["text"].strip()
        data = json.loads(text)
        
        return {"direction": data.get("direction", "Stop"), "reason": data.get("reason", ""), "status": "caution"}
    except Exception as e:
        print(f"⚠️ Gemini Guide Error: {e}")
        return {"direction": "Continue Forward", "reason": "Scan surroundings manually", "status": "safe"}

@app.post("/api/assistant")
def assistant_chat(request: AssistantRequest):
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return {"response": "I'm offline right now."}

    try:
        # 1. Handle "Find X" commands locally if possible
        if "find" in request.text.lower() or "where" in request.text.lower():
            target = request.text.lower().replace("find", "").replace("where", "").replace("is", "").replace("the", "").replace("my", "").strip()
            if target:
                local_memory = memory_engine.find_object(target)
                if "Last saw" in local_memory:
                    return {"response": local_memory}

        # 2. Consult Gemini for conversational response
        prompt = f"""
        You are 'Netra', a sophisticated AI assistant for a blind user. 
        Talk naturally, like a high-end Gemini Voice Assistant. Be concise, warm, and proactive.
        
        SITUATIONAL CONTEXT:
        {request.context}
        
        USER COMMAND:
        "{request.text}"
        
        RULES:
        1. If relevant, refer to the user's surroundings or recent memories.
        2. If the user says something like "remember this person as [Name]", your response must include the special tag: [[REGISTER_FACE:Name]].
        3. If the user asks to "create a path" or "find a way", include the tag: [[ACTION:FIND_PATH]].
        4. Keep responses under 2 sentences unless detailed description is requested.
        5. Do not use markdown formatting in your response text (only the special tag).
        
        RESPONSE:
        """
        
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.7},
            "safetySettings": [
                {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
                {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
                {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
                {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"}
            ]
        }
        
        res = requests.post(url, json=payload, timeout=12)
        res.raise_for_status()
        res_data = res.json()
        
        candidates = res_data.get("candidates", [])
        if not candidates or not candidates[0].get("content", {}).get("parts"):
            return {"response": "I'm still here. How can I assist you with your surroundings?"}
            
        text = candidates[0]["content"]["parts"][0]["text"].strip()
        
        # Extract Action Tags
        reg_name = None
        action = None
        
        if "[[REGISTER_FACE:" in text:
            import re
            match = re.search(r"\[\[REGISTER_FACE:(.*?)\]\]", text)
            if match:
                reg_name = match.group(1).strip()
                text = text.replace(match.group(0), "").strip()
        
        if "[[ACTION:FIND_PATH]]" in text:
            action = "find_path"
            text = text.replace("[[ACTION:FIND_PATH]]", "").strip()

        return {
            "response": text,
            "action": action or ("register_face" if reg_name else None),
            "action_data": reg_name
        }
    except Exception as e:
        print(f"⚠️ Assistant Error: {e}")
        return {"response": "I'm having a brief connection issue, but my safety sensors are still active. What else can I help with?"}

@app.post("/api/register_face")
async def register_face(file: UploadFile = File(...), name: str = Form(...)):
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if frame is None:
            return {"status": "error", "message": "Invalid image format."}
            
        if emotion_engine and emotion_engine.face_engine:
            success = emotion_engine.face_engine.remember_person(frame, name, notes="")
            if success:
                return {"status": "success", "message": f"Face for '{name}' safely encoded into Memory!"}
            else:
                return {"status": "error", "message": "Could not detect a clear face. Try another photo."}
        else:
            return {"status": "error", "message": "Neural Memory engine is offline."}
    except Exception as e:
        print(f"Face registration error: {e}")
        return {"status": "error", "message": str(e)}

@app.get("/health")
async def health_check():
    return {"status": "online", "engine": "YOLOv8 + MiDaS"}

@app.websocket("/ws/vision")
async def vision_socket(websocket: WebSocket):
    await websocket.accept()
    print("🔌 Browser connected to Netra Core via WebSocket")
    
    try:
        while True:
            # Receive base64 frame from browser
            data = await websocket.receive_text()
            
            try:
                message = json.loads(data)
                
                if "image" not in message:
                    continue
                    
                # Decode base64 image
                img_data = base64.b64decode(message["image"].split(",")[1])
                nparr = np.frombuffer(img_data, np.uint8)
                frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                
                if frame is None:
                    continue
                
                # 1. Process via Fusion Engine
                if engine:
                    annotated, detections = engine.process_frame(frame, conf_threshold=0.4)
                else:
                    detections = []
                
                # 2. Process via Emotion Engine
                emotional_results = []
                if emotion_engine:
                    _, emotional_results = emotion_engine.process_frame(frame)
                
                # 3. Process via Behavior Engine
                behavioral_results = []
                if behavior_engine:
                    _, behavioral_results = behavior_engine.process_frame(frame)
                
                # 4. Transform detections to the format expected by PerceptionEngine
                processed_results = []
                for d in detections:
                    if "bounding_box" in d:
                        x1, y1, x2, y2 = d["bounding_box"]
                        width = x2 - x1
                        height = y2 - y1
                        
                        person_name = "Unknown"
                        similarity = 0.0
                        
                        # Spatial matching: if it's a person, check if we found their face name
                        if d["object"] == "person":
                            cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
                            best_dist = 200 # px tolerance
                            for e in emotional_results:
                                eb = e.get("bounding_box")
                                if eb:
                                    ecx, ecy = (eb[0] + eb[2]) / 2, (eb[1] + eb[3]) / 2
                                    dist = ((cx - ecx)**2 + (cy - ecy)**2)**0.5
                                    if dist < best_dist:
                                        best_dist = dist
                                        person_name = e.get("person", "Unknown")
                                        similarity = e.get("confidence", 0.0)
                            
                            if person_name != "Unknown":
                                print(f"🔍 Matched person: {person_name} (similarity: {similarity:.2f})")
                        
                        processed_results.append({
                            "class": d["object"],
                            "score": d["confidence"],
                            "bbox": [x1, y1, width, height],
                            "distance": d["distance"],
                            "risk": d["risk_level"], 
                            "direction": d["direction"], # Corrected depthZone mapping
                            "person": person_name,
                            "person_confidence": similarity
                        })
                        
                        # Update Hybrid Memory Engine
                        memory_engine.update_object(d["object"], d["distance"], d["direction"])
                        if person_name != "Unknown":
                            memory_engine.update_face(person_name)
                
                # Periodic memory save (every 100 frames)
                if int(time.time() * 10) % 100 == 0:
                    memory_engine.save()

                # 5. Check for High-Risk Events to Store
                high_risk_detections = [d for d in detections if d.get("risk_level") == "high"]
                if high_risk_detections and events_collection is not None and imagekit is not None:
                    # Fire and forget storage task
                    asyncio.create_task(store_event_async(frame, processed_results, emotional_results, behavioral_results))

                # New: Proactive Assistant Logic
                proactive_msg = None
                for d in processed_results:
                    if d.get("person") and d["person"] != "Unknown":
                        p_name = d["person"]
                        last_hi = memory_engine.face_history.get(p_name, 0)
                        if time.time() - last_hi > 300: # 5 minutes cooldown
                            proactive_msg = f"Netra: I see {p_name} is here."
                            memory_engine.face_history[p_name] = time.time()
                            break

                # 6. Response
                response = {
                    "detections": processed_results,
                    "emotions": emotional_results,
                    "behaviors": behavioral_results,
                    "fps": 0, 
                    "server_time": time.time(),
                    "proactive_audio": proactive_msg
                }
                
                await websocket.send_text(json.dumps(response))
            except Exception as inner_e:
                print(f"⚠️ Error processing frame: {inner_e}")
                # Send empty/error response so frontend doesn't hang forever waiting for this frame
                error_response = {
                    "detections": [],
                    "emotions": [],
                    "behaviors": [],
                    "fps": 0,
                    "server_time": time.time(),
                    "error": str(inner_e)
                }
                try:
                    await websocket.send_text(json.dumps(error_response))
                except:
                    pass
            
    except WebSocketDisconnect:
        print("🔌 Browser disconnected from Netra Core")
    except Exception as e:
        print(f"❌ Server Error: {e}")
        try:
            await websocket.close()
        except:
            pass

# --- STATIC FILE SERVING (ASSETS) ---

# Mount static files (css, js, images) from the project root
root_dir = os.path.dirname(os.path.dirname(__file__))
# Note: Handle specific folders first, then root as fallback
app.mount("/js", StaticFiles(directory=os.path.join(root_dir, "js")), name="js")
app.mount("/", StaticFiles(directory=root_dir, html=True), name="site")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
