# WhatsApp Daily Deal Bot

An automated system that sends scheduled deal messages to WhatsApp groups using **n8n**, **whatsapp-web.js**, and **Docker** — completely free and self-hosted.

---

## Architecture

```
Google Sheet (schedule data)
        ↓
n8n Workflow (runs every minute)
        ↓
Checks if current IST time matches send_time
        ↓
HTTP POST → WhatsApp API (whatsapp-web.js)
        ↓
Message delivered to WhatsApp Group
```

---

## Tech Stack

| Component | Technology |
|---|---|
| Workflow Automation | n8n (self-hosted) |
| WhatsApp Gateway | whatsapp-web.js + Express |
| Browser Automation | Puppeteer + Chromium |
| Schedule Data | Google Sheets (published as CSV) |
| Containerization | Docker + Docker Compose |

---

## Project Structure

```
whatsapp-bot/
├── docker-compose.yml          # Orchestrates all containers
└── whatsapp-api/
    ├── index.js                # Express API wrapping whatsapp-web.js
    ├── package.json            # Node.js dependencies
    └── Dockerfile              # Custom image with Chromium
```

---

## Prerequisites

- Windows 10/11 with WSL2 enabled
- Docker Desktop installed and running
- A WhatsApp account to use as the bot (secondary number recommended)
- A Google account for the schedule sheet

---

## Setup Instructions

### 1. Clone / Create Project Folder

```powershell
mkdir C:\whatsapp-bot
cd C:\whatsapp-bot
```

### 2. Create the WhatsApp API Service

Create `whatsapp-api/index.js`:

```javascript
const { Client, LocalAuth } = require("whatsapp-web.js");
const express = require("express");
const qrcode = require("qrcode-terminal");

const app = express();
app.use(express.json());

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    executablePath: "/usr/bin/chromium",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu"
    ]
  }
});

client.on("qr", (qr) => {
  console.log("Scan this QR code:");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => console.log("WhatsApp connected!"));

app.post("/send", async (req, res) => {
  try {
    const { number, message } = req.body;
    console.log("Sending to:", number, "Message:", message);
    const result = await client.sendMessage(number, message);
    console.log("Sent successfully:", result.id);
    res.json({ success: true });
  } catch (err) {
    console.error("Send error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/groups", async (req, res) => {
  try {
    const chats = await client.getChats();
    const groups = chats
      .filter(c => c.isGroup)
      .map(g => ({ id: g.id._serialized, name: g.name }));
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

client.initialize();
app.listen(3000, () => console.log("API running on port 3000"));
```

Create `whatsapp-api/package.json`:

```json
{
  "name": "whatsapp-api",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "whatsapp-web.js": "^1.23.0",
    "express": "^4.18.0",
    "qrcode-terminal": "^0.12.0"
  }
}
```

Create `whatsapp-api/Dockerfile`:

```dockerfile
FROM node:18
RUN apt-get update && apt-get install -y chromium --no-install-recommends
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
WORKDIR /app
COPY package.json .
RUN npm install
COPY index.js .
CMD ["sh", "-c", "find /app/.wwebjs_auth -name 'Singleton*' -delete 2>/dev/null; find /root/.wwebjs_auth -name 'Singleton*' -delete 2>/dev/null; node index.js"]
```

### 3. Create docker-compose.yml

```yaml
services:
  whatsapp-api:
    build: ./whatsapp-api
    container_name: whatsapp_api
    ports:
      - "3000:3000"
    volumes:
      - whatsapp_data:/app/.wwebjs_auth
    restart: unless-stopped

  n8n:
    image: n8nio/n8n
    container_name: n8n
    ports:
      - "5678:5678"
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=admin
      - N8N_BASIC_AUTH_PASSWORD=admin123
      - GENERIC_TIMEZONE=Asia/Kolkata
    volumes:
      - n8n_data:/home/node/.n8n
    restart: unless-stopped

volumes:
  whatsapp_data:
  n8n_data:
```

### 4. Start the Services

```powershell
cd C:\whatsapp-bot
docker compose up --build -d
```

### 5. Connect WhatsApp

Watch the logs for the QR code:

```powershell
docker logs -f whatsapp_api
```

Scan the QR code using WhatsApp on your phone:
- Open WhatsApp → 3 dots menu → **Linked Devices** → **Link a Device**
- Scan the QR code shown in the terminal

