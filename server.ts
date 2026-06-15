import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import nodemailer from "nodemailer";

// Initialize Firebase Admin
const firebaseConfig = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf-8"));
const firebaseApp = admin.initializeApp({
  projectId: firebaseConfig.projectId,
});

const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

// Setup Nodemailer SMTP Transporter
const mailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.mailtrap.io",
  port: parseInt(process.env.SMTP_PORT || "2525"),
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASSWORD || "",
  },
});

interface WarningPayload {
  userId: string;
  category: string;
  month: string;
  limit: number;
  spent: number;
  percent: number;
  threshold: number;
}

// Helper to send email warnings and push notifications
async function sendBudgetWarningNotification(payload: WarningPayload) {
  const { userId, category, month, limit, spent, percent, threshold } = payload;
  const alertId = `${userId}_${category}_${month}_${threshold}`;
  
  try {
    // 1. Check if alert already exists, to avoid double notifications
    const alertRef = db.collection('budgetAlerts').doc(alertId);
    const alertDoc = await alertRef.get();
    if (alertDoc.exists) {
      console.log(`[ALERT CHECK] Alert ${alertId} already issued. Skipping email/push.`);
      return { success: true, alreadyLogged: true };
    }
    
    // 2. Load User Preferences
    const settingsRef = db.collection('userSettings').doc(userId);
    const settingsDoc = await settingsRef.get();
    
    let emailEnabled = true;
    let pushEnabled = true;
    let targetEmail = "";
    
    if (settingsDoc.exists) {
      const data = settingsDoc.data();
      if (data) {
        emailEnabled = data.emailEnabled !== false;
        pushEnabled = data.pushEnabled !== false;
        targetEmail = data.email || "";
      }
    }
    
    // Fallback to fetch system auth email
    if (!targetEmail) {
      try {
        const userRecord = await admin.auth().getUser(userId);
        targetEmail = userRecord.email || "KonkankarNilesh@gmail.com";
      } catch (e) {
        targetEmail = "KonkankarNilesh@gmail.com";
      }
    }
    
    let sentEmail = false;
    let sentPush = false;
    let emailStatus = 'skipped';
    
    // 3. Email dispatch flow
    if (emailEnabled && targetEmail) {
      const subject = threshold === 100 
        ? `🚨 BUDGET CRITICAL: Spending reached 100% for ${category}!`
        : `⚠️ BUDGET WARNING: Spending reached 90% for ${category}!`;
        
      const thresholdColor = threshold === 100 ? '#EF4444' : '#F59E0B';
      const headingText = threshold === 100 ? "Budget Limit Exceeded" : "Nearing Budget Limit";
      const thresholdPercentage = threshold === 100 ? "100%" : "90%";
      
      const htmlBody = `
        <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; max-width: 550px; margin: 40px auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #E5E7EB; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); padding: 32px; color: #1F2937;">
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="display: inline-block; padding: 12px; background-color: ${thresholdColor}15; border-radius: 50%; color: ${thresholdColor}; margin-bottom: 16px;">
              <span style="font-size: 28px; font-weight: bold; line-height: 1;">⚠️</span>
            </div>
            <h1 style="font-size: 20px; font-weight: 800; color: #111827; margin: 0; text-transform: uppercase; letter-spacing: 0.05em; font-family: monospace;">${headingText}</h1>
          </div>
          
          <p style="font-size: 14px; color: #4B5563; line-height: 1.6; text-align: center; margin-bottom: 24px;">
            Hello! This is an automated warning that your tracked spending in <strong>${category}</strong> has crossed the <strong>${thresholdPercentage}</strong> threshold for this month.
          </p>

          <div style="background-color: #F9FAFB; border-radius: 12px; border: 1px solid #F3F4F6; padding: 20px; margin-bottom: 28px;">
            <div style="display: flex; justify-content: space-between; border-bottom: 1px dashed #E5E7EB; padding-bottom: 10px; margin-bottom: 10px;">
              <span style="font-size: 12px; text-transform: uppercase; color: #9CA3AF; font-family: monospace;">Category</span>
              <strong style="font-size: 14px; color: #111827;">${category}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; border-bottom: 1px dashed #E5E7EB; padding-bottom: 10px; margin-bottom: 10px;">
              <span style="font-size: 12px; text-transform: uppercase; color: #9CA3AF; font-family: monospace;">Budget Period</span>
              <strong style="font-size: 14px; color: #111827;">${month}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; border-bottom: 1px dashed #E5E7EB; padding-bottom: 10px; margin-bottom: 10px;">
              <span style="font-size: 12px; text-transform: uppercase; color: #9CA3AF; font-family: monospace;">Set Budget Limit</span>
              <strong style="font-size: 14px; color: #111827;">₹${limit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; border-bottom: 1px dashed #E5E7EB; padding-bottom: 10px; margin-bottom: 10px;">
              <span style="font-size: 12px; text-transform: uppercase; color: #9CA3AF; font-family: monospace;">Current Spent</span>
              <strong style="font-size: 14px; color: #DC2626;">₹${spent.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; padding-top: 5px;">
              <span style="font-size: 12px; text-transform: uppercase; color: #9CA3AF; font-family: monospace;">Utilization Ratio</span>
              <strong style="font-size: 14px; color: ${thresholdColor};">${percent.toFixed(1)}%</strong>
            </div>
          </div>

          <div style="text-align: center; margin-bottom: 24px;">
            <a href="https://ais-pre-36hulao3g43engo4fvb5qi-521045399451.asia-east1.run.app" style="display: inline-block; padding: 12px 24px; background-color: #2563EB; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; font-family: monospace;">Adjust Budgets</a>
          </div>
          
          <div style="border-top: 1px solid #E5E7EB; margin-top: 32px; padding-top: 16px; text-align: center; font-size: 11px; color: #9CA3AF;">
            You are receiving this because budget alerts are enabled on your account profile.<br/>
            Configure notification channels in your settings page at any time.
          </div>
        </div>
      `;
      
      const isMockSmtp = !process.env.SMTP_USER || !process.env.SMTP_PASSWORD;
      
      if (isMockSmtp) {
        console.log(`[EMAIL SIMULATOR] Warning dispatched to ${targetEmail} for category ${category}. SMTP credentials not configured (simulation saved).`);
        emailStatus = 'simulated';
        sentEmail = true;
      } else {
        try {
          await mailTransporter.sendMail({
            from: `"Expense Analyzer Alert" <noreply@expenseanalyzer.com>`,
            to: targetEmail,
            subject,
            html: htmlBody
          });
          console.log(`[ALERT TRANSIT] Real SMTP budget alert sent successfully to ${targetEmail}`);
          emailStatus = 'sent';
          sentEmail = true;
        } catch (mailErr) {
          console.error("[ALERT EXCEPTION] SMTP send error:", mailErr);
          emailStatus = 'failed';
        }
      }
    }
    
    // 4. Push dispatch flow
    let tokenStrings: string[] = [];
    if (pushEnabled) {
      try {
        const tokensSnapshot = await db.collection('fcmTokens').where('userId', '==', userId).get();
        tokenStrings = tokensSnapshot.docs.map(doc => doc.data().token);
        
        if (tokenStrings.length > 0) {
          const pushTitle = threshold === 100 
            ? `🚨 Budget Exceeded: ${category}` 
            : `⚠️ Budget Warning: ${category}`;
          const pushBody = `You have reached ${percent.toFixed(0)}% of your ₹${limit} monthly budget for ${category}. Current spent: ₹${spent.toFixed(0)}.`;
          
          for (const token of tokenStrings) {
            try {
              await admin.messaging().send({
                token,
                notification: {
                  title: pushTitle,
                  body: pushBody,
                },
                data: {
                  userId,
                  category,
                  month,
                  threshold: String(threshold),
                }
              });
              console.log(`[FCM SUCCESS] Push notification routed to token: ${token.substring(0, 15)}...`);
              sentPush = true;
            } catch (fcmErr) {
              console.error("[FCM FAILURE] Send error for token:", token.substring(0, 15), fcmErr);
            }
          }
        } else {
          console.log("[FCM CHECK] No registration tokens found for userId " + userId);
        }
      } catch (pushErr) {
        console.error("[FCM ROUTE EXCEPTION] FCM send failure:", pushErr);
      }
    }
    
    // 5. Store alert record to avoid sending warning again
    await alertRef.set({
      userId,
      category,
      month,
      threshold,
      triggeredAt: admin.firestore.FieldValue.serverTimestamp(),
      amount: spent,
      limit,
      sentEmail,
      sentPush
    });
    
    // 6. Record audit log
    await db.collection('notificationLogs').add({
      userId,
      title: threshold === 100 ? `Budget Exceeded limit: ${category}` : `Nearing budget threshold: ${category}`,
      body: `Spending in '${category}' for ${month} reached ₹${spent.toLocaleString('en-IN', { minimumFractionDigits: 0 })} of ₹${limit.toLocaleString('en-IN', { minimumFractionDigits: 0 })} (${percent.toFixed(0)}%). Channels: ${emailEnabled ? 'Email' : ''} ${pushEnabled ? 'Push' : ''}`,
      type: emailEnabled && pushEnabled ? 'both' : (emailEnabled ? 'email' : 'push'),
      status: emailStatus,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    return { success: true, alreadyLogged: false };
  } catch (err) {
    console.error("[ALERT FAILURE] Critical error sending warning:", err);
    return { success: false, error: err };
  }
}

// Check budget bounds helper for a specific user, category, and month
async function checkBudgetThresholdsForUser(userId: string, month: string, category: string, triggerFrom: string) {
  console.log(`[BUDGET RADAR] Checking budget bounds for user ${userId}, category ${category}, month ${month} (${triggerFrom})`);
  try {
    const budgetSnapshot = await db.collection('categoryBudgets')
      .where('userId', '==', userId)
      .where('category', '==', category)
      .where('month', '==', month)
      .limit(1)
      .get();
      
    if (budgetSnapshot.empty) {
      console.log(`[BUDGET RADAR] No budget declared for '${category}' in ${month}.`);
      return;
    }
    
    const budgetData = budgetSnapshot.docs[0].data();
    const limit = budgetData.amount;
    if (limit <= 0) return;
    
    // Find all expenses in this period
    const expensesSnapshot = await db.collection('expenses')
      .where('userId', '==', userId)
      .where('category', '==', category)
      .get();
      
    const currentMonthExpenses = expensesSnapshot.docs
      .map(doc => doc.data())
      .filter(data => data.date && data.date.startsWith(month));
      
    const spent = currentMonthExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const percent = (spent / limit) * 100;
    
    console.log(`[BUDGET RADAR] Calculated: spent ₹${spent}/${limit} (${percent.toFixed(1)}%)`);
    
    if (percent >= 100) {
      await sendBudgetWarningNotification({
        userId,
        category,
        month,
        limit,
        spent,
        percent,
        threshold: 100
      });
    } else if (percent >= 90) {
      await sendBudgetWarningNotification({
        userId,
        category,
        month,
        limit,
        spent,
        percent,
        threshold: 90
      });
    }
  } catch (err) {
    console.error("[BUDGET RADAR ERROR] Exception checking budget thresholds:", err);
  }
}

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
        
        // 4. Run automatic budget bounds checks for the processed expense
        const expenseMonth = recurring.nextDueDate.substring(0, 7);
        await checkBudgetThresholdsForUser(recurring.userId, expenseMonth, recurring.category, 'recurring_engine');
      } catch (err) {
        console.error(`Error processing recurring expense ${docId}:`, err);
      }
    }
  } catch (err) {
    console.error("Critical error in recurring expense process:", err);
  }
}

