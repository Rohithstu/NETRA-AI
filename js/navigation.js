/**
 * Netra — Navigation Intelligence Engine (Layer 8)
 * 
 * Determines safe movement directions by scoring walking corridors
 * and avoiding obstacles detected in previous layers.
 */
class NavigationEngine {
    constructor() {
        this.currentGuidance = {
            direction: 'Analyzing...',
            reason: 'Determining safe path...',
            status: 'neutral', // neutral, safe, caution, danger
            confidence: 0
        };

        this.lastInstruction = '';
        this.frameCounter = 0;
        this.updateInterval = 10; // Frames between recalculations for stability
        this.isQueryingGemini = false;
        this.lastGeminiQueryTime = 0;
        this.dangerStartTime = 0;
        this.isCallingAssistant = false;
        this.targetObject = null;
        this.targetStartTime = 0;
    }

    setTarget(target) {
        this.targetObject = target;
        this.targetStartTime = Date.now();
    }

    /**
     * Process all inputs to generate navigation guidance
     */
    process(spatialData, eventData, priorityData, sceneData) {
        this.frameCounter++;
        if (this.frameCounter % this.updateInterval !== 0 && this.currentGuidance.direction !== 'Analyzing...') {
            return this.currentGuidance;
        }

        // 1. Safety Filter (Highest Priority)
        const stopAlert = this._checkImmediateSafety(priorityData);
        let immediateDangerGuidance = null;
        if (stopAlert) {
            immediateDangerGuidance = {
                direction: 'STOP',
                reason: stopAlert.label,
                status: 'danger',
                confidence: 1.0
            };
        }

        // 1.5 Target Destination Routing
        if (this.targetObject && spatialData && spatialData.objects) {
            if (Date.now() - this.targetStartTime > 45000) {
                this.targetObject = null; // timeout target
            } else {
                const found = spatialData.objects.find(o => o.class.toLowerCase().includes(this.targetObject.toLowerCase()) || (o.identity && o.identity.name && o.identity.name.toLowerCase().includes(this.targetObject.toLowerCase())));
                if (found && !immediateDangerGuidance) {
                    this.currentGuidance = {
                        direction: `Move ${found.position}`,
                        reason: `Target ${this.targetObject} is ${found.distance || 'ahead'}`,
                        status: 'safe',
                        confidence: 1.0
                    };
                    return this.currentGuidance;
                }
            }
        }

        // 2. Corridor Analysis
        if (spatialData && spatialData.pathStatus) {
            const ps = spatialData.pathStatus;
            const guidance = this._decideDirection(ps, spatialData.objects);

            if (immediateDangerGuidance) {
                // If STOP is triggered, but a side path is clear, prioritize evasion
                if (guidance.direction.includes('Move')) {
                    immediateDangerGuidance = {
                        direction: guidance.direction,
                        reason: `${stopAlert.label}. ${guidance.reason}`,
                        status: 'danger',
                        confidence: 1.0
                    };
                }
                this.currentGuidance = immediateDangerGuidance;
            } else if (!this.isQueryingGemini) {
                // Update guidance only if Gemini isn't overriding
                this.currentGuidance = {
                    ...guidance,
                    confidence: 0.8
                };
            }
        } else if (immediateDangerGuidance) {
            this.currentGuidance = immediateDangerGuidance;
        }

        // Tracking Danger / No Progress duration
        if (this.currentGuidance.status === 'danger') {
            if (this.dangerStartTime === 0) {
                this.dangerStartTime = Date.now();
            } else if (Date.now() - this.dangerStartTime > 10000) { // 10 seconds of no progress
                // Instead of a modal, we proactively ask Gemini for a suggestion
                if (!this.isQueryingGemini && (Date.now() - this.lastGeminiQueryTime > 10000)) {
                    this._queryGemini(spatialData.pathStatus, spatialData.objects);
                }
            }
        } else {
            this.dangerStartTime = 0;
        }

        return this.currentGuidance;
    }

    /* ================================================================== */
    /*  PRIVATE METHODS                                                   */
    /* ================================================================== */

    _checkImmediateSafety(priority) {
        if (!priority || !priority.active) return null;
        // Immediate stop for high priority hazards in center
        return priority.active.find(a =>
            a.classification === 'High' &&
            (a.position === 'center' || a.distance < 1.0)
        );
    }

    _decideDirection(pathStatus, objects) {
        // Preference: Center > Right > Left (arbitrary heuristic)

        // Is anything in the path? If yes, use Gemini for intelligent navigation instead of hardcoded rules
        const isPathBlocked = (pathStatus.center !== 'clear' || pathStatus.right !== 'clear' || pathStatus.left !== 'clear');

        if (isPathBlocked && !this.isQueryingGemini && (Date.now() - this.lastGeminiQueryTime > 5000)) {
            this._queryGemini(pathStatus, objects);
        }

        if (pathStatus.center === 'clear') {
            return {
                direction: 'Continue Forward',
                reason: 'Center path is clear',
                status: 'safe'
            };
        }

        // Prefer clear over warning. If checking right vs left...
        if (pathStatus.right === 'clear') {
            return { direction: 'Move Right', reason: 'Obstacle ahead, right is clear', status: 'caution' };
        }
        if (pathStatus.left === 'clear') {
            return { direction: 'Move Left', reason: 'Obstacle ahead, left is clear', status: 'caution' };
        }

        // If neither is perfectly clear, but one is "warning" and the other is "blocked"
        if (pathStatus.right === 'warning' && pathStatus.left === 'blocked') {
            return { direction: 'Move Right', reason: 'Right has more space', status: 'caution' };
        }
        if (pathStatus.left === 'warning' && pathStatus.right === 'blocked') {
            return { direction: 'Move Left', reason: 'Left has more space', status: 'caution' };
        }

        // If nothing is clear, find the least blocked or stop
        const obstacleNearby = objects.find(o => o.distance < 2.0);
        return {
            direction: 'Stop and Scan',
            reason: obstacleNearby ? `Obstacle ${obstacleNearby.class} too close` : 'Path fully obstructed',
            status: 'danger'
        };
    }

    async _queryGemini(pathStatus, objects) {
        this.isQueryingGemini = true;
        this.lastGeminiQueryTime = Date.now();

        try {
            const mappedObjects = objects.map(o => ({
                class: o.class,
                distance: o.distance,
                position: o.position
            }));

            const res = await fetch('http://localhost:8001/api/gemini_guide', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pathStatus, objects: mappedObjects })
            });

            const data = await res.json();

            // Override the guidance with Gemini's intelligence
            if (data.direction) {
                this.currentGuidance = {
                    direction: data.direction,
                    reason: data.reason,
                    status: data.status,
                    confidence: 0.95
                };

                // Immediately trigger voice update for real-time safety
                if (window.VoiceEngine) {
                    // Reset voice cooldown manually to ensure priority speech
                    window.VoiceEngine.lastSpeakTime = 0;
                    window.VoiceEngine.speakNavigation(this.currentGuidance);
                }
            }
        } catch (err) {
            console.error("Gemini AI Navigation Error:", err);
        } finally {
            this.isQueryingGemini = false;
        }
    }
}

// Global instance
window.NavigationEngine = new NavigationEngine();
