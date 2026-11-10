"""Générateur de clés d'accès RONIN — À GARDER PRIVÉ (ne pas distribuer).

Il signe les clés avec `keys/ronin_private.pem`. Sans ce fichier, personne ne
peut fabriquer de clé valide.

Exemples :
    python keygen.py AB12-CD34-EF56-7890              # clé pour ce PC, sans limite
    python keygen.py AB12-CD34-EF56-7890 --name Max   # avec un libellé
    python keygen.py AB12-CD34-EF56-7890 --days 30    # expire dans 30 jours
    python keygen.py --any                            # clé universelle (tout PC)

Le "machine ID" s'affiche sur l'écran de verrouillage de l'appli : demande-le à
la personne, génère la clé, renvoie-la-lui.
"""
import argparse
import base64
import json
import time

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

KEY_PATH = "keys/ronin_private.pem"


def b64url(b):
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def main():
    ap = argparse.ArgumentParser(description="Génère une clé d'accès RONIN.")
    ap.add_argument("machine", nargs="?", help="Machine ID affiché par l'appli (XXXX-XXXX-XXXX-XXXX).")
    ap.add_argument("--any", action="store_true", help="Clé valable sur n'importe quel PC.")
    ap.add_argument("--name", default="", help="Libellé (nom de la personne).")
    ap.add_argument("--days", type=int, default=0, help="Validité en jours (0 = illimitée).")
    args = ap.parse_args()

    if not args.any and not args.machine:
        ap.error("donne un machine ID, ou --any pour une clé universelle.")

    try:
        priv = serialization.load_pem_private_key(open(KEY_PATH, "rb").read(), password=None)
    except FileNotFoundError:
        raise SystemExit(f"Clé privée introuvable : {KEY_PATH}\n"
                         "Lance ce script depuis le dossier du projet (celui qui contient 'keys').")
    if not isinstance(priv, Ed25519PrivateKey):
        raise SystemExit("Le fichier n'est pas une clé Ed25519.")

    payload = {"m": "*" if args.any else args.machine.strip().upper()}
    if args.name:
        payload["n"] = args.name
    if args.days:
        payload["e"] = int(time.time()) + args.days * 86400

    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    sig = priv.sign(raw)
    token = b64url(raw) + "." + b64url(sig)

    print("\n=== CLÉ D'ACCÈS RONIN ===")
    print("Machine :", payload["m"])
    if args.name:
        print("Nom     :", args.name)
    if args.days:
        print("Expire  : dans", args.days, "jours")
    print("\n" + token + "\n")


if __name__ == "__main__":
    main()
