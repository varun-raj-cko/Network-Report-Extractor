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
    const { to, subject, body, fileName, fileContent, fileType } = req.body;
    
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD;

    if (!gmailUser || !gmailPass) {
      return res.status(500).json({ 
        error: "Gmail configuration (GMAIL_USER and GMAIL_APP_PASSWORD) is missing on the server." 
      });
    }

    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: gmailUser,
          pass: gmailPass,
        },
      });
      
      const mailOptions = {
        from: gmailUser,
        to: Array.isArray(to) ? to.join(', ') : to,
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
      res.json({ success: true, id: info.messageId });
    } catch (error: any) {
      console.error("Email Error:", error);
      res.status(500).json({ error: error.message || "Failed to send email" });
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
