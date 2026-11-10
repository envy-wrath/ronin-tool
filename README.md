# 浪人 RONIN

Multi-outil Windows au style encre noire / accent rouge (repris de l'UI « Commands » du Pet Showcase).

| Onglet | Rôle |
|---|---|
| `/ COMMANDS` | Lanceur : tape `/DOWNLOADS`, `/STUDIO`, `/SEARCH mot`, `/SHUTDOWN 30`, `/ADD nom chemin`… |
| `/ SYSTEM` | CPU, RAM, disque, réseau, uptime, processus les plus lourds (fin de tâche) |
| `/ CLEAN` | Fichiers temporaires, corbeille, logs Roblox, crash dumps, cache DNS |
| `/ TOOLS` | Générateur de mots de passe, minuteur, notes auto-sauvées |
| `/ UPDATE` | Vérifie et installe la dernière release GitHub |

Raccourcis : `Ctrl + 1…5` change d'onglet, `Tab` complète une commande, `↑ ↓` choisit, `Entrée` exécute.

## Télécharger

Prendre `Ronin.exe` dans la dernière [release](../../releases/latest). L'appli se met ensuite à jour toute seule.

## Publier une nouvelle version

```bash
git tag v1.0.1
git push origin v1.0.1
```

La GitHub Action compile `Ronin.exe` et crée la release ; les copies installées la proposent au démarrage.

## Développer

```bash
pip install -r requirements.txt
python app.py          # lancer
build.bat              # compiler dist\Ronin.exe
```

Données utilisateur : `%APPDATA%\RoninTool\config.json`.
