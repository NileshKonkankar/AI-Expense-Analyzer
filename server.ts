import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

// Initialize Firebase Admin
const firebaseConfig = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf-8"));
const firebaseApp = admin.initializeApp({
  projectId: firebaseConfig.projectId,
});

const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

async function processRecurringExpenses() {
  console.log(`[${new Date().toISOString()}] Processing recurring expenses...`);
  const today = new Date().toISOString().split('T')[0];
  
  try {
    const recurringSnapshot = await db.collection('recurringExpenses')
      .where('nextDueDate', '<=', today)
      .get();

    if (recurringSnapshot.empty) {
      console.log("No recurring expenses due.");
      return;
    }

    for (const doc of recurringSnapshot.docs) {
      const recurring = doc.data();
      const docId = doc.id;
      
      try {
        // 1. Add to expenses
        await db.collection('expenses').add({
          userId: recurring.userId,
          description: recurring.description,
          amount: recurring.amount,
          category: recurring.category,
          date: recurring.nextDueDate,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 2. Calculate next due date
        const nextDate = new Date(recurring.nextDueDate);
        if (recurring.frequency === 'daily') nextDate.setDate(nextDate.getDate() + 1);
        else if (recurring.frequency === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
        else if (recurring.frequency === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
        else if (recurring.frequency === 'yearly') nextDate.setFullYear(nextDate.getFullYear() + 1);

        const nextDueDate = nextDate.toISOString().split('T')[0];

        // 3. Update recurring expense
        await db.collection('recurringExpenses').doc(docId).update({ nextDueDate });
        console.log(`Processed: ${recurring.description} for user ${recurring.userId}`);
      } catch (err) {
        console.error(`Error processing recurring expense ${docId}:`, err);
      }
    }
  } catch (err) {
    console.error("Critical error in recurring expense process:", err);
  }
}

// Run daily (every 24 hours), and once on startup
// We use a shorter interval (e.g., every hour) to be more responsive if the server restarts
setInterval(processRecurringExpenses, 60 * 60 * 1000);
processRecurringExpenses(); // Initial run

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/process-recurring", async (req, res) => {
    // Manual trigger endpoint
    try {
      await processRecurringExpenses();
      res.json({ status: "processed" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
