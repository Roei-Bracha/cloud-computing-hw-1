const admin = require("firebase-admin");
const { v4: uuidv4 } = require("uuid");
const express = require("express");
const app = express();

app.use(express.json());

// Initialize Firestore
admin.initializeApp({ projectId: process.env.FIRESTORE_PROJECT });
const db = admin.firestore();

// Health check endpoint
app.get("/", (req, res) => {
  res.send(`Entry Service - Parking Lot Management System`);
});

app.post("/entry", async (req, res) => {
  const plate = req.query.plate;
  const lotId = req.query.parkingLot;
  if (!plate || !lotId) {
    return res.status(400).json({ error: "Missing plate or parkingLot" });
  }

  // Generate unique ticket
  const ticketId = uuidv4();
  const entryTime = admin.firestore.Timestamp.now();

  // Persist record
  await db.collection("tickets").doc(ticketId).set({
    plate,
    lotId,
    entryTime,
    status: "active",
  });

  // Return ticket ID
  return res.json({ ticketId });
});

const port = parseInt(process.env.PORT) || 8080;
app.listen(port, () => {
  console.log(`Entry service listening on port ${port}`);
});
