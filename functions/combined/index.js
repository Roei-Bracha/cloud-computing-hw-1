const admin = require("firebase-admin");
const { v4: uuidv4 } = require("uuid");
const express = require("express");
const app = express();

app.use(express.json());

// More detailed logging
const DEBUG = process.env.DEBUG === "true";
function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function logError(...args) {
  console.error(new Date().toISOString(), ...args);
}

// Initialize Firestore with explicit credentials
let db;
try {
  // For Google Cloud Run, we use the default application credentials
  log(
    "Initializing Firebase Admin with project:",
    process.env.FIRESTORE_PROJECT
  );

  admin.initializeApp({
    projectId: process.env.FIRESTORE_PROJECT,
    // For local testing with explicit credentials file
    ...(process.env.GOOGLE_APPLICATION_CREDENTIALS && {
      credential: admin.credential.applicationDefault(),
    }),
  });

  db = admin.firestore();
  log("Firestore initialized successfully");
} catch (error) {
  logError("Failed to initialize Firestore:", error);
  // Don't crash the app, as we'll handle the error when DB calls are made
}

// Middleware to handle async errors
const asyncHandler = (fn) => (req, res, next) => {
  return Promise.resolve(fn(req, res, next)).catch(next);
};

// Error handler middleware
app.use((err, req, res, next) => {
  logError("Unhandled error:", err);
  res.status(500).json({
    error: "Internal server error",
    message: DEBUG ? err.message : "Something went wrong",
    stack: DEBUG ? err.stack : undefined,
  });
});

// Health check endpoint
app.get("/", (req, res) => {
  res.send(`Parking Lot Management System - Status: OK`);
});

// Version endpoint
app.get("/version", (req, res) => {
  res.json({
    version: "1.0.0",
    environment: process.env.NODE_ENV || "development",
    project: process.env.FIRESTORE_PROJECT || "unknown",
  });
});

// Firestore connection test endpoint
app.get(
  "/status",
  asyncHandler(async (req, res) => {
    log("Testing Firestore connection...");

    if (!db) {
      throw new Error("Firestore not initialized");
    }

    try {
      // First, get Firestore project information
      const projectInfo = {
        project: process.env.FIRESTORE_PROJECT,
        nodeEnv: process.env.NODE_ENV,
        timestamp: new Date().toISOString(),
      };

      log("Attempting to write to Firestore...");

      // Try a simple write operation
      const healthDoc = await db.collection("_healthcheck").doc("status").set({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        status: "ok",
        projectInfo,
      });

      log("Firestore write successful");

      // Try a simple read operation to confirm it worked
      const readResult = await db
        .collection("_healthcheck")
        .doc("status")
        .get();

      if (!readResult.exists) {
        throw new Error("Could not read back test document");
      }

      res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        firestore: "connected",
        project: process.env.FIRESTORE_PROJECT || "unknown",
        readData: readResult.exists ? "success" : "failed",
        data: readResult.data(),
      });
    } catch (error) {
      logError("Firestore health check failed:", error);

      // More detailed error information
      res.status(500).json({
        status: "error",
        message: "Failed to connect to Firestore",
        error: error.message,
        code: error.code,
        project: process.env.FIRESTORE_PROJECT || "unknown",
        details: DEBUG
          ? {
              stack: error.stack,
              fullError: JSON.stringify(
                error,
                Object.getOwnPropertyNames(error)
              ),
            }
          : undefined,
      });
    }
  })
);

