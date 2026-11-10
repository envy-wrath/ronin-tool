"""Relais d'activation chiffré (ntfy.sh, sans inscription).

RONIN **chiffre** l'activation avec la clé publique de l'admin puis la poste sur
un topic au nom aléatoire. Seul RONIN KEYGEN (clé privée) peut la déchiffrer :
le relais ne voit que du binaire opaque.
"""
import base64
import json
import os
import urllib.request

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey

# Clé publique de l'admin (chiffrement) + topic partagé (= secret).
ADMIN_PUB_B64 = "EN8+1wnhkU83KIlmK1sX3fQxgNxUI4gmUikatliH2lw="
TOPIC = "ronin-c657488dabafc09a7f37b67d"
BASE = "https://ntfy.sh"


def _derive(shared, eph_pub, recipient_pub):
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=None,
                info=b"ronin-relay|" + eph_pub + recipient_pub).derive(shared)


def seal(plaintext):
    """Chiffre pour l'admin -> texte base64 (eph_pub || ciphertext)."""
    recipient = X25519PublicKey.from_public_bytes(base64.b64decode(ADMIN_PUB_B64))
    eph = X25519PrivateKey.generate()
    eph_pub = eph.public_key().public_bytes_raw()
    key = _derive(eph.exchange(recipient), eph_pub, base64.b64decode(ADMIN_PUB_B64))
    ct = AESGCM(key).encrypt(b"\x00" * 12, plaintext, None)
    return base64.b64encode(eph_pub + ct).decode()


def unseal(blob_b64, priv):
    raw = base64.b64decode(blob_b64)
    eph_pub, ct = raw[:32], raw[32:]
    recipient_pub = priv.public_key().public_bytes_raw()
    key = _derive(priv.exchange(X25519PublicKey.from_public_bytes(eph_pub)), eph_pub, recipient_pub)
    return AESGCM(key).decrypt(b"\x00" * 12, ct, None)


def post(text):
    try:
        req = urllib.request.Request(f"{BASE}/{TOPIC}", data=text.encode(),
                                     headers={"User-Agent": "RoninTool", "Title": "activation"})
        urllib.request.urlopen(req, timeout=8).read()
        return True
    except Exception:
        return False


def fetch():
    """Toutes les activations encore en cache sur le relais (liste de b64)."""
    out = []
    try:
        req = urllib.request.Request(f"{BASE}/{TOPIC}/json?poll=1&since=all",
                                     headers={"User-Agent": "RoninKeygen"})
        data = urllib.request.urlopen(req, timeout=8).read().decode()
        for line in data.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
                if msg.get("event") == "message" and msg.get("message"):
                    out.append(msg["message"])
            except Exception:
                continue
    except Exception:
        pass
    return out
