const elements = {
    btnCamera: document.getElementById('btn-camera'),
    btnStopCamera: document.getElementById('btn-stop-camera'),
    btnUpload: document.getElementById('btn-upload'),
    btnStopUpload: document.getElementById('btn-stop-upload'),
    videoUpload: document.getElementById('video-upload'),
    btnStart: document.getElementById('btn-start'),
    btnStop: document.getElementById('btn-stop'),

    videoContainer: document.getElementById('video-container'),
    videoPlaceholder: document.getElementById('video-placeholder'),
    sourceVideo: document.getElementById('source-video'),
    overlayCanvas: document.getElementById('overlay-canvas'),

    systemStatus: document.getElementById('system-status'),
    statusText: document.querySelector('.status-text'),

    objectCount: document.getElementById('object-count'),
    detectionList: document.getElementById('detection-list'),
    perfStats: document.getElementById('perf-stats'),

    // Iriun / Camera Selector
    cameraSelectorGroup: document.getElementById('camera-selector-group'),
    cameraSelect: document.getElementById('camera-select'),
    btnRefreshCameras: document.getElementById('btn-refresh-cameras'),

    // Dedicated Iriun Elements
    btnIriunLauncher: document.getElementById('btn-iriun-launcher'),
    iriunModal: document.getElementById('iriun-modal'),
    closeIriunModal: document.getElementById('close-iriun-modal'),
    btnIriunRetry: document.getElementById('btn-iriun-retry'),
    btnIriunTroubleshoot: document.getElementById('btn-iriun-troubleshoot'),
    iriunSearchText: document.getElementById('iriun-search-text'),
    cameraStatusIndicator: document.getElementById('camera-status-indicator'),

    // Face Registration Modal
    btnRegisterFaceModal: document.getElementById('btn-register-face-modal'),
    faceModal: document.getElementById('face-modal'),
    closeFaceModal: document.getElementById('close-face-modal'),
    btnFaceCapture: document.getElementById('btn-face-capture'),
    btnFaceSubmit: document.getElementById('btn-face-submit'),
    faceName: document.getElementById('face-name'),
    faceUpload: document.getElementById('face-upload'),
    faceRegisterStatus: document.getElementById('face-register-status'),

};

let stream = null;
let currentMode = null; // 'camera' or 'video'
let iriunScanInterval = null;
let isConnectingIriun = false;
let lastIriunIndex = -1; // Keep track of which Iriun camera we tried last
let isManualMode = false; // Whether the user is manually picking a camera

/* ======================================================== */
/*  CAMERA DEVICE ENUMERATION (Iriun Webcam support)        */
/* ======================================================== */

/**
 * Populate the camera dropdown with all available videoinput devices.
 * Auto-selects Iriun Webcam if detected.
 */
async function populateCameraList() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');

        elements.cameraSelect.innerHTML = '';
        const debugUl = document.getElementById('detected-cameras-ul');
        if (debugUl) debugUl.innerHTML = '';

        if (videoDevices.length === 0) {
            elements.cameraSelect.innerHTML = '<option value="">No cameras found</option>';
            return;
        }

        let iriunIndices = [];
        videoDevices.forEach((device, index) => {
            const isIriun = device.label.toLowerCase().includes('iriun');
            if (isIriun) iriunIndices.push(index);

            const option = document.createElement('option');
            option.value = device.deviceId;
            const label = device.label || `Camera ${index + 1}`;
            option.textContent = isIriun ? `📱 ${label} (Iriun)` : `📷 ${label}`;
            option.dataset.isIriun = isIriun;
            elements.cameraSelect.appendChild(option);

            if (debugUl) {
                const li = document.createElement('li');
                li.innerHTML = isIriun ? `<b>📱 ${label}</b>` : `📷 ${label}`;
                debugUl.appendChild(li);
            }
        });

        // Smart Selection Logic:
        // Iriun often creates dummy virtual slots like "Iriun Webcam #2" or "#3"
        // We MUST prioritize the primary base "Iriun Webcam" to receive actual video.
        let selectedIndex = 0;
        if (iriunIndices.length > 0) {
            let primaryIndex = iriunIndices.find(idx => {
                const label = elements.cameraSelect.options[idx].text.toLowerCase();
                return label.includes('iriun') && !label.includes('#');
            });

            // If a base Iriun isn't found, fallback to the first available Iriun slot
            selectedIndex = primaryIndex !== undefined ? primaryIndex : iriunIndices[0];
        }

        elements.cameraSelect.selectedIndex = selectedIndex;
        console.log(`[CameraSelector] Found ${videoDevices.length} camera(s). Iriun count: ${iriunIndices.length}. Using: ${elements.cameraSelect.options[selectedIndex].text}`);

        return iriunIndices.length > 0;
    } catch (err) {
        console.error('[CameraSelector] Failed to enumerate devices:', err);
        return false;
    }
}

