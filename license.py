"""Vérification de licence RONIN — clés signées Ed25519, liées à la machine.

L'exe n'embarque QUE la clé publique : il peut vérifier une clé mais pas en
fabriquer. Seul `keygen.py` (avec `keys/ronin_private.pem`, gardé privé) en crée.
"""
import base64
import hashlib
import json
import time

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

# Clé PUBLIQUE de ce build (générée le 2026-11-10). La privée reste hors de l'exe.
PUBLIC_KEY_B64 = "Ith/oLtEl0Fa2EuBUrHbN+iIyxb3SehD9Is38xg15GI="


def _b64url_decode(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def machine_id():
    """Empreinte stable du PC (MachineGuid + numéro de série du disque C:)."""
    parts = []
    try:
        import winreg
        k = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Cryptography")
        parts.append(winreg.QueryValueEx(k, "MachineGuid")[0])
    except Exception:
        pass
    try:
        import ctypes
        serial = ctypes.c_ulong()
        ctypes.windll.kernel32.GetVolumeInformationW(
            ctypes.c_wchar_p("C:\\"), None, 0, ctypes.byref(serial), None, None, None, 0)
        parts.append(str(serial.value))
    except Exception:
        pass
    raw = "|".join(parts) or "unknown-machine"
    h = hashlib.sha256(raw.encode()).hexdigest()[:16].upper()
    return "-".join(h[i:i + 4] for i in range(0, 16, 4))  # XXXX-XXXX-XXXX-XXXX


def verify(key, mid=None):
    """Renvoie les infos de la clé si elle est valide pour cette machine, sinon None."""
    if not key:
        return None
    mid = mid or machine_id()
    try:
        payload_b64, sig_b64 = key.strip().replace("\n", "").split(".")
        raw = _b64url_decode(payload_b64)
        sig = _b64url_decode(sig_b64)
        Ed25519PublicKey.from_public_bytes(base64.b64decode(PUBLIC_KEY_B64)).verify(sig, raw)
        data = json.loads(raw)
    except (ValueError, InvalidSignature, Exception):
        return None
    if data.get("m") not in (mid, "*"):      # liée à la machine ("*" = universelle)
        return None
    if data.get("e") and time.time() > data["e"]:  # expirée
        return None
    return data
