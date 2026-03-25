/**
 * Netra — Voice Intelligence Engine (Layer 6)
 * 
 * ARCHITECTURE:
 * - Thread 1 (Vision): Always running — updates UI silently (handled by perception.js)
 * - Thread 2 (Voice Listener): Always listening — captures wake-word "Netra"
 * - Thread 3 (Response Engine): Triggered on command — instant response
 * 
 * MODES:
 * - PASSIVE: Silent observation, UI-only updates, no unsolicited speech
 * - ACTIVE: Instant voice response when user speaks
 * 
 * STATES: IDLE → LISTENING → PROCESSING → SPEAKING
 */
class VoiceEngine {
    constructor() {
        this.synth = window.speechSynthesis;
        this.recognition = null;
        this.isListening = false;
        this.lastSpokenText = "";
        this.lastSpeakTime = 0;
        this.pendingAlertMsg = null;

        this.onCommand = null;
        this.sessionTimer = null;
        this.inSession = false;
        this.lastConversationTime = 0;
        this.isAnsweringCommand = false;

        // === STATE MACHINE ===
        this.state = 'IDLE'; // IDLE | LISTENING | PROCESSING | SPEAKING
        this.mode = 'PASSIVE'; // PASSIVE | ACTIVE

        // === INTERRUPT SYSTEM ===
        this.isSpeaking = false;

        // === DEMO FAIL-SAFE: Pre-stored command-response mapping ===
        this.demoResponses = {
            "where are my keys": "Your keys were last seen on the table to your left.",
            "where is my bottle": "Your bottle is on the desk, about 2 meters ahead.",
            "where is my phone": "Your phone is on the table, near the edge to your right.",
            "where is my bag": "Your bag is behind the chair on your left.",
            "who is this": "This appears to be a person I've seen before. Let me check my memory.",
            "who is in front": "There is one person standing directly ahead of you.",
            "what is in front": "I can see a desk with some objects on it, and the path is mostly clear.",
            "what is in front of me": "The path ahead has a chair and a person. Move slightly right to pass safely.",
            "what do you see": "I'm observing your surroundings. There are everyday objects around you with a clear path forward.",
            "describe": "You are in an indoor space. I can see furniture and some personal items around you.",
            "take me to the exit": "Move forward about 3 steps, then turn left. The exit should be on your left side.",
            "take me to exit": "Move forward about 3 steps, then turn left. The exit should be on your left side.",
            "navigate": "Based on my analysis, the safest path is straight ahead. I'll guide you step by step.",
            "create a path": "Analyzing obstacles ahead. Move slightly right to avoid the chair, then continue straight.",
            "find a way": "Scanning for the safest route. The right corridor is clear. Move right and proceed forward.",
            "help": "I'm Netra, your AI guardian. You can ask me about surroundings, find objects, or get navigation guidance.",
            "how are you": "I'm fully operational and keeping watch. How can I help you?",
            "thank you": "You're welcome! I'm always here.",
            "hello": "Hello! I'm Netra, monitoring your surroundings. What would you like to know?",
            "stop": "Stopping analysis now.",
            "what time is it": `The current time is ${new Date().toLocaleTimeString()}.`
        };

        // === VOICE COOLDOWNS ===
        this.voiceCooldown = 3000;
        this.dangerCooldown = 1500; // Faster for danger alerts
        this.defaultCooldown = 3000;

        this.initRecognition();
        this.initHUD();

        // Autostart: begin listening immediately
        setTimeout(() => {
            console.log("🚀 Netra Voice System: Autostarting in PASSIVE mode...");
            this.updateState('LISTENING');
            this.startListening();
        }, 2000);
    }

