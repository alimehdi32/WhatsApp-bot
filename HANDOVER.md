# 📋 WhatsApp Automation Bot — Handover Document

> **Written by:** Ali Mehdi  
> **Internship period:** 2 June 2026 – 31 August 2026  
> **Handover to:** UnlockDiscounts  
> **Last updated:** June 2026

---

## 📌 What This Bot Does

An automated WhatsApp messaging bot that:
- Runs entirely on a cloud server (AWS EC2) — no PC needs to stay on
- Reads a Google Sheet every minute for scheduled messages
- Sends WhatsApp messages to specified groups at the exact time defined in the sheet
- Requires zero manual intervention once set up

### Tech Stack

| Component | Tool | Purpose |
|-----------|------|---------|
| Workflow automation | n8n | Reads sheet, checks time, triggers messages |
| WhatsApp API | whatsapp-web.js + Express | Sends messages via linked WhatsApp account |
| Reverse proxy | Nginx | Exposes n8n publicly, keeps WhatsApp API private |
| Infrastructure | AWS EC2 (t2.micro, Free Tier) | Runs everything 24/7 |
| Data source | Google Sheets (published CSV) | Schedule and message content |

---

## 🗂️ Project Structure

```
whatsapp-bot/
├── docker-compose.prod.yml   ← Production: run this on the server
├── docker-compose.yml        ← Local dev only
├── nginx.conf                ← Reverse proxy config for n8n (listens on port 80 & 5678)
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
| Google Sheet (CSV source) | Intern's Google account | n8n workflow HTTP Request node (Node 2) | Create new sheet in company account, update URL |
| AWS EC2 instance | Intern's AWS account | aws.amazon.com | Provision new instance under company account |
| EC2 SSH key pair | Intern | `whatsapp-bot-key.pem` (downloaded at creation) | Generate new key pair on new instance |
| GitHub repo (optional) | Intern's GitHub | github.com | Fork/transfer to company GitHub org |

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────┐
│                  AWS EC2 Instance                    │
│                                                      │
│  ┌──────────┐    internal network    ┌────────────┐  │
│  │   n8n    │ ──────────────────────►│ whatsapp-  │  │
│  │ :5678    │  http://whatsapp-api   │ api :3000  │  │
│  └──────────┘        :3000/send      └────────────┘  │
│       ▲                                    │         │
│  ┌──────────┐                     Docker volume      │
│  │  Nginx   │                   (WhatsApp session)   │
│  │ :80/:5678│                                        │
└──┴──────────┴────────────────────────────────────────┘
       ▲
  Internet
  (your browser)
```

**Ports open to the internet (AWS Security Group):**
- `80` → n8n dashboard via HTTP (recommended — avoids WebSocket origin issues)
- `5678` → n8n dashboard (alternative access)

**Ports NOT open (internal only):**
- `3000` → WhatsApp API (accessible only inside the VM via SSH tunnel)

> [!IMPORTANT]
> Always access n8n at **`http://SERVER_IP`** (port 80, no port number in URL).
> Accessing via `:5678` causes a WebSocket origin mismatch that shows "Connection lost" in the UI.

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
- Returns `{skip: true}` if no match (this is normal — means nothing to send right now)

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

1. Open n8n: `http://CURRENT_SERVER_IP`
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

### Step 3 — Provision New AWS EC2 Instance