// Run daily (every 24 hours), and once on startup
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
    try {
      await processRecurringExpenses();
      res.json({ status: "processed" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Client trigger endpoint to evaluate budgets for category-months
  app.post("/api/check-budget-alerts", async (req, res) => {
    const { userId, category, month, triggerFrom } = req.body;
    if (!userId || !category || !month) {
      return res.status(400).json({ error: "Missing required params: userId, category, month" });
    }
    try {
      await checkBudgetThresholdsForUser(userId, month, category, triggerFrom || 'ui_trigger');
      res.json({ status: "evaluated" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Client developer trigger button endpoint to dispatch a direct test email
  app.post("/api/send-test-email", async (req, res) => {
    const { userId, email } = req.body;
    if (!userId || !email) {
      return res.status(400).json({ error: "Missing userId or email parameters." });
    }
    
    try {
      const subject = "📧 System Integration: Test Budget Notification Email";
      const htmlBody = `
        <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; max-width: 500px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #E5E7EB; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); padding: 24px; color: #1F2937;">
          <h2 style="color: #2563EB; border-bottom: 2px solid #EFF6FF; padding-bottom: 8px; margin-bottom: 12px; font-family: monospace; font-size: 16px;">CONNECTION TEST OK</h2>
          <p style="font-size: 13.5px; line-height: 1.5; color: #4B5563;">
            Congratulations! You have successfully established connection to the **Expense Analyzer** alert server. 
          </p>
          <div style="padding: 12px; background-color: #F9FAFB; border-radius: 8px; border: 1px solid #F3F4F6; margin: 16px 0; font-family: monospace; font-size: 11px;">
            Recipient: ${email}<br/>
            Triggered At: ${new Date().toLocaleString()}<br/>
            Server Status: Operational (Port 3000)
          </div>
          <p style="font-size: 12px; color: #9CA3AF; margin: 0;">
            This proves your SMTP setup is fully functional. Real warning triggers will follow exact categories when utilization reaches 90% and 100%.
          </p>
        </div>
      `;
      
      const isMockSmtp = !process.env.SMTP_USER || !process.env.SMTP_PASSWORD;
      let emailStatus = 'skipped';
      
      if (isMockSmtp) {
        console.log(`[TEST EMAIL SIMULATION] sending test email to ${email}`);
        emailStatus = 'simulated';
      } else {
        await mailTransporter.sendMail({
          from: `"Expense Analyzer Alert" <noreply@expenseanalyzer.com>`,
          to: email,
          subject,
          html: htmlBody
        });
        emailStatus = 'sent';
      }
      
      await db.collection('notificationLogs').add({
        userId,
        title: "Test Email Warning Setup",
        body: `Triggered a test email connection check to '${email}'. Delivery mode: ${isMockSmtp ? 'Simulated Fallback Mode' : 'SMTP Server Sent'}.`,
        type: 'email',
        status: emailStatus,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      res.json({ success: true, mode: isMockSmtp ? 'simulated' : 'real', email });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Client-side endpoint to save registrations for notifications
  app.post("/api/save-token", async (req, res) => {
    const { userId, token } = req.body;
    if (!userId || !token) {
      return res.status(400).json({ error: "Missing required specs." });
    }
    try {
      // Upsert fcm token
      const tokenRef = db.collection('fcmTokens').doc(`${userId}_${token.substring(0, 30)}`);
      await tokenRef.set({
        userId,
        token,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      res.json({ status: "saved" });
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
