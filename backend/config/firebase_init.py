
"""Firestore initialization using Application Default Credentials."""

import firebase_admin
from firebase_admin import firestore


def initialize_firestore():
    if not firebase_admin._apps:
        firebase_admin.initialize_app(
            options={"projectId": "utility-alert-system"}
        )

    return firestore.client()


db = initialize_firestore()
