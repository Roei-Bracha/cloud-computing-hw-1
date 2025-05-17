const admin = require("firebase-admin");
const express = require("express");
const app = express();

app.use(express.json());

// Initialize Firestore
admin.initializeApp({ projectId: process.env.FIRESTORE_PROJECT });
const db = admin.firestore();

// Health check endpoint
app.get("/", (req, res) => {
  res.send(`Exit Service - Parking Lot Management System`);
});

app.post("/exit", async (req, res) => {
  const ticketId = req.query.ticketId;
  if (!ticketId) {
    return res.status(400).json({ error: "Missing ticketId" });
  }

  // Fetch entry record
  const doc = await db.collection("tickets").doc(ticketId).get();
  if (!doc.exists) {
    return res.status(404).json({ error: "Ticket not found" });
  }

  const ticketData = doc.data();
  if (ticketData.status !== "active") {
    return res.status(400).json({ error: "Ticket already processed" });
  }

  const { plate, lotId, entryTime } = ticketData;
  const entryMs = entryTime.toMillis();
  const nowMs = Date.now();

  // Compute duration and fee
  const diffMs = nowMs - entryMs;
  const intervalMs = 15 * 60 * 1000; // 15 minutes
  const intervals = Math.ceil(diffMs / intervalMs);
  const fee = (intervals * 10) / 4; // $10/hour prorated
  const totalMinutes = Math.ceil(diffMs / (60 * 1000));

  // Mark ticket as processed
  await db.collection("tickets").doc(ticketId).update({
    status: "processed",
    exitTime: admin.firestore.Timestamp.now(),
    fee: fee,
    totalMinutes: totalMinutes,
  });

  // Return result
  return res.json({
    plate,
    parkingLot: lotId,
    totalTimeMinutes: totalMinutes,
    charge: fee,
  });
});

const port = parseInt(process.env.PORT) || 8080;
app.listen(port, () => {
  console.log(`Exit service listening on port ${port}`);
});
