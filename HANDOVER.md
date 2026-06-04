# 📋 WhatsApp Automation Bot — Handover Document

> **Written by:** Ali Mehdi  
> **Internship period:** 2 June 2026 – 31 August 2026  
> **Handover to:** UnlockDiscounts 
> **Last updated:** June 2026

---

## 📌 What This Bot Does

An automated WhatsApp messaging bot that:
- Runs entirely on a cloud server (Oracle Free Tier VM) — no PC needs to stay on
- Reads a Google Sheet every minute for scheduled messages
- Sends WhatsApp messages to specified groups at the exact time defined in the sheet
- Requires zero manual intervention once set up

### Tech Stack

| Component | Tool | Purpose |
|-----------|------|---------|
| Workflow automation | n8n | Reads sheet, checks time, triggers messages |
| WhatsApp API | whatsapp-web.js + Express | Sends messages via linked WhatsApp account |
| Reverse proxy | Nginx | Exposes n8n publicly, keeps WhatsApp API private |
| Infrastructure | Oracle Cloud Free Tier VM | Runs everything 24/7 |
| Data source | Google Sheets (published CSV) | Schedule and message content |

---

## 🗂️ Project Structure

```
whatsapp-bot/
├── docker-compose.prod.yml   ← Production: run this on the server
├── docker-compose.yml        ← Local dev only
├── nginx.conf                ← Reverse proxy config for n8n
├── .env.example              ← Template for secrets (copy to .env)
├── .gitignore
├── HANDOVER.md               ← This file
└── whatsapp-api/
    ├── index.js              ← Express API with /send, /qr, /status, /groups
    ├── package.json
    └── Dockerfile
```

---

## 🔐 Credentials Inventory

> [!CAUTION]
> All credentials below are currently tied to the intern's personal accounts.
> Every item in this table must be replaced during migration.

| Credential | Current owner | Where it lives | Action needed |
|-----------|--------------|----------------|---------------|
| WhatsApp linked number | Intern's personal phone | Docker volume `whatsapp_data` on VM | Re-scan QR with company number |
| n8n login (username + password) | Intern | `.env` file on VM | Change in `.env`, restart containers |
| Google Sheet (CSV source) | Intern's Google account | n8n workflow HTTP Request node (Step 2) | Create new sheet in company account, update URL |
| Oracle Cloud VM | Intern's Oracle account | oracle.com | Provision new VM under company account |
| GitHub repo (optional) | Intern's GitHub | github.com | Fork/transfer to company GitHub org |

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Oracle Cloud VM                     │
│                                                      │
│  ┌──────────┐    internal network    ┌────────────┐  │
│  │   n8n    │ ──────────────────────►│ whatsapp-  │  │
│  │ :5678    │  http://whatsapp-api   │ api :3000  │  │
│  └──────────┘        :3000/send      └────────────┘  │
│       ▲                                    │         │
│  ┌──────────┐                     Docker volume      │
│  │  Nginx   │                   (WhatsApp session)   │
│  │ :5678    │                                        │
└──┴──────────┴────────────────────────────────────────┘
       ▲
  Internet
  (your browser)
```

**Ports open to the internet:**
- `5678` → n8n dashboard (behind username/password auth)

**Ports NOT open (internal only):**
- `3000` → WhatsApp API (accessible only inside the VM via SSH tunnel)

---

## 📊 Google Sheet Format

The sheet must be **published as CSV** (not just shared).

**How to publish:**
1. Open the sheet → File → Share → Publish to web
2. Select the sheet tab → select **CSV** format → Publish
3. Copy the URL — it ends in `/pub?output=csv`

**Required columns (exact names matter):**

| group_id | message | send_time | sent |
|----------|---------|-----------|------|
| 120363XXXXXX@g.us | Today's deal: 50% off! | 09:00 | FALSE |
| 120363YYYYYY@g.us | Flash sale ends tonight | 18:30 | FALSE |

- `group_id` — WhatsApp group ID in format `XXXXXXXXXXX@g.us` (get via `/groups` API endpoint)
- `send_time` — 24-hour `HH:MM` format, IST timezone
- `sent` — not currently used by the code but kept for manual tracking

---

## 🔄 n8n Workflow — How It Works

5 nodes in sequence:

```
[Schedule Trigger] → [HTTP Request] → [Code Node] → [IF Node] → [HTTP Request]
   every 1 min        GET sheet CSV    parse + match   group_id   POST /send
                                       IST time         not empty
