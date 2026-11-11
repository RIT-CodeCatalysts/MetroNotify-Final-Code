"""Offline tests: no Firebase, SMTP, internet, or database writes occur.

Run from the project root with `python -m unittest discover -s backend/tests -v`.
"""
import importlib.util
import os
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

MODULE_PATH = Path(__file__).resolve().parents[1] / "modules" / "email_delivery.py"


class FakeDocument:
    def __init__(self, value=None):
        self.value = value
        self.exists = value is not None
        self.writes = []

    def get(self):
        return self

    def to_dict(self):
        return self.value

    def create(self, value):
        if self.exists:
            raise ValueError("mail entry exists")
        self.writes.append(value)
        self.value = value
        self.exists = True


class FakeCollection:
    def __init__(self):
        self.documents = {}

    def document(self, uid):
        return self.documents.setdefault(uid, FakeDocument())


class FakeDB:
    def __init__(self):
        self.collections = {"users": FakeCollection(), "mail": FakeCollection()}

    def collection(self, name):
        return self.collections[name]


class EmailDeliveryOfflineTests(unittest.TestCase):
    def setUp(self):
        self.db = FakeDB()
        self.db.collection("users").documents["u1"] = FakeDocument({"emailNotificationsEnabled": True})
        self.user = types.SimpleNamespace(email="person@example.test", email_verified=True, disabled=False)
        self.auth = types.SimpleNamespace(get_user=lambda uid: self.user)
        fake_admin = types.ModuleType("firebase_admin")
        fake_admin.auth = self.auth
        fake_admin.firestore = types.SimpleNamespace(SERVER_TIMESTAMP="SERVER_TIME")
        fake_config = types.ModuleType("config")
        fake_config.__path__ = []
        fake_init = types.ModuleType("config.firebase_init")
        fake_init.db = self.db
        self.modules = {"firebase_admin": fake_admin, "config": fake_config,
                        "config.firebase_init": fake_init}
        self.patch = patch.dict(sys.modules, self.modules)
        self.patch.start()
        spec = importlib.util.spec_from_file_location("metro_email_delivery_test", MODULE_PATH)
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)

    def tearDown(self):
        self.patch.stop()

    def enqueue(self):
        return self.module.queue_notification_email("u1", "n1", "Status updated", "Report is assigned")

    def test_disabled_feature_never_queues_mail(self):
        with patch.dict(os.environ, {"METRONOTIFY_EMAIL_ENABLED": "0"}):
            self.assertFalse(self.enqueue())
        self.assertFalse(self.db.collection("mail").document("n1").exists)

    def test_opt_out_never_queues_mail(self):
        self.db.collection("users").documents["u1"].value["emailNotificationsEnabled"] = False
        with patch.dict(os.environ, {"METRONOTIFY_EMAIL_ENABLED": "1"}):
            self.assertFalse(self.enqueue())
        self.assertFalse(self.db.collection("mail").document("n1").exists)

    def test_unverified_email_never_queues_mail(self):
        self.user.email_verified = False
        with patch.dict(os.environ, {"METRONOTIFY_EMAIL_ENABLED": "1"}):
            self.assertFalse(self.enqueue())
        self.assertFalse(self.db.collection("mail").document("n1").exists)

    def test_verified_opted_in_user_has_one_extension_compatible_outbox_entry(self):
        with patch.dict(os.environ, {"METRONOTIFY_EMAIL_ENABLED": "1", "METRONOTIFY_MAIL_COLLECTION": "mail"}):
            self.assertTrue(self.enqueue())
        doc = self.db.collection("mail").document("n1")
        self.assertEqual(doc.value["to"], ["person@example.test"])
        self.assertEqual(doc.value["message"]["subject"], "MetroNotify: Status updated")
        self.assertIn("Report is assigned", doc.value["message"]["text"])
        self.assertEqual(len(doc.writes), 1)


if __name__ == "__main__":
    unittest.main()
