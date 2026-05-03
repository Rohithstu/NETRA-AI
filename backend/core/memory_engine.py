import time
import json
import os

class MemoryEngine:
    """
    Netra — Memory Engine (Layer 5)
    
    Stores and retrieves historical context:
    1. Object Tracking: Last seen positions and times.
    2. Face History: Who was seen and where.
    3. Scene Patterns: Frequently visited locations.
    """
    def __init__(self, storage_path="memory_db.json"):
        self.storage_path = storage_path
        self.memory = self._load_memory()
        self.max_history = 50 # Keep last 50 events per category
        
    def _load_memory(self):
        if os.path.exists(self.storage_path):
            try:
                with open(self.storage_path, 'r') as f:
                    return json.load(f)
            except Exception as e:
                print(f"⚠️ Failed to load memory: {e}")
        return {
            "objects": {}, # name -> {last_seen, position, count}
            "faces": {},   # name -> {last_seen, count, first_seen}
            "scenes": {},  # category -> {visit_count, last_seen}
            "events": []   # historical log of high-priority events
        }
        
    def save(self):
        try:
            with open(self.storage_path, 'w') as f:
                json.dump(self.memory, f, indent=4)
        except Exception as e:
            print(f"⚠️ Failed to save memory: {e}")

    def update_object(self, obj_name, distance, direction):
        if obj_name not in self.memory["objects"]:
            self.memory["objects"][obj_name] = {"count": 0, "first_seen": time.time()}
        
        self.memory["objects"][obj_name].update({
            "last_seen": time.time(),
            "distance": distance,
            "direction": direction,
            "count": self.memory["objects"][obj_name]["count"] + 1
        })

    def update_face(self, name):
        if name == "Unknown": return
        
        if name not in self.memory["faces"]:
            self.memory["faces"][name] = {"count": 0, "first_seen": time.time()}
        
        self.memory["faces"][name].update({
            "last_seen": time.time(),
            "count": self.memory["faces"][name]["count"] + 1
        })

    def update_scene(self, category):
        if not category or category == "Initializing...": return
        
        if category not in self.memory["scenes"]:
            self.memory["scenes"][category] = {"visit_count": 0}
            
        self.memory["scenes"][category]["visit_count"] += 1
        self.memory["scenes"][category]["last_seen"] = time.time()

    def get_summary(self):
        """Returns a concise summary for LLM context."""
        summary = {
            "recent_faces": [name for name, data in self.memory["faces"].items() 
                            if time.time() - data["last_seen"] < 3600], # Last hour
            "recent_objects": [name for name, data in self.memory["objects"].items()
                              if time.time() - data["last_seen"] < 300], # Last 5 mins
            "top_scene": max(self.memory["scenes"].items(), key=lambda x: x[1]["visit_count"])[0] if self.memory["scenes"] else "Unknown"
        }
        return summary

    def find_object(self, obj_name):
        """Find where an object was last seen."""
        obj_name = obj_name.lower()
        # Search for partial match
        for key in self.memory["objects"]:
            if obj_name in key.lower():
                data = self.memory["objects"][key]
                time_diff = int(time.time() - data["last_seen"])
                return f"Last saw {key} {data['direction']} at {data['distance']}m, about {time_diff} seconds ago."
        return f"I don't recall seeing a {obj_name} recently."
