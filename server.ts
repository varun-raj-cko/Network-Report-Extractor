import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import nodemailer from "nodemailer";
import cors from "cors";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(express.json({ limit: '50mb' }));
  app.use(cors());

  // Email API Route
  app.post("/api/send-report", async (req, res) => {
    console.log(`[Email] Request received for: ${req.body.to}`);
    
    const { to, subject, body, fileName, fileContent } = req.body;
    
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD;

    if (!gmailUser || !gmailPass) {
      console.error("[Email] Missing GMAIL_USER or GMAIL_APP_PASSWORD");
      return res.status(500).json({ 
        error: "Gmail configuration (GMAIL_USER and GMAIL_APP_PASSWORD) is missing on the server. Please add them to your Secrets." 
      });
    }

    try {
      // Create transporter with explicit settings for better reliability from Cloud Env
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true, // use SSL
        auth: {
          user: gmailUser,
          pass: gmailPass,
        },
        // Increase timeout for slow connections
        connectionTimeout: 10000, 
        greetingTimeout: 10000,
        socketTimeout: 30000,
      });
      
      const recipients = Array.isArray(to) ? to.filter(Boolean).join(', ') : to;
      
      if (!recipients) {
        return res.status(400).json({ error: "No valid recipient email addresses provided." });
      }

      console.log(`[Email] Attempting to send to: ${recipients}`);
      
      const mailOptions = {
        from: `"Network Report Extractor" <${gmailUser}>`,
        to: recipients,
        subject: subject || "Network Report Extraction",
        html: body || "<p>Attached is the extracted network report.</p>",
        attachments: [
          {
            filename: fileName,
            content: Buffer.from(fileContent, 'base64'),
          },
        ],
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`[Email] Success! Message ID: ${info.messageId}`);
      res.json({ success: true, id: info.messageId });
    } catch (error: any) {
      console.error("[Email] Critical Error:", error);
      
      // Check for common Gmail errors
      let errorMessage = error.message || "Failed to send email";
      if (errorMessage.includes("Invalid login")) {
        errorMessage = "Gmail Login Failed: Please check your GMAIL_APP_PASSWORD (ensure it is the 16-character code, not your regular password).";
      } else if (errorMessage.includes("ETIMEDOUT") || errorMessage.includes("ESOCKET")) {
        errorMessage = "Connection Timeout: Unable to reach Gmail SMTP server. This might be a temporary network issue.";
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