/**
 * Open a camera stream using the currently selected device.
 */
async function openSelectedCameraStream() {
    const selectedDeviceId = elements.cameraSelect.value;

    const constraints = selectedDeviceId
        ? { video: { deviceId: { exact: selectedDeviceId } }, audio: false }
        : { video: { facingMode: 'environment' }, audio: false };

    try {
        console.log(`[Camera] Requesting stream for device: ${selectedDeviceId || 'default'}`);
        stream = await navigator.mediaDevices.getUserMedia(constraints);

        elements.sourceVideo.srcObject = stream;
        elements.sourceVideo.style.display = 'block';
        elements.videoPlaceholder.style.display = 'none';
        currentMode = 'camera';

        return new Promise((resolve, reject) => {
            elements.sourceVideo.onloadedmetadata = () => {
                elements.sourceVideo.play().then(() => {
                    updateUIState('ready');

                    // --- Stream Health Monitor for Wi-Fi Drops ---
                    const videoTrack = stream.getVideoTracks()[0];
                    if (videoTrack) {
                        videoTrack.onended = () => {
                            console.warn("⚠️ Camera track ended unexpectedly (Wi-Fi drop?). Auto-restarting...");
                            if (currentMode === 'camera') setTimeout(() => openSelectedCameraStream(), 1000);
                        };
                        videoTrack.onmute = () => {
                            console.warn("⚠️ Camera track muted (Virtual driver disconnected?). Auto-restarting...");
                            if (currentMode === 'camera') setTimeout(() => openSelectedCameraStream(), 2000);
                        };
                    }

                    resolve(true);
                }).catch(reject);
            };
            elements.sourceVideo.onerror = (err) => {
                reject(new Error("Video element error: " + err.message));
            };
            // Safety timeout
            setTimeout(() => reject(new Error("Camera metadata timeout")), 8000);
        });
    } catch (err) {
        console.error('[Camera] Error in openSelectedCameraStream:', err);

        let userMessage = 'Could not access camera.';
        if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
            userMessage = 'Camera is already in use by another application (e.g., Zoom, Teams, or another tab). Please close other apps and try again.';
        } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            userMessage = 'Camera permission denied. Please enable camera access in your browser settings.';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            userMessage = 'No camera found. Please ensure your camera is connected.';
        } else if (err.message) {
            userMessage += ' ' + err.message;
        }

        stopMedia();
        updateUIState('idle');
        if (elements.cameraStatusIndicator) {
            elements.cameraStatusIndicator.classList.add('error');
        }
        alert(userMessage);
        throw err;
    }
}

/* ======================================================== */
/*  INIT                                                     */
/* ======================================================== */

