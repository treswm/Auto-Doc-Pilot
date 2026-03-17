/**
 * Translation API Endpoints
 * Handles AI-powered translations with glossary context
 */

import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";

const router = express.Router();

// Default translation instructions if none provided
const DEFAULT_TRANSLATION_INPUT = `Translation Corrects:
• Idioms like "out of the box" should not be directly translated. Out of the box should instead be translated to: clé en main

Hi Marley Comprehensive Glossary:

A
AI Case Summary - Automatically generated summary of a conversation thread, allowing adjusters and supervisors to quickly review case history and next steps without reading every message.
AI Coaching - Real-time coaching alerts that help operators prioritize next actions, maintain consistency, and improve performance.
AI Photo Assist / AI Photo Analysis - AI capabilities that help interpret claim photos to support triage and guide next steps.
AI Suggested Response / Writing Assistant - AI-generated reply suggestions surfaced within the conversation thread to help operators respond faster and more consistently.
Alerts - System-generated, proactive signals that automatically detect when a conversation needs attention — such as delays, unanswered questions, or a shift in customer sentiment.
Auto Replies - Automated responses triggered by conditions such as out-of-office, inactivity, or away-from-desk status.
Away Message - An automatic reply sent to a policyholder when an operator is unavailable.

B
Branded Messaging - Customer-facing message experience aligned to the carrier's brand identity and tone.
Brands - An option available when creating a case that allows the operator to associate the conversation with a specific carrier brand.

C
Case (Conversation Thread) - A unified, secure communication stream associated with a specific claim or service interaction.
Case Reassignment - The transfer of case ownership from one operator to another without losing conversation context, history, or media.
Case Transcripts - Exportable records of the full conversation for compliance, documentation, and audit purposes.
Case Visibility (Public/Private) - Controls that determine whether certain content is visible to the policyholder or kept as internal-only notes.
Configurable Opt-In - Flexible consent flow options for how customers are enrolled in and confirm their willingness to receive text messages.
Conversational FNOL - A text-enabled claim intake experience that captures the customer's account of a loss and seamlessly continues as an ongoing conversation thread.

D
Dashboards - Reporting views that summarize performance metrics, team activity, and operational trends for supervisors and leaders.
Deliverability Monitoring & Alerts - System monitoring that detects and flags messaging delivery issues and anomalies.

E
Email Notifications - Optional notifications delivered via email for platform updates, alerts, or workflow events.
Escalation Signals - Indicators that help teams identify conversations at risk due to negative sentiment, prolonged delays, or unanswered questions.

F
Focused Operator - An inbox mode that reduces noise and helps operators concentrate on their highest-priority conversations.

G
Group Management - Admin capability to create and manage teams, groups, and case assignment structures.

H
Hi Marley Connect - A lightweight way to bring Hi Marley capabilities into an insurance professional's existing workflow.
Hi Marley Insurance Cloud - The platform foundation powering Hi Marley's Claims, Service, and Sales solutions.

I
Image Redaction - Automated masking or removal of sensitive information detected within images shared in the conversation.
Inbound Media - Photos, videos, and documents received from customers or partners directly within the conversation thread.
Inactivity Message - An automated message triggered when a conversation has been inactive for a configured period.
Intelligent Translation - Real-time, bidirectional message translation supporting up to 25 languages.

M
Message Delivery Rate - A measure of how reliably messages are being delivered to policyholders.
Message Intelligence - AI-driven analysis that surfaces risk, urgency, and operational signals within conversations.
Message Prefix - An identifier displayed in the conversation showing which user or team sent a message.
Message Templates - Pre-built or configurable messages for common claim and service scenarios.
Mobile App - Mobile access for operators and field users to manage conversations, cases, and workflows from any device.
Multi-Party Texting - The ability to include vendors, third-party partners, or other external participants within the same conversation thread.
Multi-User Collaboration - The ability for multiple internal users to view and collaborate on a single case simultaneously.

N
Needs Action Label - A conversation indicator that signals a follow-up or response is required from the operator.
Needs Attention Label - An AI-generated indicator that flags conversations that may be at risk.

O
One-Way Notifications - Outbound updates sent to policyholders that do not require a response.
OOO (Out-of-Office) Settings - Configuration that allows operators to set coverage periods and automatic replies during planned absences.
Opt-In / Opt-Out Management - Consent handling that tracks policyholder preferences and automatically respects opt-out requests.
Organizational Dashboard - A high-level view of operational performance, adoption, and activity across the entire organization.
Outbound Media - The ability to send photos, documents, or other files to customers or partners securely within the conversation thread.

P
Permission Management / Role-Based Access Control - Admin controls that govern which users can access specific settings, data, and platform features.
Policyholder Profile - Customer profile data connected to core systems of record.
Policyholder Pulse Survey - An embedded customer satisfaction survey delivered within the conversation thread.
Primary Operator - The main user assigned to manage and own a case.

Q
Queue Management - Routing configuration that distributes cases across teams based on rules, workload, or ownership models.

R
Recipient Number Lookup - Validation that checks whether a number is reachable before sending.
Redaction (Text & Image) - Automated masking or removal of sensitive information from message content and images.

S
Scheduled Messages - Messages configured to send at a specific time or cadence.
Secondary Operator - An additional internal user assigned to support a case.
Sentiment Analysis / Negative Sentiment Alerting - AI-driven evaluation of a policyholder's tone and emotional signals.
Single Sign-On (SSO) - Authentication integration that allows users to log in using their existing enterprise credentials.
Suggested Actions - System recommendations that guide operators toward the best next step within a conversation.

T
Tags / Labels / Badges - Visual indicators applied to conversations that help operators quickly filter and identify cases by status or condition.
Team Routing Rules - Rules that control which users or teams receive incoming cases.
Time to First Contact (TTFC) - A key performance metric measuring the elapsed time between claim intake and first outreach.
Total Loss Assist (TLA) - A solution that integrates with total loss workflows to reduce cycle time.
Two-Way Texting - Real-time SMS communication between policyholders and carrier representatives.

U
Unaddressed Badges - Visual indicators on a conversation showing that a message requires a response or follow-up action.
Unified Conversation Thread - A single, continuous communication stream connecting adjusters, policyholders, and third-party partners.

V
Verisk XactAnalysis Integration - A real-time integration that centralizes property claim updates and communications.
Voice to Text - A capability that converts voice content into text to accelerate case handling.

W
Warm Transfer - The reassignment of a case to another operator with full context preserved.
Welcome Flow - A configurable onboarding workflow that defines the welcome message and follow-up messages at the start of a new conversation.`;

