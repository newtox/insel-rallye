# Insel Rallye

Ein 3D-Funracer im Stil der N64-Ära: Tiere in Karts, Hovercrafts und Doppeldeckern, Item-Ballons mit drei Stufen, Turbo-Felder, Sprungschanzen und fünf Inselstrecken. Läuft komplett im Browser.

- **Online** auf deinem eigenen Server: Raum erstellen, Code oder Einladungslink schicken, losfahren. Gäste brauchen keinen Account; wer sich registriert, landet in der Bestenliste.
- **Lokal** an einem PC: 1–4 Spieler im Splitscreen mit Tastatur (zwei Hälften) und Controllern, dazu bis zu 7 Computer-Fahrer.
- **Offline**: eine einzelne HTML-Datei, die ohne Server und ohne Internet läuft.
- **LAN**: Server im Heimnetz starten, alle anderen öffnen die IP im Browser.

## Inhalt

| | |
|---|---|
| Strecken | Palmenbucht, Vulkanpfad (Lava), Lagunenlauf (viel Wasser), Gletscherpass (Eis), Wolkentempel (Flugringe) |
| Fahrzeuge | Kart, Hovercraft (gleitet übers Wasser), Flugzeug (fliegt, Ringe geben Schub) |
| Figuren | Ruffy, Flinka, Pingo, Quaki, Bambu, Hoppla, Mauzi, Brummi – mit leicht unterschiedlichen Werten |
| Ballons | Rot = Rakete, Blau = Turbo, Grün = Falle, Gelb = Schild, Regenbogen = Magnet. Gleiche Farbe nochmal einsammeln = Stufe 2 und 3 |
| Sonstiges | Start-Turbo, Drift mit Mini-Turbo, Münzen (bis 10, machen schneller), Punktewertung über mehrere Rennen, Chat in der Lobby, Zuschauen bei laufenden Rennen |

## Schnellstart mit Docker

```bash
docker compose up -d --build
```

Danach läuft das Spiel auf `http://SERVER-IP:3000`. Die Datenbank (Accounts, Bestzeiten, Einladungscodes) liegt in `/docker_volumes/insel-rallye`.

In Portainer: Stack aus diesem Git-Repository anlegen (Build-Methode „Repository“), die `docker-compose.yml` wird direkt verwendet.

### Hinter Caddy (mit HTTPS)

```
rallye.deine-domain.de {
    reverse_proxy localhost:3000
}
```

WebSockets laufen bei Caddy ohne weitere Einstellungen mit. Bei nginx braucht `/ws` die üblichen `Upgrade`/`Connection`-Header. `TRUST_PROXY=true` sorgt dafür, dass die Login-Sperre nach zu vielen Fehlversuchen die echte IP sieht.

## Automatisches Deployment (GitHub Actions + Portainer)

Bei jedem Push auf `main` laufen Tests und Build, danach landet ein fertiges Image in der GitHub Container Registry als `ghcr.io/newtox/insel-rallye:latest`. Ein Tag wie `v1.0.0` erzeugt zusätzlich ein Release mit der Offline-Datei.

Einmalig einrichten:

1. Nach dem ersten erfolgreichen Workflow-Lauf unter GitHub → Packages → `insel-rallye` → Package settings die Sichtbarkeit auf **Public** stellen (oder in Portainer unter Registries die GHCR mit einem Token hinterlegen).
2. In Portainer einen Stack aus `deploy/portainer-stack.yml` anlegen. Der Port ist nur lokal (`127.0.0.1:3100`) offen, nach außen geht es über Caddy.
3. Den Block aus `deploy/Caddyfile` in `/etc/caddy/Caddyfile` übernehmen und `systemctl reload caddy` ausführen. Vorher einen DNS-Eintrag `kart` (A-Record auf die Server-IP) anlegen.
4. Optional für vollautomatische Updates: in Portainer beim Stack einen Webhook aktivieren, die URL als Repository-Secret `PORTAINER_WEBHOOK` eintragen. Ohne Webhook reicht in Portainer „Pull and redeploy“.

## Ohne Docker

