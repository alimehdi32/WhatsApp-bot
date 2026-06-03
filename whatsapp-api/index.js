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
  const chats = await client.getChats();
  const groups = chats
    .filter(c => c.isGroup)
    .map(g => ({ id: g.id._serialized, name: g.name }));
  res.json(groups);
});

client.initialize();
app.listen(3000, () => console.log("API running on port 3000"));