Wait for `WhatsApp connected!` to appear in the logs.

### 6. Get Your WhatsApp Group IDs

```powershell
curl.exe http://localhost:3000/groups
```

Returns a list like:
```json
[
  {"id": "120363XXXXXXXXXX@g.us", "name": "My Deal Group"}
]
```

Copy the `id` of the group you want to send messages to.

### 7. Set Up Google Sheet

Create a Google Sheet with these exact column headers in Row 1:

| A | B | C | D |
|---|---|---|---|
| group_id | message | send_time | sent |

Add your scheduled messages:

| group_id | message | send_time | sent |
|---|---|---|---|
| 120363XXXXXX@g.us | Today's deal: 50% off! | 09:00 | FALSE |
| 120363XXXXXX@g.us | Evening deal: Buy 2 get 1 | 18:00 | FALSE |

- `group_id` — WhatsApp group ID ending in `@g.us`
- `send_time` — 24hr IST format (HH:MM)
- `sent` — always `FALSE` (reset manually for recurring messages)

**Publish as CSV:**
1. File → Share → **Publish to web**
2. Select **Sheet1** and **CSV**
3. Click **Publish** and copy the URL

### 8. Build the n8n Workflow

Open n8n at `http://localhost:5678` (login: `admin` / `admin123`)

Create a new workflow with these 5 nodes:

**Node 1 — Schedule Trigger**
- Every: 1 minute

**Node 2 — HTTP Request (fetch sheet)**
- Method: `GET`
- URL: your published Google Sheet CSV URL
- Response Format: `Text`

**Node 3 — Code (parse + time check)**
```javascript
const csv = $input.first().json.data;
const lines = csv.trim().split('\n');

const now = new Date();
const istTime = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
}).format(now);

const results = [];
for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split(',');
  const group_id = cols[0]?.trim();
  const message = cols[1]?.trim();
  const send_time = cols[2]?.trim();
  const sent = cols[3]?.trim();

  if (send_time === istTime && sent === 'FALSE') {
    results.push({ json: { group_id, message, send_time } });
  }
}

return results.length > 0 ? results : [{ json: { skip: true } }];
```

**Node 4 — IF (skip check)**
- Value 1: `{{ $json.group_id }}`
- Operation: `is not empty`

**Node 5 — HTTP Request (send WhatsApp)**
- Method: `POST`
- URL: `http://host.docker.internal:3000/send`
- Body Content Type: `JSON`
- JSON Body:
```json
{
  "number": "{{ $json.group_id }}",
  "message": "{{ $json.message }}"
}
```

Connect nodes: `Schedule Trigger → HTTP Request → Code → IF (true branch) → HTTP Request`

Click **Save** and toggle **Active** to turn the workflow ON.

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/send` | Send a WhatsApp message |
| GET | `/groups` | List all WhatsApp groups |

### Send Message Example

```powershell
'{"number": "917081158983@c.us", "message": "Hello!"}' | Out-File -FilePath body.json -Encoding utf8
curl.exe -X POST "http://localhost:3000/send" -H "Content-Type: application/json" -d "@body.json"
```

---

## Troubleshooting

### Chromium Singleton Lock Error
Happens when the container restarts unexpectedly.
```powershell
docker compose down
docker run --rm -v whatsapp-bot_whatsapp_data:/data alpine sh -c "find /data -name 'Singleton*' -delete && echo cleaned"
docker compose up -d
```

### WhatsApp Session Expired (QR appears again)
Normal after long inactivity. Just scan the QR code again — session auto-saves after scanning.

### n8n Can't Reach WhatsApp API
Use `http://host.docker.internal:3000` instead of `localhost:3000` inside n8n — this is how Docker containers reach the host machine on Windows.

### Google Sheet Returns HTML Instead of CSV
Make sure you used **File → Share → Publish to web** and selected CSV format. The regular share link won't work.

### Check Current IST Time
```powershell
powershell -command "& {[System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId((Get-Date), 'India Standard Time')}"
```

---

## Keeping It Running

Docker containers are set to `restart: unless-stopped`, so they auto-start whenever Docker Desktop launches. Enable Docker Desktop to start with Windows:

- Docker Desktop → Settings → General → **Start Docker Desktop when you log in** ✓

---

## Cost

**100% Free** — everything runs locally on your PC with no external paid services.
