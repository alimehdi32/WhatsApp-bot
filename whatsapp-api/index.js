const { Client, LocalAuth } = require("whatsapp-web.js");
const express = require("express");
const qrcode = require("qrcode-terminal");
const QRCode = require("qrcode");

const app = express();
app.use(express.json());

let currentQR = null;
let isReady = false;

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
  currentQR = qr;
  isReady = false;
});

client.on("ready", () => {
  console.log("WhatsApp connected!");
  isReady = true;
  currentQR = null;
});

client.on("disconnected", (reason) => {
  console.log("WhatsApp disconnected:", reason);
  isReady = false;
});

// ── Health / status ──────────────────────────────────────────────
app.get("/status", (req, res) => {
  res.json({ connected: isReady, qrPending: !!currentQR });
});

// ── QR code as a browser-viewable HTML page ───────────────────────
app.get("/qr", async (req, res) => {
  if (isReady) {
    return res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:40px">
        <h2 style="color:green">✅ WhatsApp is already connected!</h2>
        <p>No QR scan needed.</p>
      </body></html>`);
  }
  if (!currentQR) {
    return res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:40px">
        <h2>⏳ Waiting for QR code…</h2>
        <p>Refresh in a few seconds.</p>
        <script>setTimeout(()=>location.reload(), 3000)</script>
      </body></html>`);
  }
  try {
    const qrDataURL = await QRCode.toDataURL(currentQR);
    res.send(`
      <html>
        <head>
          <title>WhatsApp QR Login</title>
          <meta http-equiv="refresh" content="15">
        </head>
        <body style="font-family:sans-serif;text-align:center;padding:40px;background:#f0f0f0">
          <h2>📱 Scan this QR with WhatsApp</h2>
          <p>WhatsApp → Linked Devices → Link a Device</p>
          <img src="${qrDataURL}" style="border:4px solid #25D366;border-radius:12px;padding:10px;background:white"/>
          <p style="color:#888;font-size:13px">Page auto-refreshes every 15 seconds</p>
        </body>
      </html>`);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Send message ──────────────────────────────────────────────────
app.post("/send", async (req, res) => {
  if (!isReady) {
    return res.status(503).json({ success: false, error: "WhatsApp not connected yet" });
  }
  try {
    const { number, message } = req.body;
    await client.sendMessage(number, message);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── List groups ───────────────────────────────────────────────────
app.get("/groups", async (req, res) => {
  if (!isReady) {
    return res.status(503).json({ error: "WhatsApp not connected yet" });
  }
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