// Entry endpoint
app.post(
  "/entry",
  asyncHandler(async (req, res) => {
    const plate = req.query.plate;
    const lotId = req.query.parkingLot;

    // Validate input params
    if (!plate) {
      return res.status(400).json({
        error: "Missing parameter",
        message: "License plate is required",
        param: "plate",
      });
    }

    if (!lotId) {
      return res.status(400).json({
        error: "Missing parameter",
        message: "Parking lot ID is required",
        param: "parkingLot",
      });
    }

    log(`Processing entry for plate ${plate} at lot ${lotId}`);

    if (!db) {
      throw new Error("Firestore not initialized");
    }

    // Generate unique ticket
    const ticketId = uuidv4();
    const entryTime = admin.firestore.FieldValue.serverTimestamp();

    // Persist record
    try {
      await db.collection("tickets").doc(ticketId).set({
        plate,
        lotId,
        entryTime,
        status: "active",
        created: new Date().toISOString(), // Regular date for debugging
      });

      log(`Created ticket ${ticketId} for plate ${plate}`);

      // Return ticket ID
      return res.json({
        ticketId,
        plate,
        parkingLot: lotId,
        timestamp: new Date().toISOString(),
      });
    } catch (dbError) {
      logError(`Database error during entry:`, dbError);
      return res.status(503).json({
        error: "Database service unavailable",
        message: "Could not save entry ticket at this time",
        details: DEBUG ? dbError.message : undefined,
      });
    }
  })
);

// Exit endpoint
app.post(
  "/exit",
  asyncHandler(async (req, res) => {
    const ticketId = req.query.ticketId;

    // Validate input
    if (!ticketId) {
      return res.status(400).json({
        error: "Missing parameter",
        message: "Ticket ID is required",
        param: "ticketId",
      });
    }

    log(`Processing exit for ticket ${ticketId}`);

    if (!db) {
      throw new Error("Firestore not initialized");
    }

    // Fetch entry record
    let doc;
    try {
      doc = await db.collection("tickets").doc(ticketId).get();
    } catch (dbError) {
      logError(`Database error fetching ticket ${ticketId}:`, dbError);
      return res.status(503).json({
        error: "Database service unavailable",
        message: "Could not retrieve ticket information at this time",
        details: DEBUG ? dbError.message : undefined,
      });
    }

    if (!doc.exists) {
      return res.status(404).json({
        error: "Not found",
        message: "Ticket not found",
      });
    }

    const ticketData = doc.data();
    if (ticketData.status !== "active") {
      return res.status(400).json({
        error: "Invalid ticket status",
        message: "Ticket already processed",
        status: ticketData.status,
      });
    }

    // Handle case where entryTime might be a server timestamp
    let entryMs;
    const { plate, lotId, entryTime } = ticketData;

    if (entryTime && typeof entryTime.toMillis === "function") {
      entryMs = entryTime.toMillis();
    } else if (entryTime && entryTime._seconds) {
      // Firestore timestamp format
      entryMs = entryTime._seconds * 1000;
    } else {
      // Fallback to current time minus 1 hour if no valid timestamp
      log("No valid entryTime found in ticket, using fallback");
      entryMs = Date.now() - 60 * 60 * 1000; // 1 hour ago
    }

    const nowMs = Date.now();

    // Compute duration and fee
    const diffMs = nowMs - entryMs;
    const intervalMs = 15 * 60 * 1000; // 15 minutes
    const intervals = Math.ceil(diffMs / intervalMs);
    const fee = (intervals * 10) / 4; // $10/hour prorated
    const totalMinutes = Math.ceil(diffMs / (60 * 1000));
    const exitTime = admin.firestore.FieldValue.serverTimestamp();

    // Update ticket status
    try {
      await db.collection("tickets").doc(ticketId).update({
        status: "processed",
        exitTime,
        fee,
        totalMinutes,
        processingDate: new Date().toISOString(),
      });

      log(
        `Processed exit for ticket ${ticketId}, total fee: $${fee.toFixed(2)}`
      );

      // Return result
      return res.json({
        ticketId,
        plate,
        parkingLot: lotId,
        entryTime: new Date(entryMs).toISOString(),
        exitTime: new Date().toISOString(),
        totalTimeMinutes: totalMinutes,
        charge: fee,
      });
    } catch (dbError) {
      logError(`Database error updating ticket ${ticketId}:`, dbError);
      return res.status(503).json({
        error: "Database service unavailable",
        message: "Could not process exit at this time",
        details: DEBUG ? dbError.message : undefined,
      });
    }
  })
);

const port = parseInt(process.env.PORT) || 8080;
app.listen(port, () => {
  log(`Parking Lot Service listening on port ${port}`);
});