function init() {
    setupEventListeners();
    updateUIState('idle');

    // Listen for new devices being plugged in (e.g. Iriun connecting via USB/Wi-Fi)
    navigator.mediaDevices.addEventListener('devicechange', async () => {
        if (currentMode === 'camera') {
            await populateCameraList();
        }
    });

    // --- AUTOSTART SEQUENCE ---
    setTimeout(async () => {
        console.log("🛠️ Starting Hands-Free Initialization...");

        // 1. Wake up camera labels
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const hasLabels = devices.some(d => d.label !== "");
            if (!hasLabels) {
                const temp = await navigator.mediaDevices.getUserMedia({ video: true });
                temp.getTracks().forEach(t => t.stop());
            }
        } catch (e) {
            console.warn("Autostart: Could not wake up cameras:", e);
        }

        // 2. Populate list and look for Iriun
        const foundAny = await populateCameraList();
        const hasIriun = elements.cameraSelect.options[elements.cameraSelect.selectedIndex]?.text.toLowerCase().includes('iriun');

        if (foundAny) {
            console.log(hasIriun ? "📱 Iriun detected! Autostarting stream..." : "📷 Camera detected! Autostarting stream...");
            try {
                await openSelectedCameraStream();
                // 3. Start Analysis
                setTimeout(() => {
                    console.log("⚡ Starting Perception Engine...");
                    startAnalysis();
                    if (window.VoiceEngine) {
                        window.VoiceEngine.speak("Netra is online and monitoring your surroundings.");
                    }
                }, 1000);
            } catch (err) {
                console.error("Autostart failed:", err);
            }
        } else {
            console.log("No camera found for autostart, waiting for manual trigger...");
        }
    }, 2000);
}

/* ======================================================== */
/*  IRIUN AUTO-SCAN LOGIC                                   */
/* ======================================================== */

function startIriunAutoScan() {
    if (iriunScanInterval || isManualMode) return;
    elements.iriunSearchText.textContent = "Scanning for Iriun Webcam...";

    let attempts = 0;
    iriunScanInterval = setInterval(async () => {
        if (isConnectingIriun || isManualMode) return; // Don't scan while currently trying to connect or in manual mode

        attempts++;
        const found = await populateCameraList();
        if (found) {
            handleIriunFound();
        } else {
            elements.iriunSearchText.textContent = `Searching for your phone... (Scan #${attempts})`;
            if (attempts > 10) {
                elements.iriunSearchText.innerHTML = 'Still searching... <br><small>Try "Manual Select" below if it is visible in the list.</small>';
            }
        }
    }, 2000);
}

function stopIriunAutoScan() {
    if (iriunScanInterval) {
        clearInterval(iriunScanInterval);
        iriunScanInterval = null;
    }
}

async function handleIriunFound(targetDeviceId = null) {
    if (isConnectingIriun) return;
    isConnectingIriun = true;

    stopIriunAutoScan();
    elements.iriunSearchText.innerHTML = '<span style="color:#22c55e">✔️ Found Iriun!</span><br>Syncing video stream...';

    // If a manual ID was passed (from manual select), use it
    if (targetDeviceId) {
        elements.cameraSelect.value = targetDeviceId;
    }

    // Smooth delay before closing to show success state
    setTimeout(async () => {
        try {
            // Check if we are already streaming Iriun to avoid flicker
            const currentDeviceId = elements.cameraSelect.value;
            const isAlreadyActive = stream && stream.active &&
                elements.cameraSelect.options[elements.cameraSelect.selectedIndex]?.text.toLowerCase().includes('iriun');

            if (!isAlreadyActive) {
                console.log('[IriunLauncher] Starting Iriun stream...');
                if (stream) stopMedia();
                await openSelectedCameraStream();
            } else {
                console.log('[IriunLauncher] Iriun already active, skipping re-stream.');
            }

            // Close modal and show controls
            elements.iriunModal.classList.add('hidden');
            elements.cameraSelectorGroup.classList.remove('hidden');

            // Update Toggle buttons
            elements.btnCamera.classList.add('hidden');
            elements.btnStopCamera.classList.remove('hidden');
            elements.btnStopUpload.classList.add('hidden');
            elements.btnUpload.classList.remove('hidden');

            console.log('[IriunLauncher] Auto-connection complete.');
        } catch (err) {
            console.error('[IriunLauncher] Error during final connection:', err);
            elements.iriunSearchText.innerHTML = '<span style="color:var(--danger)">Connection Failed.</span><br>Click Retry to try again.';
            if (elements.cameraStatusIndicator) {
                elements.cameraStatusIndicator.classList.add('error');
            }
            isConnectingIriun = false;
        } finally {
            isConnectingIriun = false;
        }
    }, 800);
}

