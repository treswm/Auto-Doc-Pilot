#!/usr/bin/env node

/**
 * Help Center Translation Management Dashboard - Express Server
 * Usage: node server.js
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

// Route handlers
import authRoutes from "./api/auth.js";
import approvalsRoutes from "./api/approvals.js";
import approversRoutes from "./api/approvers.js";
import feedbackRoutes from "./api/feedback.js";
import articlesRoutes from "./api/articles.js";
import oauthRoutes from "./api/oauth.js";
import translationsRoutes from \"./api/translations.js\";
import scannersRoutes from "./api/scanners.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.EXPRESS_PORT || 3001;
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret-change-in-production";

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({ origin: `http://localhost:${process.env.REACT_PORT || 3000}`, credentials: true }));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

// Attach session user to req
app.use((req, res, next) => {
  if (req.session?.user) req.user = req.session.user;
  next();
});

// ── API Routes ──────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) =>
  res.json({ status: "ok", timestamp: new Date().toISOString() })
);

app.use("/api/auth", authRoutes);
app.use("/api/approvals", approvalsRoutes);
app.use("/api/approvers", approversRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/articles", articlesRoutes);
app.use("/api/oauth", oauthRoutes);
app.use(\"/api/translations\", translationsRoutes);
app.use("/api/scanners", scannersRoutes);

// ── Static / React ──────────────────────────────────────────────────────────
const publicPath = path.join(__dirname, "public");
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
  app.get("*", (req, res) => {
    if (!req.path.startsWith("/api/")) {
      res.sendFile(path.join(publicPath, "index.html"));
    } else {
      res.status(404).json({ error: "API endpoint not found" });
    }
  });
} else {
  app.get("/", (req, res) =>
    res.json({
      message: "Help Center Translation Dashboard — API Server",
      note: "React runs on port 3000 (Vite dev server)",
      endpoints: {
        health: "GET /api/health",
        auth: ["POST /api/auth/login", "POST /api/auth/logout", "GET /api/auth/me"],
        approvals: ["GET /api/approvals/pending", "GET /api/approvals/history", "POST /api/approvals/:runId/vote"],
        workflow: "POST /api/approvals/trigger",
        approvers: ["GET /api/approvers", "POST /api/approvers", "DELETE /api/approvers/:id"],
        feedback: ["POST /api/feedback/translation", "GET /api/feedback/history"],
      },
    })
  );
}

// ── Error handler ───────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("❌ Server error:", err.message);
  res.status(500).json({
    error: "Internal server error",
    ...(process.env.NODE_ENV === "development" && { detail: err.message }),
  });
});

// ── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log("\n🚀 Help Center Translation Dashboard — API Server");
  console.log(`📡 http://localhost:${PORT}`);
  console.log(`🖥️  React UI: http://localhost:${process.env.REACT_PORT || 3000}`);
  console.log(`\n   npm run dev   → starts both servers together\n`);
});