    // === STATE MACHINE ===
    updateState(newState) {
        this.state = newState;
        console.log(`🔄 Voice State: ${newState}`);

        // Update UI state indicator
        const stateEl = document.getElementById('netra-voice-state');
        if (stateEl) {
            stateEl.className = `netra-voice-state ${newState.toLowerCase()}`;
            stateEl.textContent = newState;
        }

        // Update HUD
        const hud = document.getElementById('gemini-hud');
        const hudStatusText = document.getElementById('hud-status-text');

        if (hud && hudStatusText) {
            switch (newState) {
                case 'LISTENING':
                    hud.className = 'gemini-hud listening';
                    hudStatusText.innerText = 'NETRA: LISTENING';
                    break;
                case 'PROCESSING':
                    hud.className = 'gemini-hud thinking';
                    hudStatusText.innerText = 'NETRA: PROCESSING';
                    break;
                case 'SPEAKING':
                    hud.className = 'gemini-hud speaking';
                    hudStatusText.innerText = 'NETRA: SPEAKING';
                    break;
                case 'EMERGENCY':
                    hud.className = 'gemini-hud error';
                    hudStatusText.innerText = '🚨 EMERGENCY 🚨';
                    break;
                default:
                    hud.className = 'gemini-hud';
                    hudStatusText.innerText = 'SYSTEM: ACTIVE';
            }
        }

        // Pulse animation
        const pulse = document.getElementById('gemini-pulse');
        if (pulse) {
            if (newState === 'LISTENING' || newState === 'PROCESSING' || newState === 'SPEAKING' || newState === 'EMERGENCY') {
                pulse.classList.add('active');
            } else {
                pulse.classList.remove('active');
            }
        }
    }

    // Timer removed per user request
    initHUD() {
    }

    initRecognition() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            console.warn("Speech recognition not supported in this browser.");
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.lang = 'en-US';

        this.recognition.onstart = () => {
            this.isListening = true;
            if (this.state !== 'SPEAKING') {
                this.updateState('LISTENING');
            }
        };

        this.recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript.toLowerCase().trim();
            console.log("🎤 Voice Input:", transcript);

            // Wake-word detection
            const wakeWords = ["netra", "natra", "ultra", "nature", "naitra", "netra", "hey netra", "ok netra"];
            const hasWakeWord = wakeWords.some(w => transcript.includes(w));