/* ======================================================== */
/*  EVENT LISTENERS                                          */
/* ======================================================== */

function setupEventListeners() {

    // ── Dedicated Iriun Launcher ────────────────────────────
    elements.btnIriunLauncher.addEventListener('click', async () => {
        try {
            // Reset state
            isManualMode = false;
            const btnManualSwitch = document.getElementById('btn-manual-switch');
            if (btnManualSwitch) btnManualSwitch.textContent = "Manual Select";

            // If already searching or connecting, don't restart
            if (iriunScanInterval || isConnectingIriun) return;

            elements.iriunModal.classList.remove('hidden');

            // CRITICAL: Browsers hide device names (labels) until getUserMedia is called once.
            // We call a quick temp stream to "unlock" the names so we can find "Iriun".
            elements.iriunSearchText.textContent = "Waking up camera system...";

            // Only request if labels are missing
            const devices = await navigator.mediaDevices.enumerateDevices();
            const hasLabels = devices.some(d => d.label !== "");

            if (!hasLabels) {
                const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                tempStream.getTracks().forEach(t => t.stop());
            }

            startIriunAutoScan();
        } catch (err) {
            console.error('[IriunLauncher] Permission denied or error:', err);
            elements.iriunSearchText.innerHTML = '<span style="color:var(--danger)">Permission Denied.</span><br>Please allow camera access in the address bar.';
        }
    });

    elements.closeIriunModal.addEventListener('click', () => {
        elements.iriunModal.classList.add('hidden');
        stopIriunAutoScan();
        isManualMode = false;
    });

    // Manual Switch logic within Iriun Modal
    const btnManualSwitch = document.getElementById('btn-manual-switch');
    if (btnManualSwitch) {
        btnManualSwitch.addEventListener('click', () => {
            isManualMode = !isManualMode;
            if (isManualMode) {
                stopIriunAutoScan();
                btnManualSwitch.textContent = "Auto Scan";
                elements.iriunSearchText.textContent = "Manual Selection Active. Click a camera below.";
                populateCameraList();
            } else {
                btnManualSwitch.textContent = "Manual Select";
                startIriunAutoScan();
            }
        });
    }

    // Delegate camera list clicks in modal for manual selection
    const debugUl = document.getElementById('detected-cameras-ul');
    if (debugUl) {
        debugUl.addEventListener('click', async (e) => {
            if (!isManualMode) return;
            const li = e.target.closest('li');
            if (li) {
                const labelText = li.innerText.replace('📱 ', '').replace('📷 ', '').trim();
                console.log('[IriunLauncher] Manual selection:', labelText);

                // Find device ID from the selector's options
                let targetId = null;
                for (let option of elements.cameraSelect.options) {
                    if (option.text.includes(labelText)) {
                        targetId = option.value;
                        break;
                    }
                }

                if (targetId) handleIriunFound(targetId);
            }
        });
    }

    elements.btnIriunRetry.addEventListener('click', async () => {
        isManualMode = false;
        const btnManualSwitch = document.getElementById('btn-manual-switch');
        if (btnManualSwitch) btnManualSwitch.textContent = "Manual Select";

        elements.iriunSearchText.textContent = "Scanning again...";
        const found = await populateCameraList();
        if (found) {
            handleIriunFound();
        } else {
            elements.iriunSearchText.textContent = "Still searching... check Wi-Fi and Desktop App.";
        }
    });

    elements.btnIriunTroubleshoot.addEventListener('click', () => {
        alert("FIREWALL FIX:\n1. Open Windows Firewall Settings.\n2. Click 'Allow an app through firewall'.\n3. Ensure 'Iriun Webcam' is checked for BOTH Private and Public networks.\n4. Restart Iriun Desktop App.");
    });

    // ── Camera Mode ────────────────────────────────────────
    elements.btnCamera.addEventListener('click', async () => {
        try {
            if (stream) stopMedia();
            updateUIState('idle');

            // Step 1: Request a temporary permission-triggering stream to unlock device labels
            elements.statusText.textContent = 'Initializing camera...';
            const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            tempStream.getTracks().forEach(t => t.stop()); // release immediately

            // Step 2: Populate dropdown now that labels are available
            await populateCameraList();
            elements.cameraSelectorGroup.classList.remove('hidden');

            // Step 3: Open stream using selected device
            await openSelectedCameraStream();

            // UI state
            elements.btnCamera.classList.add('hidden');
            elements.btnStopCamera.classList.remove('hidden');
            elements.btnStopUpload.classList.add('hidden');
            elements.btnUpload.classList.remove('hidden');

        } catch (err) {
            // Error handled inside openSelectedCameraStream or above
            console.error('Camera activation failed:', err);
        }
    });

    // ── Stop Camera ────────────────────────────────────────
    elements.btnStopCamera.addEventListener('click', () => {
        stopAnalysis();
        stopMedia();
        elements.sourceVideo.style.display = 'none';
        elements.videoPlaceholder.style.display = 'flex';
        elements.btnStopCamera.classList.add('hidden');
        elements.btnCamera.classList.remove('hidden');
        elements.cameraSelectorGroup.classList.add('hidden');
        currentMode = null;
        updateUIState('idle');
    });

    // ── Live camera switching ──────────────────────────────
    elements.cameraSelect.addEventListener('change', async () => {
        if (currentMode !== 'camera') return;
        try {
            const oldMode = currentMode;
            stopMedia();
            updateUIState('idle');
            await openSelectedCameraStream();
            currentMode = oldMode;
            console.log('[CameraSelector] Switched to:', elements.cameraSelect.options[elements.cameraSelect.selectedIndex].text);
        } catch (err) {
            console.error('[CameraSelector] Failed to switch camera:', err);
            // openSelectedCameraStream already alerts and resets UI
        }
    });

    // ── Refresh camera list ────────────────────────────────
    elements.btnRefreshCameras.addEventListener('click', async () => {
        elements.btnRefreshCameras.textContent = '⏳';
        await populateCameraList();
        elements.btnRefreshCameras.textContent = '🔄';
    });

    // ── Upload Mode ────────────────────────────────────────
    elements.btnUpload.addEventListener('click', () => {
        elements.videoUpload.click();
    });

    elements.videoUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (stream) stopMedia();

        const url = URL.createObjectURL(file);
        elements.sourceVideo.srcObject = null;
        elements.sourceVideo.src = url;
        elements.sourceVideo.style.display = 'block';
        elements.videoPlaceholder.style.display = 'none';
        elements.sourceVideo.loop = true;
        currentMode = 'video';

        elements.btnUpload.classList.add('hidden');
        elements.btnStopUpload.classList.remove('hidden');
        elements.btnStopCamera.classList.add('hidden');
        elements.btnCamera.classList.remove('hidden');
        elements.cameraSelectorGroup.classList.add('hidden'); // hide selector in upload mode

        elements.sourceVideo.onloadeddata = () => {
            elements.sourceVideo.play();
            updateUIState('ready');
        };
    });

    // ── Stop Upload ────────────────────────────────────────
    elements.btnStopUpload.addEventListener('click', () => {
        stopAnalysis();
        stopMedia();
        elements.sourceVideo.style.display = 'none';
        elements.videoPlaceholder.style.display = 'flex';
        elements.btnStopUpload.classList.add('hidden');
        elements.btnUpload.classList.remove('hidden');
        elements.videoUpload.value = '';
        currentMode = null;
        updateUIState('idle');
    });

    // ── Face Registration ──────────────────────────────────
    if (elements.btnRegisterFaceModal) {
        elements.btnRegisterFaceModal.addEventListener('click', () => {
            elements.faceModal.classList.remove('hidden');
            elements.faceRegisterStatus.textContent = '';
        });
    }

    if (elements.closeFaceModal) {
        elements.closeFaceModal.addEventListener('click', () => {
            elements.faceModal.classList.add('hidden');
        });
    }

    if (elements.btnFaceCapture) {
        elements.btnFaceCapture.addEventListener('click', async () => {
            const name = elements.faceName.value.trim();
            if (!name) {
                elements.faceRegisterStatus.style.color = '#ef4444';
                elements.faceRegisterStatus.textContent = 'Please provide a Name first.';
                return;
            }
            if (!stream || !elements.sourceVideo.srcObject) {
                elements.faceRegisterStatus.style.color = '#ef4444';
                elements.faceRegisterStatus.textContent = 'Error: Live camera is not running.';
                return;
            }

            elements.faceRegisterStatus.style.color = '#3b82f6';
            elements.faceRegisterStatus.textContent = 'Capturing frame and sending to AI...';
            elements.btnFaceCapture.disabled = true;

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = elements.sourceVideo.videoWidth || 640;
            tempCanvas.height = elements.sourceVideo.videoHeight || 480;
            const ctx = tempCanvas.getContext('2d');
            ctx.drawImage(elements.sourceVideo, 0, 0, tempCanvas.width, tempCanvas.height);

            tempCanvas.toBlob(async (blob) => {
                const file = new File([blob], 'capture.jpg', { type: 'image/jpeg' });
                const formData = new FormData();
                formData.append('name', name);
                formData.append('file', file);

                try {
                    const res = await fetch('http://localhost:8001/api/register_face', {
                        method: 'POST',
                        body: formData
                    });
                    const data = await res.json();

                    if (data.status === 'success') {
                        elements.faceRegisterStatus.style.color = '#22c55e';
                        elements.faceRegisterStatus.textContent = data.message;
                        setTimeout(() => {
                            elements.faceModal.classList.add('hidden');
                            elements.faceName.value = '';
                            elements.btnFaceCapture.disabled = false;
                        }, 2000);
                    } else {
                        elements.faceRegisterStatus.style.color = '#ef4444';
                        elements.faceRegisterStatus.textContent = data.message;
                        elements.btnFaceCapture.disabled = false;
                    }
                } catch (err) {
                    elements.faceRegisterStatus.style.color = '#ef4444';
                    elements.faceRegisterStatus.textContent = 'Backend unreachable.';
                    elements.btnFaceCapture.disabled = false;
                }
            }, 'image/jpeg', 0.95);
        });
    }

    if (elements.btnFaceSubmit) {
        elements.btnFaceSubmit.addEventListener('click', async () => {
            const name = elements.faceName.value.trim();
            const file = elements.faceUpload.files[0];

            if (!name || !file) {
                elements.faceRegisterStatus.style.color = '#ef4444'; // red
                elements.faceRegisterStatus.textContent = 'Please provide both Name and an Image.';
                return;
            }

            elements.faceRegisterStatus.style.color = '#3b82f6'; // blue
            elements.faceRegisterStatus.textContent = 'Uploading to Netra AI Core...';
            elements.btnFaceSubmit.disabled = true;

            const formData = new FormData();
            formData.append('name', name);
            formData.append('file', file);

            try {
                const res = await fetch('http://localhost:8001/api/register_face', {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();

                if (data.status === 'success') {
                    elements.faceRegisterStatus.style.color = '#22c55e'; // green
                    elements.faceRegisterStatus.textContent = data.message;
                    setTimeout(() => {
                        elements.faceModal.classList.add('hidden');
                        elements.faceName.value = '';
                        elements.faceUpload.value = '';
                        elements.btnFaceSubmit.disabled = false;
                    }, 2000);
                } else {
                    elements.faceRegisterStatus.style.color = '#ef4444';
                    elements.faceRegisterStatus.textContent = data.message;
                    elements.btnFaceSubmit.disabled = false;
                }
            } catch (err) {
                elements.faceRegisterStatus.style.color = '#ef4444';
                elements.faceRegisterStatus.textContent = 'Target backend unreachable or server loading.';
                elements.btnFaceSubmit.disabled = false;
            }
        });
    }

    // ── Start / Stop Analysis ──────────────────────────────
    elements.btnStart.addEventListener('click', () => {
        if (!elements.btnStart.disabled) {
            startAnalysis();
        }
    });

    elements.btnStop.addEventListener('click', () => {
        stopAnalysis();
    });

    // ── Depth heatmap toggle ───────────────────────────────
    const depthToggle = document.getElementById('toggle-depth');
    if (depthToggle) {
        depthToggle.addEventListener('change', (e) => {
            if (window.PerceptionEngine) {
                window.PerceptionEngine.toggleDepthMap(e.target.checked);
            }
        });
    }

}

/* ======================================================== */
/*  MEDIA HELPERS                                            */
/* ======================================================== */

function stopMedia() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
    elements.sourceVideo.pause();
    elements.sourceVideo.src = '';
    elements.sourceVideo.srcObject = null;
}