Node.js 22.13 oder neuer:

```bash
npm install
npm run build
npm start
```

`npm run build` erzeugt `dist/web` (wird vom Server ausgeliefert) und `dist/insel-rallye-offline.html`.

## Offline und LAN

**Offline-Datei:** `dist/insel-rallye-offline.html` einfach per Doppelklick öffnen – Splitscreen und Computer-Gegner funktionieren ohne Netz. Die Datei lässt sich auch direkt vom Server laden (Einstellungen → „Offline-Version herunterladen“ oder `/offline.html`).

**LAN-Party:** `npm start` (oder Docker) auf einem Rechner im Heimnetz, alle anderen öffnen `http://IP-DES-RECHNERS:3000`. Wer die Offline-Datei benutzt, trägt die Adresse unter Einstellungen → Server-Adresse ein und kann dann ebenfalls online mitspielen.

## Accounts und Einladungen

Gäste können immer mit Raum-Code oder Einladungslink mitspielen, solange `REQUIRE_ACCOUNT` nicht gesetzt ist. Accounts sind optional und speichern Bestzeiten pro Strecke und Fahrzeug.

| Variable | Standard | Bedeutung |
|---|---|---|
| `PORT` | `3000` | Port des Servers |
| `REGISTRATION` | `open` | `open` = jeder darf sich registrieren, `invite` = nur mit Einladungscode, `closed` = keine neuen Accounts |
| `REQUIRE_ACCOUNT` | `false` | `true` = nur angemeldete Spieler dürfen online fahren |
| `TRUST_PROXY` | `false` | `true` hinter einem Reverse-Proxy |
| `SERVER_NAME` | `Insel Rallye` | Anzeigename |
| `MAX_ROOMS` | `50` | Maximale Anzahl gleichzeitiger Räume |
| `DATA_DIR` | `data` (Docker: `/data`) | Speicherort der SQLite-Datenbank |

Einladungscodes und Accounts verwalten:

```bash
# Docker
docker exec insel-rallye node server/admin.js invite 5     # Code für 5 Registrierungen
docker exec insel-rallye node server/admin.js invites
docker exec insel-rallye node server/admin.js users
docker exec insel-rallye node server/admin.js passwd Name neuesPasswort
docker exec insel-rallye node server/admin.js deluser Name

# ohne Docker
npm run admin -- invite 5
```

Passwörter werden mit scrypt gehasht, Sessions laufen nach 30 Tagen ab.

## Steuerung

| | Tastatur links | Tastatur rechts | Controller |
|---|---|---|---|
| Gas / Bremse | W / S | ↑ / ↓ | A / B |
| Lenken | A / D | ← / → | Stick, Steuerkreuz |
| Driften | Leertaste | Rechte Shift | R / RT |
| Item | E oder Q | Enter | X, L, LT |
| Pause | Esc | Esc | Start |

Im Flugzeug steuern Gas/Bremse die Höhe (umkehrbar in den Einstellungen); Gas gibt das Flugzeug selbst. Im lokalen Menü tritt man mit Leertaste, Enter oder A bei, wählt mit links/rechts die Figur, mit hoch/runter das Fahrzeug und meldet sich mit derselben Taste bereit.

## Aufbau

```
shared/   Spiellogik für Server und Browser: Streckengenerator, Fahrphysik, Bots, Items, Rennablauf
server/   Node-Server: statische Dateien, REST-API (Login, Bestenliste), WebSocket-Räume, SQLite
client/   Three.js-Client: Grafik, Menüs, HUD, Splitscreen, Sound (alles prozedural, keine Assets)
build.mjs Bündelt den Client und erzeugt die Offline-Datei
```

Der Server ist autoritativ für Items, Raketen, Fallen, Ballons, Münzen, Computer-Fahrer und die Platzierung. Jeder Client fährt sein eigenes Fahrzeug lokal (kein Eingabe-Lag) und schickt 30-mal pro Sekunde seine Position. Offline läuft dieselbe Rennlogik direkt im Browser.

## Kontakt

justin.lys26@gmail.com
