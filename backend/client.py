import os
import firebase_admin
from firebase_admin import credentials, firestore

cred_path = "C:\\Users\\Agency\\Downloads\\loopydev\\backend\\accounts.json"

if not firebase_admin._apps:
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)

db = firestore.client()
SERVER_TS = firestore.SERVER_TIMESTAMP