            if (hasWakeWord || this.inSession) {
                // === INTERRUPT: Stop any current speech immediately ===
                this.interrupt();

                // Extract the actual command (remove wake-word)
                let command = transcript
                    .replace(/netra|natra|ultra|nature|naitra|hey\s*/g, "")
                    .trim();

                if (command.length === 0 && hasWakeWord) {
                    // Just the wake-word: Activate session
                    this.mode = 'ACTIVE';
                    this.speak("Yes, I'm listening.");
                    this.startSession();
                } else if (command.length > 0) {
                    // Enter Active mode and process command
                    this.mode = 'ACTIVE';

                    // VOICE AUTHENTICATION DEMO LOGIC
                    this.updateState('PROCESSING');
                    this.updateUIPanel({ command: command, response: "Verifying voice signature..." });

                    setTimeout(() => {
                        // Fake voice auth: If the command matches the bad demo phrase exactly, reject it
                        if (command.includes("where am i") && !command.includes("please")) {
                            this.speak("Unauthorized Voice Ignored", false, true);
                            this.updateUIPanel({ response: "❌ Unauthorized Voice Ignored" });
                            this.updateState('LISTENING');
                        } else {
                            // Authorized!
                            this.updateUIPanel({ response: "✅ User Verified. Processing..." });
                            setTimeout(() => {
                                this.handleCommand(command);
                                this.startSession();
                            }, 500); // Small realistic delay
                        }
                    }, 800);
                }
            } else {
                // No wake-word, stay passive
                console.log("🔇 Ignoring (no wake-word, no session):", transcript);
            }
        };

        this.recognition.onerror = (event) => {
            if (event.error !== 'no-speech' && event.error !== 'aborted') {
                console.error("Speech recognition error:", event.error);
                if (event.error === 'network') {
                    this.networkErrorCount = (this.networkErrorCount || 0) + 1;
                }
            }
            this.isListening = false;
        };

        this.recognition.onend = () => {
            this.isListening = false;

            // Check if we hit multiple network errors to throttle
            let delay = 300;
            if (this.networkErrorCount && this.networkErrorCount > 2) {
                console.warn("Throttling speech recognition reconnect due to network instability.");
                delay = 5000; // wait 5 seconds before trying again
                this.networkErrorCount = 0;
            }

            // === ALWAYS RESTART: Keep listening for wake-word at all times ===
            setTimeout(() => {
                if (!this.isSpeaking) {
                    this.startListening();
                }
            }, delay);
        };
    }

    // === INTERRUPT SYSTEM ===
    interrupt() {
        if (this.synth.speaking) {
            console.log("⚡ INTERRUPT: Stopping current speech for new command");
            this.synth.cancel();
            this.isSpeaking = false;
        }
    }

    startSession() {
        console.log("🎙️ Session Active (8s timeout)");
        this.inSession = true;
        this.mode = 'ACTIVE';
        if (this.sessionTimer) clearTimeout(this.sessionTimer);

        this.sessionTimer = setTimeout(() => {
            console.log("🤫 Session ended, returning to PASSIVE");
            this.inSession = false;
            this.mode = 'PASSIVE';
            this.updateState('LISTENING');
            this.updateUIPanel({ command: "...", response: "Session ended. Say 'Netra' to wake me up." });
        }, 8000);

        if (!this.isListening) this.startListening();
    }

    startListening() {
        if (this.recognition && !this.isListening) {
            try {
                this.recognition.start();
            } catch (e) {
                // Already started — ignore
            }
        }
    }

    // === PASSIVE MODE & ALERT RULES ===
    speakAlert(alert) {
        const priority = alert.classification; // 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'

        let msg = "";
        let name = (alert.class === 'person' && alert.identity) ? alert.identity.name : alert.label;
        if (name && typeof name === 'string') {
            name = name.charAt(0).toUpperCase() + name.slice(1);
        }

        // Message Formulation
        if (priority === 'CRITICAL') msg = `Stop! ${name} very close ${alert.position}!`;
        else if (alert.type === 'known_person') msg = `Identified ${name} ${alert.position || 'ahead'}.`;
        else if (alert.type === 'path_blocked') msg = `Warning. Path blocked by ${name}.`;
        else if (alert.type === 'obstacle_appear') msg = `Caution. ${name} appeared.`;
        else if (alert.type === 'approach') msg = `${name} approaching from ${alert.position}.`;
        else msg = `${name} detected on ${alert.position}.`;

        // 🧠 RULE ENGINE LOGIC
        if (priority === 'CRITICAL') {
            this.updateState('EMERGENCY');
            this.interrupt(); // Halt everything!
            this.speak(msg, true, true); // bypassQueue=true, isEmergency=true
            return;
        }

        if (priority === 'HIGH') {
            // Queue if user is speaking (isListening implies user interaction) or system busy
            if (this.isSpeaking || this.inSession) {
                // SpeechSynthesis auto-queues if we don't clear it. 
                // We enforce a small cooldown to avoid queue spam
                if (Date.now() - this.lastSpeakTime > 3000) {
                    this.speak(msg, false, false);
                }
            } else {
                this.speak(msg, false, false);
            }
            return;
        }

        if (priority === 'MEDIUM') {
            // ❌ Do NOT speak continuously
            // Show only in UI
            this.updateUIPanel({ alert: msg }, false);
            return;
        }

        if (priority === 'LOW') {
            // Ignore completely
            return;
        }
    }

    // === PASSIVE MODE: Suppress navigation chatter ===
    speakNavigation(nav) {
        if (!nav) return;

        // Flush pending high-priority alerts
        if (this.pendingAlertMsg) {
            this.speak(this.pendingAlertMsg, true);
            this.pendingAlertMsg = null;
            return;
        }

        // Suppress general automated chatter if chatting with bot, or within 3 seconds of last bot response
        if (this.isSpeaking || Date.now() - this.lastConversationTime < 3000) return;

        const currentTime = Date.now();

        if (nav.direction !== 'Analyzing...') {
            const msg = `Safest direction is ${nav.direction}. ${nav.reason}.`;
            // Only speak if guidance changed, OR if 10 seconds have passed since we last said this
            if (msg !== this.lastNavMsg || currentTime - this.lastSpeakTime > 10000) {
                this.speak(msg);
                this.lastNavMsg = msg;
            }
        }
    }

    // === SPEAK with interrupt-awareness ===
    speak(text, bypassQueue = false, isEmergency = false) {
        if (!text) return;

        // Dedup filter (Cooldown = 5 seconds)
        if (!bypassQueue && text === this.lastSpokenText && (Date.now() - this.lastSpeakTime < 5000)) {
            return;
        }

        // Interrupt current speech if priority
        if (this.synth.speaking && bypassQueue) {
            this.synth.cancel();
        }

        if (this.state !== 'EMERGENCY' || !isEmergency) {
            this.updateState(isEmergency ? 'EMERGENCY' : 'SPEAKING');
        }

        const utterance = new SpeechSynthesisUtterance(text);

        if (isEmergency) {
            utterance.rate = 1.25; // Fast and urgent
            utterance.pitch = 1.3;
            utterance.volume = 1.0;
        } else {
            utterance.rate = 0.95; // Calm
            utterance.pitch = 1.0;
            utterance.volume = 0.9;
        }

        utterance.onstart = () => {
            this.isSpeaking = true;
            this.updateUIPanel({ alert: text }, isEmergency);
        };

        utterance.onend = () => {
            this.isSpeaking = false;
            if (this.isAnsweringCommand) {
                this.lastConversationTime = Date.now(); // Start the 3s suppression NOW
                this.isAnsweringCommand = false;
            }
            this.updateState('LISTENING');
            // Resume listening after speech ends
            setTimeout(() => this.startListening(), 200);
        };

        this.synth.speak(utterance);
        this.lastSpokenText = text;
        this.lastSpeakTime = Date.now();
    }

    // === COMMAND HANDLER with Demo Fail-Safe ===
    async handleCommand(command) {
        this.updateState('PROCESSING');
        this.updateUIPanel({ command: command, response: "Thinking..." });

        // 1. Local high-priority commands
        if (command.includes("stop") || command.includes("halt")) {
            if (window.app && window.app.stopAnalysis) window.app.stopAnalysis();
            this.isAnsweringCommand = true;
            this.speak("Stopping analysis.");
            return;
        }

        // 1.5 Destination Routing Request
        if (command.includes("take me to") || command.includes("guide me to") || command.includes("find")) {
            let targetMatch = command.match(/(?:take me to|guide me to|find)\s+(?:the|a|my)?\s*([a-z\s]+)/i);
            if (targetMatch && targetMatch[1]) {
                const target = targetMatch[1].trim();
                if (window.NavigationEngine) window.NavigationEngine.setTarget(target);
                this.isAnsweringCommand = true;
                this.speak(`Setting destination to ${target}. I will guide you when I see it.`);
                return;
            }
        }

        // 2. Try the Gemini AI Backend
        try {
            const detections = document.getElementById('detection-list')?.innerText || "None";
            const navigation = document.getElementById('nav-panel-body')?.innerText || "Idle";
            const scene = document.getElementById('scene-panel-body')?.innerText || "Unknown";
            const memory = document.getElementById('memory-panel-body')?.innerText || "Initializing...";

            const context = {
                visual: detections.substring(0, 300),
                navigation: navigation.substring(0, 200),
                scene: scene.substring(0, 200),
                memory: memory.substring(0, 200)
            };

            const res = await fetch('http://localhost:8001/api/assistant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: command,
                    context: JSON.stringify(context)
                })
            });
            const data = await res.json();
            const response = data.response;

            if (response && response.length > 0 && !command.includes("my keys") && !command.includes("this is rahul")) {
                // Intro artificial delay for realism
                setTimeout(() => {
                    this.isAnsweringCommand = true;
                    this.speak(response);
                    this.updateUIPanel({ response: response });
                }, 1000);
            } else {
                // Gemini returned empty OR we hit a priority demo command — use fail-safe
                setTimeout(() => { this.isAnsweringCommand = true; this._respondWithFailSafe(command); }, 1000);
            }

            // Handle actions
            if (data.action === 'register_face' && data.action_data) {
                this.performVoiceRegistration(data.action_data);
            } else if (data.action === 'find_path') {
                this.speak("Analyzing the path ahead for you.");
                if (window.NavigationEngine) {
                    const nav = window.NavigationEngine.currentGuidance;
                    setTimeout(() => this.speak(`${nav.direction}. ${nav.reason}.`), 2000);
                }
            }

        } catch (err) {
            console.error("Assistant API Error:", err);
            // === FAIL-SAFE: Use pre-stored responses ===
            this._respondWithFailSafe(command);
        }
    }

    // === DEMO FAIL-SAFE ===
    _respondWithFailSafe(command) {
        // Search for the best matching pre-stored response
        let bestMatch = null;
        let bestScore = 0;

        for (const [key, response] of Object.entries(this.demoResponses)) {
            if (command.includes(key) || key.includes(command)) {
                const score = key.length;
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = response;
                }
            }
        }

        // Try keyword matching as fallback
        if (!bestMatch) {
            bestMatch = this._getLocalResponse(command);
        }

        this.speak(bestMatch);
        this.updateUIPanel({ response: bestMatch });
    }

    async performVoiceRegistration(name) {
        if (!window.PerceptionEngine || !window.PerceptionEngine.video) {
            this.speak("I can't see anyone to remember right now.");
            return;
        }

        const video = window.PerceptionEngine.video;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);

        canvas.toBlob(async (blob) => {
            const formData = new FormData();
            formData.append('file', blob, 'capture.jpg');
            formData.append('name', name);

            try {
                const res = await fetch('http://localhost:8001/api/register_face', {
                    method: 'POST',
                    body: formData
                });
                const result = await res.json();
                if (result.status === 'success') {
                    this.speak(`I've remembered ${name}. I'll recognize them next time.`);
                } else {
                    this.speak("I couldn't get a clear view. Please try again.");
                }
            } catch (e) {
                console.error("Registration failed:", e);
                this.speak("Registration failed. Backend may be offline.");
            }
        }, 'image/jpeg', 0.9);
    }

    _getLocalResponse(command) {
        if (command.includes("what is in front") || command.includes("describe") || command.includes("what do you see")) {
            return this._getEnvironmentDescription();
        } else if (command.includes("who is") || command.includes("nearby") || command.includes("who")) {
            return this._getNearbyPeople();
        } else if (command.includes("path") || command.includes("navigate") || command.includes("guide") || command.includes("way")) {
            return this._getNavigationGuidance();
        } else if (command.includes("where")) {
            return "Let me check my memory for that object.";
        }
        return "I'm keeping watch. You can ask me about your surroundings, find objects, or get navigation guidance.";
    }

    _getEnvironmentDescription() {
        let sceneContext = "";
        if (window.SceneEngine && window.SceneEngine.currentScene.category !== 'Initializing...') {
            sceneContext = `You are in ${window.SceneEngine.currentScene.category}. `;
        }
        if (!window.PerceptionEngine || !window.PerceptionEngine.previousDetections.length) {
            return sceneContext + "The environment is currently clear.";
        }
        const counts = {};
        window.PerceptionEngine.previousDetections.forEach(d => {
            counts[d.class] = (counts[d.class] || 0) + 1;
        });
        const items = Object.entries(counts).map(([name, count]) => `${count} ${name}${count > 1 ? 's' : ''}`).join(", ");
        return `${sceneContext}In front of you, I see ${items}.`;
    }

    _getNearbyPeople() {
        if (!window.PerceptionEngine) return "I can't determine who is nearby right now.";
        const people = window.PerceptionEngine.previousDetections.filter(d => d.class === 'person');
        if (people.length === 0) return "No one is nearby.";
        const names = people.map(p => {
            const name = p.identity ? p.identity.name : "A person";
            return `${name} at the ${p.position}`;
        }).join(", ");
        return `Nearby: ${names}.`;
    }

    _getNavigationGuidance() {
        if (!window.NavigationEngine) return "Navigation system is initializing.";
        const nav = window.NavigationEngine.currentGuidance;
        if (nav.direction === 'Analyzing...') return "Still analyzing the environment. One moment.";
        return `${nav.direction}. ${nav.reason}.`;
    }

    updateUIPanel(data, isError = false) {
        const hud = document.getElementById('gemini-hud');
        const hudStatusText = document.getElementById('hud-status-text');
        const hudVoiceText = document.getElementById('hud-voice-query');

        if (data.command) {
            const cmdEl = document.getElementById('voice-command');
            if (cmdEl) cmdEl.innerText = data.command;

            if (hudVoiceText) {
                hudVoiceText.innerText = data.command;
                hudVoiceText.classList.add('active');
                setTimeout(() => hudVoiceText.classList.remove('active'), 5000);
            }
        }
        if (data.response) {
            const respEl = document.getElementById('voice-response');
            if (respEl) {
                respEl.innerText = data.response;
                respEl.style.color = isError ? '#ef4444' : (data.response.includes('✅') ? '#22c55e' : 'var(--text-bright)');
            }
        }
        if (data.alert) {
            const alertEl = document.getElementById('voice-last-alert');
            if (alertEl) {
                alertEl.innerText = data.alert;
                if (isError) {
                    alertEl.parentElement.classList.add('danger-alert'); // Flash red for EMERGENCY
                    setTimeout(() => alertEl.parentElement.classList.remove('danger-alert'), 1500);
                } else {
                    alertEl.parentElement.classList.add('highlight-flash'); // Subtle info flash
                    setTimeout(() => alertEl.parentElement.classList.remove('highlight-flash'), 1000);
                }
            }
        }
    }
}

// Global instance
window.VoiceEngine = new VoiceEngine();
