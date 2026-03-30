import { MarkdownBody } from "../components/MarkdownBody";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Shield } from "lucide-react";

const PRIVACY_POLICY = `
# Privacy Policy

**Effective Date:** March 30, 2026
**Last Updated:** March 30, 2026

Ironworks ("we," "us," "our") is operated by Steel Motion LLC. This Privacy Policy describes how we collect, use, store, and protect your information when you use the Ironworks platform.

## 1. Information We Collect

### 1.1 Account Information
- Email address and name (when using authenticated mode)
- Authentication tokens and session data
- IP address at login

### 1.2 Company & Agent Data
- Company name, description, and configuration
- AI agent profiles, instructions, and configurations
- Projects, issues, goals, and associated metadata
- Comments, approvals, and collaboration data
- Playbook definitions and execution history

### 1.3 Execution Data
- Agent heartbeat run logs and events
- Token usage and cost tracking data
- Activity audit logs
- Library files and documents created by agents

### 1.4 Technical Data
- Browser type and version (via user-agent)
- Session cookies (strictly necessary for authentication)
- Optional analytics data (only with your consent)

## 2. How We Use Your Information

We use your information solely to:

- **Operate the platform** — authenticate you, run your AI agents, track costs, and deliver features
- **Maintain security** — detect unauthorized access, prevent abuse, and protect your data
- **Improve the product** — analyze usage patterns (with consent) to improve features and performance
- **Comply with legal obligations** — respond to lawful requests and enforce our terms

We do **not**:
- Sell your personal data to third parties
- Use your data for advertising
- Train AI models on your company data
- Share your data with other customers

## 3. Data Storage & Security

### 3.1 Where Data is Stored
- All data is stored on infrastructure you control (self-hosted) or on our managed VPS infrastructure
- For self-hosted deployments, data never leaves your server
- For managed deployments, data is stored on encrypted VPS instances

### 3.2 Security Measures
- All data at rest is stored in PostgreSQL with filesystem-level encryption
- API keys and secrets are encrypted with AES-256 using a master key
- Authentication uses secure session tokens with expiration
- Agent API keys use SHA-256 hashed storage
- SVG uploads are sanitized to prevent XSS
- Path traversal protection on all file access endpoints

### 3.3 Data Isolation
- Each company's data is isolated by company ID
- Agents can only access data within their own company
- Library file access is governed by org-chart-based ACLs

## 4. Data Retention

We retain data for the following periods:

| Data Type | Retention Period | Purpose |
|---|---|---|
| Agent execution logs | 90 days | Debugging and audit |
| Activity logs | 365 days | Compliance and audit trail |
| Cost/billing events | 365 days | Financial records |
| Expired auth sessions | 30 days after expiry | Security cleanup |
| Company data | Until deletion requested | Service operation |
| Plugin logs | 7 days | Debugging |

Data is automatically cleaned up daily after the retention period expires.

## 5. Your Rights

### 5.1 Right to Access (GDPR Article 15 / CCPA)
You can view a summary of all data we store about your company in **Settings > Privacy & Data**.

### 5.2 Right to Data Portability (GDPR Article 20)
You can download a complete export of all your data in machine-readable JSON format from **Settings > Privacy & Data > Export Your Data**.

### 5.3 Right to Erasure (GDPR Article 17)
You can request permanent deletion of all your data from **Settings > Privacy & Data > Request Data Erasure**. Erasure is scheduled with a 30-day grace period, after which all data is permanently and irreversibly removed.

### 5.4 Right to Rectification (GDPR Article 16)
You can update your company information, agent configurations, and other data directly through the Ironworks interface.

### 5.5 Right to Object (GDPR Article 21)
You can disable optional cookies and analytics tracking at any time through the Cookie Settings accessible from any page footer.

### 5.6 CCPA Rights (California Residents)
- **Right to Know:** You can request a summary of personal information collected (Settings > Privacy & Data)
- **Right to Delete:** You can request deletion of your data (Settings > Privacy & Data > Request Data Erasure)
- **Right to Opt-Out of Sale:** We do not sell personal information. No opt-out is necessary.
- **Non-Discrimination:** We will not discriminate against you for exercising your privacy rights.

## 6. Cookies

### 6.1 Strictly Necessary Cookies
- **Session cookie** — required for authentication. Cannot be disabled.

### 6.2 Optional Cookies (Consent Required)
- **Analytics** — help us understand usage patterns. Disabled by default.
- **Preferences** — remember your display settings. Disabled by default.

You can manage your cookie preferences at any time by clicking "Cookie Settings" in the page footer.

## 7. Third-Party Services

### 7.1 AI Model Providers
When you configure AI agents, your prompts and agent instructions are sent to your chosen AI provider (Anthropic, OpenAI, Google, etc.). Each provider has their own privacy policy governing how they handle this data. Ironworks does not control how AI providers process your data.

### 7.2 No Other Third Parties
We do not use third-party analytics, advertising, or tracking services unless you explicitly enable them.

## 8. Children's Privacy

Ironworks is not intended for use by individuals under 16 years of age. We do not knowingly collect personal information from children.

## 9. Changes to This Policy

We may update this Privacy Policy from time to time. We will notify you of material changes by updating the "Last Updated" date and, for significant changes, by displaying a notice in the application.

## 10. Contact Us

For privacy-related questions, data requests, or concerns:

- **Email:** privacy@steelmotionllc.ai
- **Company:** Steel Motion LLC
- **Response Time:** We respond to all privacy requests within 30 days as required by GDPR and CCPA.

---

*This privacy policy applies to the Ironworks platform operated by Steel Motion LLC.*
`;

export function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <ScrollArea className="h-screen">
        <div className="max-w-3xl mx-auto px-6 py-12">
          <div className="flex items-center gap-2 mb-6">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Ironworks by Steel Motion LLC</span>
          </div>
          <MarkdownBody>{PRIVACY_POLICY}</MarkdownBody>
          <div className="mt-12 pt-6 border-t border-border text-xs text-muted-foreground">
            <p>Steel Motion LLC. All rights reserved.</p>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
