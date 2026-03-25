<div align="center">

<img src="https://img.shields.io/badge/Netra%20AI-Cognitive%20Guardian-blueviolet?style=for-the-badge&logo=eye&logoColor=white" alt="Netra AI"/>

# 👁️ Netra AI — Cognitive Guardian

### *Real-time AI-powered assistance for the visually impaired*

[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.11-blue?style=flat-square&logo=python)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-Backend-teal?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![TensorFlow.js](https://img.shields.io/badge/TensorFlow.js-Browser%20AI-orange?style=flat-square&logo=tensorflow)](https://www.tensorflow.org/js)
[![Gemini](https://img.shields.io/badge/Gemini-1.5%20Flash-purple?style=flat-square&logo=google)](https://deepmind.google/technologies/gemini/)

<br/>

> **Netra** *(Sanskrit: नेत्र — meaning "Eye")* is an intelligent, voice-first cognitive assistant that gives visually impaired individuals real-time environmental awareness, hazard detection, smart navigation, and conversational AI — all powered by multi-layer computer vision and edge AI.

<br/>

</div>

---

## 🌟 Highlights

| 🧠 10-Layer AI Architecture | 🎤 Fully Voice-First | 🚨 Emergency Override System |
|:---:|:---:|:---:|
| From raw pixels to intelligent decisions | Hands-free activation with wake-word | Life-critical alerts interrupt everything |

| 📱 Phone-as-Webcam | 🏎️ Dual AI Engine Mode | 🧭 Destination Guidance |
|:---:|:---:|:---:|
| Iriun virtual camera support | Browser (offline) + Python (full AI) | "Take me to the exit" |

---

## 🎯 Core Features

### 🔍 Perception & Vision
- **Real-time Object Detection** using COCO-SSD (browser) and YOLOv8 (backend)
- **Depth Estimation** with MiDaS — converts monocular video into 3D distance maps
- **Face Recognition** — identifies and remembers known individuals across sessions
- **Emotion Detection** — FER CNN detects facial emotions with intensity & proximity filtering
- **Behavior Analysis** — Detects gestures (waving, pointing) and body language patterns

### 🧭 Navigation Intelligence
- **4-Corridor Path Scoring** — left, center, right clearing analysis per frame
- **Destination Routing** — say *"Netra, take me to the exit"* and it navigates you there
- **Gemini AI Navigation Fallback** — routes difficult blockages via real-time Gemini API reasoning
- **Non-repetitive Guidance** — smart deduplication prevents audio spam

### 🗣️ Voice AI System
- **Wake Word Activation** — says *"Netra"* to activate
- **Conversational AI** — queries Google Gemini 1.5 Flash with visual scene context
- **Fail-Safe Demo Mode** — pre-loaded responses if backend is offline
- **Voice Authentication Demo** — unauthorized speaker rejection

### 🚨 4-Tier Emergency Priority Engine

| Level | Classification | Behavior |
|:---:|:---:|:---|
| 🔴 1 | **CRITICAL** | Immediately interrupts ALL speech — loud, fast alert |
| 🟠 2 | **HIGH** | Speaks if idle, queues if user is talking |
| 🟡 3 | **MEDIUM** | UI-only — shown silently on screen, never spoken |
| 🟢 4 | **LOW** | Ignored completely — zero audio spam |

### 🧠 Memory & Learning
- **Persistent Scene Memory** — remembers object positions across sessions (JSON + MongoDB)
- **Known Person Journal** — logs encounter history with timestamps
- **Adaptive Learning Engine** — improves guidance based on movement patterns

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    NETRA AI — 10 Layers                     │
├──────────┬──────────────────┬──────────────────────────────┤
│ Layer 1  │ Perception       │ COCO-SSD / YOLOv8 Detection  │
│ Layer 2  │ Spatial          │ 3D Depth + Path Scoring       │
│ Layer 3  │ Event            │ Situational Event Detection   │
│ Layer 4  │ Priority         │ CRITICAL / HIGH / MEDIUM / LOW│
│ Layer 5  │ Memory           │ MongoDB + Local JSON Store    │
│ Layer 6  │ Voice            │ Wake-word + Gemini AI + TTS   │
│ Layer 7  │ Emotion          │ FER CNN + Mixed Emotion Maps  │
│ Layer 8  │ Navigation       │ Corridor Scoring + Destination│
│ Layer 9  │ Adaptive         │ Pattern Learning              │
│ Layer 10 │ Autonomous       │ Master Coordination Engine    │
└──────────┴──────────────────┴──────────────────────────────┘
```

---

## 🛠️ Tech Stack

| Category | Technology |
|:---|:---|
| **Frontend AI** | TensorFlow.js, COCO-SSD, Web Speech API |
| **Backend** | Python 3.11, FastAPI, Uvicorn, WebSockets |
| **Computer Vision** | YOLOv8, MiDaS Depth Estimation, OpenCV |
| **Emotion AI** | FER (CNN-based), MediaPipe Pose |
| **Language AI** | Google Gemini 1.5 Flash API |
| **Storage** | MongoDB (Atlas), ImageKit CDN |
| **Webcam** | Native browser + Iriun virtual camera |

---

## 🚀 Quick Start

### Prerequisites
- Node.js (for local HTTP server)
- Python 3.11+
- A `.env` file in `backend/` with API keys

### 1. Frontend — Browser AI Mode (Offline capable)
```bash
# Serve the project
npx http-server -p 8080 -c-1

# Open in browser
http://localhost:8080
```

### 2. Backend — Full AI Mode
```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Start backend server
python netra_server.py
```

### 3. Activate Netra
> Say **"Netra"** to wake the assistant, then speak your command.

---

## 📁 Project Structure

```
netra-main/
├── index.html              # Main UI
├── style.css               # Glassmorphism dark UI
├── js/
│   ├── app.js              # Camera + Iriun integration
│   ├── perception.js       # AI detection + canvas rendering
│   ├── voice.js            # Voice engine + rule engine
│   ├── navigation.js       # Navigation + destination routing
│   ├── priority.js         # 4-tier priority classification
│   ├── spatial.js          # Depth + path corridor analysis
│   └── ...                 # 10 total AI layer modules
└── backend/
    ├── netra_server.py     # FastAPI WebSocket server
    ├── core/
    │   ├── fusion_engine.py    # YOLOv8 + MiDaS pipeline
    │   ├── emotion_engine.py   # Facial emotion detection (Layer 7)
    │   ├── behavior_engine.py  # Gesture + behavior analysis
    │   ├── face_engine.py      # Face recognition (Layer 6)
    │   └── memory_engine.py    # Persistent memory store
    └── .env                    # API keys (not committed)
```

---

## 🔐 Environment Variables

Create `backend/.env`:
```env
GEMINI_API_KEY=your_gemini_api_key
MONGO_URI=your_mongodb_connection_string
IMAGEKIT_PUBLIC_KEY=your_imagekit_public_key
IMAGEKIT_PRIVATE_KEY=your_imagekit_private_key
IMAGEKIT_PUBLIC_ENDPOINT=your_imagekit_endpoint
```

---

## 💬 Voice Commands

| Command | Action |
|:---|:---|
| *"Netra"* | Wake and activate assistant |
| *"What do you see?"* | Scene description |
| *"Take me to the exit"* | Set destination target |
| *"Who is in front?"* | Person identification |
| *"Navigate"* | Get path guidance |
| *"Stop"* | Halt all analysis |

---

## 🙏 Acknowledgements

- [COCO-SSD](https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd) — Browser-based object detection
- [YOLOv8](https://github.com/ultralytics/ultralytics) — Real-time object detection
- [MiDaS](https://github.com/isl-org/MiDaS) — Monocular depth estimation
- [FER](https://github.com/justinshenk/fer) — Facial emotion recognition
- [Google Gemini](https://deepmind.google/technologies/gemini/) — Conversational AI backbone

---

<div align="center">

**Built with ❤️ to make the world more accessible.**

*"Seeing is not just with the eyes — it's with intelligence."*

</div>