1. Sign in at [aws.amazon.com](https://aws.amazon.com) with the **company account**
2. Go to **EC2 → Instances → Launch Instance**
3. Settings:
   - **Name:** `whatsapp-bot`
   - **AMI:** Ubuntu Server 22.04 LTS (Free Tier eligible)
   - **Instance type:** `t2.micro` (Free Tier)
   - **Key pair:** Create new → download `.pem` file → keep it safe
   - **Storage:** Set root volume to **20 GB**, type `gp3` (free tier allows up to 30 GB)
4. **Security Group — Inbound Rules** (add these):
   | Type | Port | Source |
   |------|------|--------|
   | SSH | 22 | My IP (or Anywhere for flexibility) |
   | Custom TCP | 5678 | Anywhere-IPv4 |
   | HTTP | 80 | Anywhere-IPv4 |
5. Launch the instance and note the **Public IP**

---

### Step 4 — Install Docker on New Instance

SSH into the new instance:
```bash
# Windows PowerShell
ssh -i "C:\path\to\whatsapp-bot-key.pem" ubuntu@NEW_SERVER_IP
```

Run:
```bash
sudo apt-get update && sudo apt-get upgrade -y
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker ubuntu
sudo apt-get install -y docker-compose-plugin

# Enable Docker to start automatically on reboot
sudo systemctl enable docker

exit
```

SSH back in (required for docker group to take effect):
```bash
ssh -i "C:\path\to\whatsapp-bot-key.pem" ubuntu@NEW_SERVER_IP
```

---

### Step 5 — Deploy the Code

```bash
# On the new server
git clone https://github.com/alimehdi32/WhatsApp-bot.git WhatsApp-bot
cd WhatsApp-bot

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

> [!NOTE]
> After a server reboot, containers restart automatically because of `restart: unless-stopped`
> and Docker being enabled with `systemctl enable docker`.

---

### Step 6 — Re-import n8n Workflow

1. Open n8n: **`http://NEW_SERVER_IP`** (use port 80, not :5678)
2. Complete the owner account setup (first time only) — enter your email and password
3. Go to **Workflows** → click **Add Workflow** (top right) → **Import from File**
4. Upload the `.json` file you exported in Step 1
5. Open the imported workflow:
   - **Node 2 (HTTP Request — GET sheet):** Replace the old CSV URL with the new company sheet URL from Step 2
   - **Node 5 (HTTP Request — POST /send):** Confirm the URL is `http://whatsapp-api:3000/send` (should already be correct)
6. Click **Save**
7. Toggle the workflow **Active** (top-right switch in editor, or from the Workflows list page)

> [!TIP]
> If the **Active** toggle is not visible (due to "Connection lost" UI issue), activate via API:
> 1. Go to `http://NEW_SERVER_IP/settings/api` → Create an API key
> 2. Run on the server:
> ```bash
> curl -X POST "http://localhost:5678/api/v1/workflows/WORKFLOW_ID/activate" -H "X-N8N-API-KEY: YOUR_KEY"
> ```
> The workflow ID is visible in the browser URL when you open the workflow.

---

### Step 7 — Link Company WhatsApp Number

Open an SSH tunnel from your PC to access the private QR endpoint:
```bash
# Windows PowerShell — run this in a SEPARATE terminal, leave it open
ssh -i "C:\path\to\whatsapp-bot-key.pem" -L 3000:localhost:3000 ubuntu@NEW_SERVER_IP -N
```

> [!IMPORTANT]
> The terminal will appear to "hang/freeze" — this is correct. Do NOT close it.
> Make sure your local Docker is NOT also running on port 3000 before running the tunnel.
> If it is, stop it first: `docker compose down`

Open in browser:
```
http://localhost:3000/qr
```

On the **company phone or WhatsApp Business:**
- Open WhatsApp → tap ⋮ → **Linked Devices** → **Link a Device**
- Scan the QR code shown in the browser

After scanning, the page shows **"✅ WhatsApp is already connected!"**

Verify via the server SSH session:
```bash
curl http://localhost:3000/status
# Expected: {"connected":true,"qrPending":false}
```

---

### Step 8 — Get Group IDs for New Sheet

The group IDs are tied to the **WhatsApp number**, not the server. They stay the same as long as the company phone is a member of those groups.

To get group IDs (while SSH tunnel is open or directly on server):
```bash
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
curl -I http://NEW_SERVER_IP
```

Trigger a test message manually in n8n:
- Open workflow → click **Execute Workflow** button
- The output `{"skip": true}` is **normal** if no sheet rows match the current time
- To force a test: add a row with `send_time` = current time + 1 minute, `sent = FALSE`

---

### Step 10 — Decommission Old Instance

Once everything is verified on the new server:

```bash
# On OLD server — stop everything cleanly
docker compose -f docker-compose.prod.yml down
```

Then go to AWS Console → EC2 → Instances → select old instance → **Terminate instance**.

---

## 🛠️ Day-to-Day Operations Reference

### Adding new scheduled messages
1. Open the company Google Sheet
2. Add a new row with `group_id`, `message`, `send_time`, `sent=FALSE`
3. Nothing else needed — n8n picks it up within 1 minute

### Checking if the bot is alive
```bash
ssh -i "C:\path\to\key.pem" ubuntu@SERVER_IP "docker ps && curl -s localhost:3000/status"
```

### Re-scanning QR (if WhatsApp disconnects)
```bash
# Terminal 1 — SSH tunnel (leave running)
ssh -i "C:\path\to\key.pem" -L 3000:localhost:3000 ubuntu@SERVER_IP -N

# Browser
http://localhost:3000/qr
```

### Viewing logs
```bash
ssh -i "C:\path\to\key.pem" ubuntu@SERVER_IP
docker logs whatsapp_api --tail=50 -f   # WhatsApp API logs
docker logs n8n --tail=50 -f            # n8n logs
docker logs nginx_proxy --tail=50 -f    # Nginx logs
```

### Restarting everything
```bash
cd ~/WhatsApp-bot
docker compose -f docker-compose.prod.yml restart
```

### After server reboot (containers should auto-start, but if not)
```bash
cd ~/WhatsApp-bot
docker compose -f docker-compose.prod.yml up -d
```

### Pulling code updates
```bash
cd ~/WhatsApp-bot
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

### Activating workflow via API (if UI toggle is not visible)
```bash
# Step 1: Get API key from http://SERVER_IP/settings/api
# Step 2: Run on server:
curl -X POST "http://localhost:5678/api/v1/workflows/WORKFLOW_ID/activate" -H "X-N8N-API-KEY: YOUR_KEY"
```

---

## 🚨 Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Messages not sending | WhatsApp disconnected | Re-scan QR (see above) |
| n8n not accessible | Container down or port blocked | `docker ps`; check AWS Security Group inbound rules (ports 80 and 5678) |
| QR not appearing at `/qr` | Chromium crash (OOM) or SSH tunnel not open | `docker logs whatsapp_api`; restart tunnel with `-N` flag |
| SSH tunnel "Connection refused" | whatsapp-api not bound to host port | Check `docker ps` — should show `127.0.0.1:3000->3000/tcp` for whatsapp_api |
| Wrong time triggering | Timezone mismatch | Confirm `GENERIC_TIMEZONE=Asia/Kolkata` in docker-compose.prod.yml |
| n8n "Connection lost" in UI | WebSocket origin mismatch on port 5678 | Access n8n via **port 80** (`http://SERVER_IP` not `http://SERVER_IP:5678`) |
| n8n "Connection lost" and Active toggle hidden | Same as above | Activate via API key (see Day-to-Day section above) |
| Bad Gateway on n8n | nginx running but n8n restarted (new IP) | `docker restart nginx_proxy` |
| Workflow shows `skip: true` | No sheet rows match current time | Normal behavior — add a test row with current time + 1 min |
| Group ID not found | Phone not in group | Add company number to the WhatsApp group first |
| Containers not running after reboot | Docker not enabled on boot | `sudo systemctl enable docker` then `docker compose -f docker-compose.prod.yml up -d` |

---

## 📞 Contact

For questions about this setup during handover period, contact:

**Ali Mehdi**  
**Email:** alimehdi432faiz@gmail.com  
**Available until:** 31 August 2026
