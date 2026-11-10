"""RONIN — multi-outil Windows, style encre noire / accent rouge."""
import ctypes
import json
import os
import secrets
import string
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser

import psutil
import webview

import license as lic
from version import REPO, VERSION

NO_WINDOW = 0x08000000
DETACHED = 0x00000008
APP_DIR = os.path.join(os.environ.get("APPDATA", os.path.expanduser("~")), "RoninTool")
CONFIG_PATH = os.path.join(APP_DIR, "config.json")
HOME = os.path.expanduser("~")
LOCAL = os.environ.get("LOCALAPPDATA", HOME)


def resource(*parts):
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, *parts)


def load_config():
    try:
        with open(CONFIG_PATH, encoding="utf-8") as f:
            cfg = json.load(f)
    except Exception:
        cfg = {}
    cfg.setdefault("custom", {})
    cfg.setdefault("notes", "")
    cfg.setdefault("auto_update", True)
    cfg.setdefault("license", "")
    return cfg


def save_config(cfg):
    os.makedirs(APP_DIR, exist_ok=True)
    tmp = CONFIG_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    os.replace(tmp, CONFIG_PATH)


def folder_size(path):
    total = count = 0
    for root, _dirs, files in os.walk(path):
        for name in files:
            try:
                total += os.path.getsize(os.path.join(root, name))
                count += 1
            except OSError:
                pass
    return total, count


def wipe_folder(path):
    """Supprime le contenu d'un dossier ; ignore les fichiers verrouillés."""
    freed = removed = skipped = 0
    if not os.path.isdir(path):
        return {"freed": 0, "removed": 0, "skipped": 0}
    for root, dirs, files in os.walk(path, topdown=False):
        for name in files:
            p = os.path.join(root, name)
            try:
                size = os.path.getsize(p)
                os.remove(p)
                freed += size
                removed += 1
            except OSError:
                skipped += 1
        for name in dirs:
            try:
                os.rmdir(os.path.join(root, name))
            except OSError:
                pass
    return {"freed": freed, "removed": removed, "skipped": skipped}


class SHQUERYRBINFO(ctypes.Structure):
    _fields_ = [("cbSize", ctypes.c_ulong), ("i64Size", ctypes.c_longlong), ("i64NumItems", ctypes.c_longlong)]


def recycle_info():
    info = SHQUERYRBINFO()
    info.cbSize = ctypes.sizeof(info)
    ctypes.windll.shell32.SHQueryRecycleBinW(None, ctypes.byref(info))
    return info.i64Size, info.i64NumItems


def parse_version(v):
    out = []
    for part in v.strip().lstrip("vV").split("."):
        digits = "".join(c for c in part if c.isdigit())
        out.append(int(digits or 0))
    return tuple(out + [0] * (3 - len(out)))


# name -> (arguments, description, cible)
BUILTIN = {
    "DOWNLOADS": ([], "OPENS DOWNLOADS", os.path.join(HOME, "Downloads")),
    "DOCUMENTS": ([], "OPENS DOCUMENTS", os.path.join(HOME, "Documents")),
    "DESKTOP": ([], "OPENS DESKTOP", os.path.join(HOME, "Desktop")),
    "APPDATA": ([], "OPENS APPDATA", os.path.dirname(LOCAL)),
    "TEMP": ([], "OPENS TEMP FOLDER", tempfile.gettempdir()),
    "CMD": ([], "OPENS A TERMINAL", "cmd"),
    "POWERSHELL": ([], "OPENS POWERSHELL", "powershell"),
    "TASKMGR": ([], "TASK MANAGER", "taskmgr"),
    "CONTROL": ([], "CONTROL PANEL", "control"),
    "SETTINGS": ([], "WINDOWS SETTINGS", "ms-settings:"),
    "CALC": ([], "CALCULATOR", "calc"),
    "NOTEPAD": ([], "NOTEPAD", "notepad"),
    "SNIP": ([], "SCREEN CAPTURE", "ms-screenclip:"),
    "ROBLOX": ([], "OPENS ROBLOX", "https://www.roblox.com/home"),
    "STUDIO": ([], "LAUNCHES ROBLOX STUDIO", "roblox-studio:"),
    "YOUTUBE": ([], "OPENS YOUTUBE", "https://www.youtube.com"),
    "GITHUB": ([], "OPENS GITHUB", "https://github.com"),
    "SEARCH": (["QUERY"], "SEARCHES THE WEB", None),
    "SHUTDOWN": (["MINUTES"], "SCHEDULES SHUTDOWN", None),
    "RESTART": (["MINUTES"], "SCHEDULES RESTART", None),
    "ABORT": ([], "CANCELS SHUTDOWN", None),
    "LOCK": ([], "LOCKS THE PC", None),
    "ADD": (["NAME", "PATH / URL"], "ADDS A COMMAND", None),
    "DEL": (["NAME"], "REMOVES A COMMAND", None),
}


