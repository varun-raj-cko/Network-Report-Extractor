import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import nodemailer from "nodemailer";
import cors from "cors";
import cron, { ScheduledTask } from "node-cron";
import axios from "axios";
import fs from "fs";
import { google } from "googleapis";

interface AutoJob {
  id: string;
  name: string;
  reportType: string;
  scheme: string;
  sourceType: 'server' | 'drive';
  folderPath?: string;
  driveFolderId?: string;
  time: string; // HH:mm
  recipientEmail: string;
  active: boolean;
}

const JOBS_FILE = path.join(process.cwd(), "automation_jobs.json");

// Google Drive Client Helper
async function getDriveClient() {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not configured in Secrets.");
  }
  
  const credentials = JSON.parse(serviceAccountJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  
  return google.drive({ version: 'v3', auth });
}

async function scanGoogleDriveFolder(folderId: string, reportKeyword: string) {
  const drive = await getDriveClient();
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType)',
  });
  
  const files = res.data.files || [];
  const matches = files.filter(f => f.name?.toLowerCase().includes(reportKeyword.toLowerCase()));
  
  return matches;
}

async function sendEmailHelper(to: string | string[], subject: string, body: string, fileName?: string, fileContentBase64?: string) {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;

  if (!gmailUser || !gmailPass) {
    throw new Error("Gmail configuration (GMAIL_USER and GMAIL_APP_PASSWORD) is missing on the server.");
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: gmailUser,
      pass: gmailPass,
    },
    connectionTimeout: 10000, 
    greetingTimeout: 10000,
    socketTimeout: 30000,
  });
  
  const recipients = Array.isArray(to) ? to.filter(Boolean).join(', ') : to;
  
  const mailOptions: any = {
    from: `"Network Report Extractor" <${gmailUser}>`,
    to: recipients,
    subject: subject,
    html: body,
  };

  if (fileName && fileContentBase64) {
    mailOptions.attachments = [
      {
        filename: fileName,
        content: Buffer.from(fileContentBase64, 'base64'),
      },
    ];
  }

  return await transporter.sendMail(mailOptions);
}

function loadJobs(): AutoJob[] {
  if (fs.existsSync(JOBS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(JOBS_FILE, "utf-8"));
    } catch (e) {
      return [];
    }
  }
  return [];
}

function saveJobs(jobs: AutoJob[]) {
  fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2));
}

let activeCrons: { [id: string]: ScheduledTask } = {};

async function processJob(job: AutoJob, isManual: boolean = false) {
  console.log(`[Automation] Processing Job "${job.name}" (${isManual ? 'Manual' : 'Scheduled'})`);
  try {
    let reportSnippet = "";
    
    if (job.sourceType === 'drive') {
      if (!job.driveFolderId) throw new Error("Drive Folder ID is missing");
      const driveFiles = await scanGoogleDriveFolder(job.driveFolderId, job.reportType);
      reportSnippet = `Google Drive scan complete. Found ${driveFiles.length} matching files for "${job.reportType}".`;
    } else {
      const folder = job.folderPath || "/uploads/automation";
      const absolutePath = folder.startsWith("/") ? folder : path.join(process.cwd(), folder);
      
      if (fs.existsSync(absolutePath)) {
        const files = fs.readdirSync(absolutePath).filter(f => f.toLowerCase().includes(job.reportType.toLowerCase()));
        reportSnippet = `Server scan complete. Found ${files.length} matching files in ${folder}.`;
      } else {
        reportSnippet = `Server directory ${folder} not found.`;
      }
    }

    await sendEmailHelper(
      job.recipientEmail,
      `${isManual ? 'Manual Run' : 'Scheduled Report'}: ${job.name}`,
      `<h3>Automation Report</h3>
       <p><b>Job:</b> ${job.name}</p>
       <p><b>Network:</b> ${job.scheme}</p>
       <p><b>Source:</b> ${job.sourceType === 'drive' ? 'Google Drive' : 'Local Server'}</p>
       <p><b>Status:</b> Success ✅</p>
       <p><b>System Notes:</b> ${reportSnippet}</p>
       ${isManual ? '<p><i>Note: This was a manually triggered run.</i></p>' : ''}`
    );
    
    return { success: true, notes: reportSnippet };
  } catch (err: any) {
    console.error(`[Automation] Error in Job ${job.name}:`, err.message);
    throw err;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(express.json({ limit: '50mb' }));
  app.use(cors());

  // Automation APIs
  app.get("/api/automation/jobs", (req, res) => {
    res.json(loadJobs());
  });

  app.post("/api/automation/jobs", (req, res) => {
    const jobs = loadJobs();
    const newJob: AutoJob = { ...req.body, id: Date.now().toString(), active: true };
    jobs.push(newJob);
    saveJobs(jobs);
    scheduleJob(newJob);
    res.json(newJob);
  });

  app.delete("/api/automation/jobs/:id", (req, res) => {
    let jobs = loadJobs();
    const { id } = req.params;
    jobs = jobs.filter(j => j.id !== id);
    saveJobs(jobs);
    if (activeCrons[id]) {
      activeCrons[id].stop();
      delete activeCrons[id];
    }
    res.json({ success: true });
  });

  app.post("/api/automation/jobs/:id/run", async (req, res) => {
    const jobs = loadJobs();
    const job = jobs.find(j => j.id === req.params.id);
    if (!job) return res.status(404).json({ error: "Job not found" });

    try {
      await processJob(job, true);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  function scheduleJob(job: AutoJob) {
    if (activeCrons[job.id]) {
      activeCrons[job.id].stop();
    }

    const [hour, minute] = job.time.split(":");
    const pattern = `${minute} ${hour} * * *`;
    
    console.log(`[Automation] Scheduling Job "${job.name}" at ${pattern}`);
    
    const task = cron.schedule(pattern, async () => {
      try {
        await processJob(job);
      } catch (err: any) {
        // Logged in processJob
      }
    });

    activeCrons[job.id] = task;
  }

  // Initial scheduling
  loadJobs().forEach(j => {
    if (j.active) scheduleJob(j);
  });

  // Email API Route
  app.post("/api/send-report", async (req, res) => {
    console.log(`[Email] Manual request received for: ${req.body.to}`);
    const { to, subject, body, fileName, fileContent } = req.body;
    
    try {
      const info = await sendEmailHelper(
        to, 
        subject || "Network Report Extraction", 
        body || "<p>Attached is the extracted report.</p>", 
        fileName, 
        fileContent
      );
      console.log(`[Email] Success! Message ID: ${info.messageId}`);
      res.json({ success: true, id: info.messageId });
    } catch (error: any) {
      console.error("[Email] Critical Error:", error);
      
      let errorMessage = error.message || "Failed to send email";
      if (errorMessage.includes("Invalid login")) {
        errorMessage = "Gmail Login Failed: Please check your GMAIL_APP_PASSWORD.";
      } else if (errorMessage.includes("ETIMEDOUT")) {
        errorMessage = "Connection Timeout: Unable to reach Gmail SMTP server.";
      }
      
      res.status(500).json({ error: errorMessage });
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