/* ======================================================== */
/*  UI STATE                                                 */
/* ======================================================== */

function updateUIState(state) {
    if (state === 'idle') {
        elements.statusText.textContent = 'System Idle';
        elements.systemStatus.classList.remove('active');
        elements.btnStart.disabled = true;
        elements.btnStart.classList.add('disabled');
        elements.btnStop.classList.add('hidden');
        elements.btnStart.classList.remove('hidden');
        elements.videoContainer.classList.remove('active');
        elements.perfStats.style.display = 'none';
        if (elements.cameraStatusIndicator) {
            elements.cameraStatusIndicator.classList.remove('active', 'error');
        }
    } else if (state === 'ready') {
        elements.statusText.textContent = 'Ready for Analysis';
        elements.systemStatus.classList.remove('active');
        elements.btnStart.disabled = false;
        elements.btnStart.classList.remove('disabled');
        elements.btnStop.classList.add('hidden');
        elements.btnStart.classList.remove('hidden');
        if (elements.cameraStatusIndicator) {
            elements.cameraStatusIndicator.classList.add('active');
            elements.cameraStatusIndicator.classList.remove('error');
        }
    } else if (state === 'running') {
        elements.statusText.textContent = 'Perception Engine Active';
        elements.systemStatus.classList.add('active');
        elements.btnStart.classList.add('hidden');
        elements.btnStop.classList.remove('hidden');
        elements.videoContainer.classList.add('active');
        elements.perfStats.style.display = 'block';
    }
}

function startAnalysis() {
    updateUIState('running');
    if (window.PerceptionEngine) {
        window.PerceptionEngine.start(elements.sourceVideo, elements.overlayCanvas);
    } else {
        console.error('Perception Engine not loaded.');
    }
}

function stopAnalysis() {
    updateUIState('ready');
    if (window.PerceptionEngine) {
        window.PerceptionEngine.stop();
    }
}

// Resize canvas when window resizes
window.addEventListener('resize', () => {
    if (window.PerceptionEngine && window.PerceptionEngine.isRunning) {
        window.PerceptionEngine.resizeCanvas();
    }
});

// Initialize app when DOM loads
document.addEventListener('DOMContentLoaded', init);