class Api:
    def __init__(self):
        self._cfg = load_config()
        self._window = None
        self._net = None
        self._update = None
        self._progress = {"state": "idle", "pct": 0, "msg": ""}
        self._lic = lic.verify(self._cfg.get("license"))  # None si pas déverrouillé

    # ---------- licence / verrou ----------
    def license_status(self):
        return {"licensed": self._lic is not None,
                "machine": lic.machine_id(),
                "name": (self._lic or {}).get("n", ""),
                "exp": (self._lic or {}).get("e", 0)}

    def activate(self, key):
        data = lic.verify(key)
        if data is None:
            return {"ok": False, "msg": "INVALID KEY FOR THIS MACHINE"}
        self._lic = data
        self._cfg["license"] = key.strip()
        save_config(self._cfg)
        return {"ok": True, "msg": "ACCESS GRANTED", "name": data.get("n", "")}

    def _guard(self):
        return self._lic is not None

    # ---------- fenêtre ----------
    def info(self):
        return {"version": VERSION, "repo": REPO, "auto_update": self._cfg["auto_update"],
                "frozen": bool(getattr(sys, "frozen", False))}

    def minimize(self):
        self._window.minimize()

    def close(self):
        self._window.destroy()

    # ---------- commandes ----------
    def commands(self):
        out = [{"name": n, "args": a, "desc": d, "custom": False} for n, (a, d, _t) in BUILTIN.items()]
        for name, target in self._cfg["custom"].items():
            out.append({"name": name, "args": [], "desc": target.upper()[:38], "custom": True})
        return out

    def run(self, name, args):
        if not self._guard():
            return {"ok": False, "msg": "LOCKED"}
        name = name.upper().strip()
        args = [a for a in (args or []) if a.strip()]
        try:
            if name in self._cfg["custom"]:
                os.startfile(self._cfg["custom"][name])
                return {"ok": True, "msg": f"{name} LAUNCHED"}
            if name not in BUILTIN:
                return {"ok": False, "msg": "UNKNOWN COMMAND"}
            if name == "SEARCH":
                if not args:
                    return {"ok": False, "msg": "QUERY REQUIRED"}
                webbrowser.open("https://www.google.com/search?q=" + urllib.parse.quote(" ".join(args)))
                return {"ok": True, "msg": "SEARCHING"}
            if name in ("SHUTDOWN", "RESTART"):
                mins = float(args[0]) if args else 0
                flag = "/s" if name == "SHUTDOWN" else "/r"
                subprocess.run(["shutdown", flag, "/t", str(int(mins * 60))], creationflags=NO_WINDOW)
                return {"ok": True, "msg": f"{name} IN {mins:g} MIN — /ABORT TO CANCEL"}
            if name == "ABORT":
                subprocess.run(["shutdown", "/a"], creationflags=NO_WINDOW)
                return {"ok": True, "msg": "SHUTDOWN CANCELLED"}
            if name == "LOCK":
                ctypes.windll.user32.LockWorkStation()
                return {"ok": True, "msg": "LOCKED"}
            if name == "ADD":
                if len(args) < 2:
                    return {"ok": False, "msg": "USAGE : /ADD NAME PATH"}
                key = args[0].upper()
                if key in BUILTIN:
                    return {"ok": False, "msg": "NAME ALREADY USED"}
                self._cfg["custom"][key] = " ".join(args[1:]).strip('"')
                save_config(self._cfg)
                return {"ok": True, "msg": f"/{key} ADDED", "refresh": True}
            if name == "DEL":
                key = (args[0] if args else "").upper()
                if self._cfg["custom"].pop(key, None) is None:
                    return {"ok": False, "msg": "NO SUCH CUSTOM COMMAND"}
                save_config(self._cfg)
                return {"ok": True, "msg": f"/{key} REMOVED", "refresh": True}
            target = BUILTIN[name][2]
            if target in ("cmd", "powershell"):
                subprocess.Popen(["cmd", "/c", "start", "", target], cwd=HOME, creationflags=NO_WINDOW)
            else:
                os.startfile(target)
            return {"ok": True, "msg": f"{name} LAUNCHED"}
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "msg": str(e).upper()[:80]}

    # ---------- système ----------
    def stats(self):
        vm = psutil.virtual_memory()
        disk = psutil.disk_usage(os.environ.get("SystemDrive", "C:") + "\\")
        net = psutil.net_io_counters()
        now = time.time()
        down = up = 0.0
        if self._net:
            t0, r0, s0 = self._net
            dt = max(now - t0, 0.001)
            down, up = (net.bytes_recv - r0) / dt, (net.bytes_sent - s0) / dt
        self._net = (now, net.bytes_recv, net.bytes_sent)
        bat = psutil.sensors_battery()
        return {
            "cpu": psutil.cpu_percent(interval=None),
            "cores": psutil.cpu_count(),
            "ram": vm.percent, "ram_used": vm.used, "ram_total": vm.total,
            "disk": disk.percent, "disk_used": disk.used, "disk_total": disk.total,
            "down": down, "up": up,
            "uptime": now - psutil.boot_time(),
            "battery": None if bat is None else {"pct": bat.percent, "plugged": bat.power_plugged},
        }

    def processes(self):
        groups = {}
        for p in psutil.process_iter(["pid", "name", "memory_info"]):
            try:
                name = p.info["name"] or "?"
                mem = p.info["memory_info"].rss if p.info["memory_info"] else 0
            except (psutil.Error, AttributeError):
                continue
            g = groups.setdefault(name, {"name": name, "mem": 0, "pids": []})
            g["mem"] += mem
            g["pids"].append(p.info["pid"])
        top = sorted(groups.values(), key=lambda g: g["mem"], reverse=True)[:9]
        return [{"name": g["name"], "mem": g["mem"], "count": len(g["pids"])} for g in top]

    def kill(self, name):
        if not self._guard():
            return {"ok": False, "msg": "LOCKED"}
        if name.lower() in ("ronin.exe", "python.exe", "explorer.exe", "csrss.exe", "winlogon.exe", "system"):
            return {"ok": False, "msg": "PROTECTED PROCESS"}
        n = 0
        for p in psutil.process_iter(["name"]):
            if p.info["name"] == name:
                try:
                    p.terminate()
                    n += 1
                except psutil.Error:
                    pass
        return {"ok": n > 0, "msg": f"{n} PROCESS ENDED" if n else "ACCESS DENIED"}

    # ---------- nettoyage ----------
    def _targets(self):
        return {
            "TEMP": tempfile.gettempdir(),
            "ROBLOX": os.path.join(LOCAL, "Roblox", "logs"),
            "CRASH": os.path.join(LOCAL, "CrashDumps"),
        }

    def scan(self):
        out = {}
        for key, path in self._targets().items():
            size, count = folder_size(path) if os.path.isdir(path) else (0, 0)
            out[key] = {"size": size, "count": count}
        size, items = recycle_info()
        out["BIN"] = {"size": size, "count": items}
        return out

    def clean(self, key):
        if not self._guard():
            return {"ok": False, "msg": "LOCKED"}
        try:
            if key == "BIN":
                size, _ = recycle_info()
                ctypes.windll.shell32.SHEmptyRecycleBinW(None, None, 0x7)
                return {"ok": True, "freed": size, "msg": "BIN EMPTIED"}
            if key == "DNS":
                subprocess.run(["ipconfig", "/flushdns"], creationflags=NO_WINDOW, capture_output=True)
                return {"ok": True, "freed": 0, "msg": "DNS CACHE FLUSHED"}
            path = self._targets().get(key)
            if not path:
                return {"ok": False, "msg": "UNKNOWN TARGET"}
            r = wipe_folder(path)
            msg = f"{r['removed']} FILES REMOVED"
            if r["skipped"]:
                msg += f" · {r['skipped']} IN USE"
            return {"ok": True, "freed": r["freed"], "msg": msg}
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "msg": str(e).upper()[:80]}

    # ---------- outils ----------
    def password(self, length=20, symbols=True):
        alphabet = string.ascii_letters + string.digits + ("!@#$%&*?-_=+" if symbols else "")
        return "".join(secrets.choice(alphabet) for _ in range(max(6, min(int(length), 128))))

    def copy(self, text):
        subprocess.run(["clip"], input=(text or "").encode("utf-16-le"), creationflags=NO_WINDOW)
        return True

    def open_url(self, url):
        if url.startswith("https://"):
            webbrowser.open(url)
        return True

    def notes(self):
        return self._cfg["notes"]

    def save_notes(self, text):
        self._cfg["notes"] = text
        save_config(self._cfg)
        return True

    def set_auto_update(self, value):
        self._cfg["auto_update"] = bool(value)
        save_config(self._cfg)
        return True

    # ---------- mise à jour GitHub ----------
    def check_update(self):
        if REPO.startswith("OWNER/"):
            return {"ok": False, "msg": "NO REPOSITORY SET"}
        try:
            req = urllib.request.Request(
                f"https://api.github.com/repos/{REPO}/releases/latest",
                headers={"User-Agent": "RoninTool", "Accept": "application/vnd.github+json"})
            with urllib.request.urlopen(req, timeout=10) as r:
                data = json.load(r)
        except urllib.error.HTTPError as e:
            return {"ok": False, "msg": "NO RELEASE YET" if e.code == 404 else f"GITHUB ERROR {e.code}"}
        except Exception:  # noqa: BLE001
            return {"ok": False, "msg": "OFFLINE"}
        tag = data.get("tag_name", "0")
        asset = next((a for a in data.get("assets", []) if a["name"].lower().endswith(".exe")), None)
        newer = parse_version(tag) > parse_version(VERSION)
        self._update = asset if newer else None
        return {"ok": True, "latest": tag.lstrip("vV"), "newer": newer and asset is not None,
                "notes": (data.get("body") or "")[:1200], "date": (data.get("published_at") or "")[:10]}

    def install_update(self):
        if not getattr(sys, "frozen", False):
            return {"ok": False, "msg": "DEV MODE — BUILD THE EXE FIRST"}
        if not self._update:
            return {"ok": False, "msg": "CHECK FIRST"}
        threading.Thread(target=self._download, daemon=True).start()
        return {"ok": True}

    def update_progress(self):
        return self._progress

    def _download(self):
        exe = sys.executable
        new = exe + ".new"
        try:
            self._progress = {"state": "download", "pct": 0, "msg": "DOWNLOADING"}
            req = urllib.request.Request(self._update["browser_download_url"], headers={"User-Agent": "RoninTool"})
            with urllib.request.urlopen(req, timeout=30) as r, open(new, "wb") as f:
                total = int(r.headers.get("Content-Length") or self._update.get("size") or 0)
                done = 0
                while chunk := r.read(65536):
                    f.write(chunk)
                    done += len(chunk)
                    if total:
                        self._progress["pct"] = round(done * 100 / total)
            if os.path.getsize(new) < 1_000_000:
                raise RuntimeError("DOWNLOAD TOO SMALL")
            bat = os.path.join(tempfile.gettempdir(), "ronin_update.bat")
            with open(bat, "w", encoding="mbcs") as f:
                f.write(
                    "@echo off\r\n"
                    "set n=0\r\n"
                    ":retry\r\n"
                    "timeout /t 1 /nobreak >nul\r\n"
                    f'move /y "{new}" "{exe}" >nul 2>&1 && goto done\r\n'
                    "set /a n+=1\r\n"
                    "if %n% lss 40 goto retry\r\n"
                    ":done\r\n"
                    f'start "" "{exe}"\r\n'
                    'del "%~f0"\r\n')
            self._progress = {"state": "restart", "pct": 100, "msg": "RESTARTING"}
            subprocess.Popen(["cmd", "/c", bat], creationflags=NO_WINDOW | DETACHED, close_fds=True)
            time.sleep(0.8)
            self._window.destroy()
        except Exception as e:  # noqa: BLE001
            self._progress = {"state": "error", "pct": 0, "msg": str(e).upper()[:80]}
            try:
                os.remove(new)
            except OSError:
                pass


def main():
    api = Api()
    psutil.cpu_percent(interval=None)  # amorce la mesure CPU
    window = webview.create_window(
        "RONIN", resource("ui", "index.html"), js_api=api,
        width=1120, height=720, min_size=(940, 620),
        frameless=True, easy_drag=False, background_color="#060506")
    api._window = window
    webview.start(gui="edgechromium", debug="--debug" in sys.argv)


if __name__ == "__main__":
    main()