```

**Code node logic (summary):**
- Gets current IST time as `HH:MM`
- Parses each row of the CSV
- Returns only rows where `send_time === currentTime`
- Returns `{skip: true}` if no match

**Critical URL in last HTTP Request node:**
```
http://whatsapp-api:3000/send
```
Body (JSON):
```json
{
  "number": "{{ $json.group_id }}",
  "message": "{{ $json.message }}"
}
```

---

## ✅ Migration Checklist (Step-by-Step)

### Step 1 — Export n8n Workflow (do this BEFORE touching anything)

1. Open n8n: `http://CURRENT_SERVER_IP:5678`
2. Log in with current credentials
3. Go to **Workflows** → find your workflow → click the **⋮ menu**
4. Click **Download** — saves a `.json` file
5. Keep this file safe — you'll need it in Step 6

---

### Step 2 — Create Company Google Sheet

1. Log into the **company Google account**
2. Create a new Google Sheet with columns: `group_id | message | send_time | sent`
3. Add your scheduled messages
4. Go to **File → Share → Publish to web**
5. Choose your sheet tab → format **CSV** → click **Publish**
6. Copy the CSV URL (looks like: `https://docs.google.com/spreadsheets/d/.../pub?output=csv`)

---

### Step 3 — Provision New Oracle VM (Company Account)

