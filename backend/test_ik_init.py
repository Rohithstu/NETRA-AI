import os
from dotenv import load_dotenv
from imagekitio import ImageKit

load_dotenv('.env')
ik_public = os.getenv('IMAGEKIT_PUBLIC_KEY', '').strip().strip('"').strip("'")
ik_private = os.getenv('IMAGEKIT_PRIVATE_KEY', '').strip().strip('"').strip("'")
ik_endpoint = os.getenv('IMAGEKIT_PUBLIC_ENDPOINT', '').strip().strip('"').strip("'")

try:
    imagekit = ImageKit(ik_private, ik_public, ik_endpoint)
    print("ImageKit positional Init Success")
except Exception as e:
    print("Failed POS:", e)
    try:
        imagekit = ImageKit(public_key=ik_public, private_key=ik_private, url_endpoint=ik_endpoint)
        print("ImageKit KW Init Success")
    except Exception as e2:
        print("Failed KW:", e2)
