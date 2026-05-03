import os
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv('.env')
mongo_uri = os.getenv("MONGO_URI", "").strip().strip('"').strip("'")
print("MONGO URI LENGTH:", len(mongo_uri))

db_client = AsyncIOMotorClient(mongo_uri) if mongo_uri else None
db = db_client["netra_ai"] if db_client is not None else None
events_collection = db["vision_events"] if db is not None else None

print("DB COLLECTION:", str(events_collection))