1. Sign up / log in at [cloud.oracle.com](https://cloud.oracle.com) with the **company account**
2. Go to **Compute → Instances → Create Instance**
3. Settings:
   - **Name:** `whatsapp-bot`
   - **Image:** Ubuntu 22.04
   - **Shape:** Ampere ARM → `VM.Standard.A1.Flex` → 1 OCPU, 6 GB RAM
   - **SSH Keys:** Generate new pair → download the private key
4. After VM starts, note the **Public IP**
5. Open firewall port `5678`:
   - Instance → Subnet → Security List → Add Ingress Rule
   - Source: `0.0.0.0/0`, Protocol: TCP, Port: `5678`

---

### Step 4 — Install Docker on New VM

SSH into the new VM:
```bash
ssh -i path/to/key.key ubuntu@NEW_SERVER_IP
```

Run:
```bash
sudo apt-get update && sudo apt-get upgrade -y
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu
sudo apt-get install -y docker-compose-plugin
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 5678 -j ACCEPT
sudo netfilter-persistent save
exit
```

SSH back in (required for docker group to take effect):
```bash
ssh -i path/to/key.key ubuntu@NEW_SERVER_IP
```

---

### Step 5 — Deploy the Code

```bash
# On the new server
git clone https://github.com/YOUR_ORG/whatsapp-bot.git whatsapp-bot
cd whatsapp-bot

# Create .env from template
cp .env.example .env
nano .env
```

Set these values in `.env`:
```
N8N_USER=admin
N8N_PASSWORD=CompanyStrongPassword123!
SERVER_IP=NEW_SERVER_IP
```

Start containers:
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Check all 3 are running:
```bash
docker ps
# Should show: whatsapp_api, n8n, nginx_proxy
```

---

### Step 6 — Re-import n8n Workflow

1. Open n8n on the new server: `http://NEW_SERVER_IP:5678`
2. Log in with the new credentials you set in `.env`
3. Go to **Workflows** → click **Add Workflow** (top right) → **Import from File**
4. Upload the `.json` file you exported in Step 1
5. Open the imported workflow:
   - **Node 2 (HTTP Request — GET sheet):** Replace the old CSV URL with the new company sheet URL from Step 2
   - **Node 5 (HTTP Request — POST /send):** Confirm the URL is `http://whatsapp-api:3000/send` (should already be correct)
6. Click **Save**
7. Toggle the workflow **Active** (top-right switch)

---

### Step 7 — Link Company WhatsApp Number

Open an SSH tunnel from your PC to access the private QR endpoint:
```bash
# Windows PowerShell
ssh -i path/to/key.key -L 3000:localhost:3000 ubuntu@NEW_SERVER_IP -N
```

Open in browser:
```
http://localhost:3000/qr
```

On the **company phone or WhatsApp Business:**
- Open WhatsApp → tap ⋮ → **Linked Devices** → **Link a Device**
- Scan the QR code shown in the browser

After scanning, the page shows **"✅ WhatsApp is already connected!"**

Verify via API:
```bash
# On the server (different SSH window)
curl http://localhost:3000/status
# Expected: {"connected":true,"qrPending":false}
```

---

### Step 8 — Get Group IDs for New Sheet

The group IDs from the old sheet are tied to the **WhatsApp number** — they stay the same as long as the company phone is a member of those groups.

To confirm / get new group IDs:
```bash
# Via SSH tunnel (while tunnel is open)
curl http://localhost:3000/groups
```

Returns:
```json
[
  { "id": "120363XXXXXX@g.us", "name": "Deals Group" },
  { "id": "120363YYYYYY@g.us", "name": "Flash Sales" }
]
```

Update the `group_id` column in the company Google Sheet with the correct IDs.

---

### Step 9 — Final Verification

```bash
# All containers running?
docker ps

# WhatsApp connected?
curl http://localhost:3000/status

# n8n reachable from internet?
curl -I http://NEW_SERVER_IP:5678
```

Trigger a test message manually in n8n:
- Open workflow → click **Execute Workflow** button
- Check if the test message arrives in the WhatsApp group

---

### Step 10 — Decommission Old VM

Once everything is verified on the new server:

```bash
# On OLD server — stop everything cleanly
docker compose -f docker-compose.prod.yml down
```

Then go to Oracle Cloud (old account) → Compute → Instances → Terminate the instance.

---

## 🛠️ Day-to-Day Operations Reference

### Adding new scheduled messages
1. Open the company Google Sheet
2. Add a new row with `group_id`, `message`, `send_time`, `sent=FALSE`
3. Nothing else needed — n8n picks it up within 1 minute

### Checking if the bot is alive
```bash
ssh -i key.key ubuntu@SERVER_IP "docker ps && curl -s localhost:3000/status"
```

### Re-scanning QR (if WhatsApp disconnects)
```bash
# Terminal 1 — SSH tunnel
ssh -i key.key -L 3000:localhost:3000 ubuntu@SERVER_IP -N

# Browser
http://localhost:3000/qr
```

### Viewing logs
```bash
ssh ubuntu@SERVER_IP
docker logs whatsapp_api --tail=50 -f   # WhatsApp API logs
docker logs n8n --tail=50 -f            # n8n logs
```

### Restarting everything
```bash
cd ~/whatsapp-bot
docker compose -f docker-compose.prod.yml restart
```

### Pulling code updates
```bash
cd ~/whatsapp-bot
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

---

## 🚨 Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Messages not sending | WhatsApp disconnected | Re-scan QR (see above) |
| n8n not accessible | Container down or port blocked | `docker ps`, check Oracle Security List |
| QR not appearing at `/qr` | Chromium crash (OOM) | `docker logs whatsapp_api` — increase VM RAM |
| Wrong time triggering | Timezone mismatch | Confirm `GENERIC_TIMEZONE=Asia/Kolkata` in `.env` |
| n8n workflow inactive | Toggle not switched on | n8n UI → workflow → toggle Active |
| Group ID not found | Phone not in group | Add company number to the WhatsApp group first |

---

## 📞 Contact

For questions about this setup during handover period, contact:

**[Ali Mehdi]**  
**Email:** [alimehdi432faiz@gmail.com]  
**Available until:** [31 August 2026]
