# KlassenCoach

KlassenCoach is een digibord-webapp voor het basisonderwijs met een groot stoplicht, realtime punten en beheer via een admin-panel. De app draait op Node.js + Express met EJS, gebruikt Socket.IO voor realtime updates en MariaDB voor dataopslag.

## Snel starten
1. Kopieer de voorbeeldconfig:
   ```bash
   cp .env.example .env
   ```
   Vul in `.env` o.a. het `ADMIN_PASSWORD`, `SESSION_SECRET` en databasegegevens indien gewenst.

2. Bouw en start via Docker Compose:
   ```bash
   docker compose up -d --build
   ```

3. Open de UI:
   - Digibord: `http://<HOST>:4001/board`
   - Admin: `http://<HOST>:4001/admin/login`

## Poorten
- Node/Express: `4001`
- MariaDB: containerpoort `3306`, gemapt naar host `4307` in `docker-compose.yml`.

## Stack
- Node.js + Express
- EJS templating
- Bootstrap 5 + eigen CSS
- Socket.IO
- MariaDB (mysql2/promise)
- express-session (sessietimeout 30 min)

## Belangrijkste features
- Groot stoplicht (groen/oranje/rood) met realtime updates.
- Meerdere klassen met eigen stoplicht, punten, presets en timers; kies bovenin welke klas je wilt tonen.
- Leerlingkaarten met puntenstand en avatars (URL of Avataaars via getAvataaars-config).
- Admin-panel met login, leerlingenbeheer (toevoegen, archiveren of verwijderen), puntentoekenning met presets, stoplichtregeling, timers en rapportages.
- CSV-export voor puntgebeurtenissen per periode.

## Database init
`db/init.sql` maakt alle tabellen aan en zet voorbeeldleerlingen, standaardpresets en een startwaarde voor het stoplicht. De compose bind-mount initialiseert dit automatisch bij de eerste start van MariaDB.

## Scripts
- `npm start` – start de server op poort 4001.

Veel plezier met KlassenCoach!