/**
 * GET /api/translations/input
 * Retrieve the current translation input (glossary + instructions)
 */
router.get("/input", requireAuth, (req, res) => {
  try {
    // In a real implementation, this would fetch from a database
    // For now, we'll just return the default or user-provided input
    const translationInput = req.session?.translationInput || DEFAULT_TRANSLATION_INPUT;

    res.json({
      success: true,
      translationInput,
    });
  } catch (err) {
    console.error("Error retrieving translation input:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/translations/input
 * Save the translation input (glossary + instructions)
 * Body: { translationInput: string }
 */
router.post("/input", requireAuth, (req, res) => {
  try {
    const { translationInput } = req.body;

    if (!translationInput || typeof translationInput !== "string") {
      return res.status(400).json({
        success: false,
        error: "translationInput must be a non-empty string",
      });
    }

    // Save to session (in production, save to database)
    req.session.translationInput = translationInput;

    console.log(
      `✅ Translation input saved (${translationInput.length} characters)`
    );

    res.json({
      success: true,
      message: "Translation input saved successfully",
      length: translationInput.length,
    });
  } catch (err) {
    console.error("Error saving translation input:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/translations/translate
 * Translate content using OpenAI with glossary context
 * Body: { content: string, targetLocale: string, translationInput?: string }
 */
router.post("/translate", requireAuth, async (req, res) => {
  try {
    const { content, targetLocale = "fr-ca", translationInput } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: "content is required",
      });
    }

    // Use provided translation input or fetch from session
    const glossary = translationInput || req.session?.translationInput || DEFAULT_TRANSLATION_INPUT;

    // Validate OpenAI API key
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing OPENAI_API_KEY in environment variables");
    }

    console.log(`🌐 Translating to ${targetLocale} with glossary context...`);

    // Build the system prompt with glossary
    const systemPrompt = `You are an expert translator for Hi Marley, a healthcare technology company.

Your translation guidelines and glossary:
${glossary}

Translate the content below while adhering to these guidelines. Maintain the same HTML structure and formatting.`;

    // Call OpenAI API
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5",
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: `Translate the following content to ${targetLocale}:\n\n${content}`,
          },
        ],
        temperature: 0.3, // Lower temperature for more consistent translations
        max_tokens: 4000,
      }),
    });

    if (!openaiResponse.ok) {
      const error = await openaiResponse.json();
      throw new Error(`OpenAI API error: ${error.error.message}`);
    }

    const data = await openaiResponse.json();
    const translatedContent = data.choices[0].message.content;

    console.log(`✅ Translation completed (${translatedContent.length} characters)`);

    res.json({
      success: true,
      content: translatedContent,
      targetLocale,
      tokens: data.usage.total_tokens,
    });
  } catch (err) {
    console.error("Translation error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/translations/batch
 * Translate multiple articles at once
 * Body: { articles: Array<{id, title, body}>, targetLocale: string, translationInput?: string }
 */
router.post("/batch", requireAuth, async (req, res) => {
  try {
    const { articles, targetLocale = "fr-ca", translationInput } = req.body;

    if (!Array.isArray(articles) || articles.length === 0) {
      return res.status(400).json({
        success: false,
        error: "articles must be a non-empty array",
      });
    }

    const glossary = translationInput || req.session?.translationInput || DEFAULT_TRANSLATION_INPUT;

    console.log(`🌐 Batch translating ${articles.length} articles to ${targetLocale}...`);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing OPENAI_API_KEY");
    }

    const systemPrompt = `You are an expert translator for Hi Marley, a healthcare technology company.

Your translation guidelines and glossary:
${glossary}

Translate the content below while adhering to these guidelines. Maintain the same HTML structure and formatting.`;

    const results = [];
    let totalTokens = 0;

    for (const article of articles) {
      try {
        const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-5",
            messages: [
              {
                role: "system",
                content: systemPrompt,
              },
              {
                role: "user",
                content: `Translate the following Help Center article to ${targetLocale}:\n\nTitle: ${article.title}\n\nContent:\n${article.body}`,
              },
            ],
            temperature: 0.3,
            max_tokens: 4000,
          }),
        });

        if (!openaiResponse.ok) {
          const error = await openaiResponse.json();
          results.push({
            articleId: article.id,
            success: false,
            error: error.error.message,
          });
          continue;
        }

        const data = await openaiResponse.json();
        totalTokens += data.usage.total_tokens;

        results.push({
          articleId: article.id,
          success: true,
          translatedBody: data.choices[0].message.content,
          tokens: data.usage.total_tokens,
        });
      } catch (err) {
        results.push({
          articleId: article.id,
          success: false,
          error: err.message,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    console.log(
      `✅ Batch translation completed: ${successCount}/${articles.length} successful`
    );

    res.json({
      success: true,
      results,
      summary: {
        total: articles.length,
        successful: successCount,
        failed: articles.length - successCount,
        totalTokens,
      },
    });
  } catch (err) {
    console.error("Batch translation error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
