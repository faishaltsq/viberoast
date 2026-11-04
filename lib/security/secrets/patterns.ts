/**
 * Vetted secret pattern definitions.
 * Provenance: Based on pinned Gitleaks v8.30.1 rules (MIT License).
 * Rules are heuristic shapes, not immutable issuance guarantees.
 */

import type { SecretRule } from './types'

export const GITLEAKS_RULE_VERSION = 'gitleaks-v8.30.1'

export const SECRET_RULES: readonly SecretRule[] = [
  // 1. GitHub
  {
    id: 'github-pat',
    version: GITLEAKS_RULE_VERSION,
    name: 'GitHub Personal Access Token',
    pattern: /ghp_[0-9a-zA-Z]{36}\b/g,
    defaultClassification: 'recognized',
    defaultConfidence: 'high',
  },
  {
    id: 'github-fine-grained-pat',
    version: GITLEAKS_RULE_VERSION,
    name: 'GitHub Fine-Grained Personal Access Token',
    pattern: /github_pat_[0-9a-zA-Z_]{82}\b/g,
    defaultClassification: 'recognized',
    defaultConfidence: 'high',
  },
  {
    id: 'github-oauth',
    version: GITLEAKS_RULE_VERSION,
    name: 'GitHub OAuth Access Token',
    pattern: /gho_[0-9a-zA-Z]{36}\b/g,
    defaultClassification: 'recognized',
    defaultConfidence: 'high',
  },
  {
    id: 'github-app-token',
    version: GITLEAKS_RULE_VERSION,
    name: 'GitHub App Token',
    pattern: /(?:ghu|ghs)_[0-9a-zA-Z]{36}\b/g,
    defaultClassification: 'recognized',
    defaultConfidence: 'high',
  },
  {
    id: 'github-refresh-token',
    version: GITLEAKS_RULE_VERSION,
    name: 'GitHub Refresh Token',
    pattern: /ghr_[0-9a-zA-Z]{36}\b/g,
    defaultClassification: 'recognized',
    defaultConfidence: 'high',
  },
  {
    id: 'github-token-broad',
    version: GITLEAKS_RULE_VERSION,
    name: 'GitHub Token (Broad/Legacy)',
    pattern: /\b(?:gh[pousr]_[0-9a-zA-Z]{20,}|github_pat_[0-9a-zA-Z_]{20,})\b/g,
    defaultClassification: 'uncertain',
    defaultConfidence: 'low',
  },

  // 2. Stripe
  {
    id: 'stripe-secret-key',
    version: GITLEAKS_RULE_VERSION,
    name: 'Stripe Secret or Restricted Key',
    pattern: /\b(?:sk|rk)_(?:test|live|prod)_[a-zA-Z0-9]{10,99}\b/g,
    defaultClassification: 'recognized',
    defaultConfidence: 'high',
  },
  {
    id: 'stripe-publishable-key',
    version: GITLEAKS_RULE_VERSION,
    name: 'Stripe Publishable Key',
    pattern: /\bpk_(?:test|live|prod)_[a-zA-Z0-9]{10,99}\b/g,
    defaultClassification: 'publishable',
    defaultConfidence: 'high',
  },
  {
    id: 'stripe-webhook-secret',
    version: GITLEAKS_RULE_VERSION,
    name: 'Stripe Webhook Secret',
    pattern: /\bwhsec_[a-zA-Z0-9]{24,}\b/g,
    defaultClassification: 'recognized',
    defaultConfidence: 'high',
  },

  // 3. Slack
  {
    id: 'slack-bot-token',
    version: GITLEAKS_RULE_VERSION,
    name: 'Slack Bot Token',
    pattern: /\bxoxb-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*\b/g,
    defaultClassification: 'recognized',
    defaultConfidence: 'high',
  },
  {
    id: 'slack-user-token',
    version: GITLEAKS_RULE_VERSION,
    name: 'Slack User Token',
    pattern: /\bxox[pe](?:-[0-9]{10,13}){3}-[a-zA-Z0-9-]{28,34}\b/g,
    defaultClassification: 'recognized',
    defaultConfidence: 'high',
  },
  {
    id: 'slack-app-token',
    version: GITLEAKS_RULE_VERSION,
    name: 'Slack App-Level Token',
    pattern: /\bxapp-\d-[A-Za-z0-9]+-\d+-[a-zA-Z0-9]+\b/gi,
    defaultClassification: 'recognized',
    defaultConfidence: 'high',
  },
  {
    id: 'slack-config-access-token',
    version: GITLEAKS_RULE_VERSION,
    name: 'Slack Configuration Access Token',
    pattern: /\bxoxe\.xox[bp]-\d-[A-Za-z0-9]{163,166}\b/gi,
    defaultClassification: 'recognized',
    defaultConfidence: 'high',
  },
  {
    id: 'slack-config-refresh-token',
    version: GITLEAKS_RULE_VERSION,
    name: 'Slack Configuration Refresh Token',
    pattern: /\bxoxe-\d-[A-Za-z0-9]{146}\b/gi,
    defaultClassification: 'recognized',
    defaultConfidence: 'high',
  },
  {
    id: 'slack-legacy-workspace-token',
    version: GITLEAKS_RULE_VERSION,
    name: 'Slack Legacy Workspace Token',
    pattern: /\bxox[ar]-(?:\d-)?[0-9a-zA-Z]{8,48}\b/g,
    defaultClassification: 'recognized',
    defaultConfidence: 'high',
  },
  {
    id: 'slack-webhook-url',
    version: GITLEAKS_RULE_VERSION,
    name: 'Slack Incoming Webhook URL',
    pattern: /https?:\/\/hooks\.slack\.com\/(?:services|workflows|triggers)\/[A-Za-z0-9+/]{43,56}/g,
    defaultClassification: 'recognized',
    defaultConfidence: 'high',
  },
  {
    id: 'slack-token-broad',
    version: GITLEAKS_RULE_VERSION,
    name: 'Slack Token (Broad/Legacy)',
    pattern: /\b(?:xox[baprs]-[0-9a-zA-Z-]{10,}|xoxe-[0-9a-zA-Z-]{10,}|xapp-[0-9a-zA-Z-]{10,})\b/g,
    defaultClassification: 'uncertain',
    defaultConfidence: 'low',
  },

  // 4. OpenAI
  {
    id: 'openai-api-key',
    version: GITLEAKS_RULE_VERSION,
    name: 'OpenAI API Key',
    // Matches modern project/svcacct/admin keys (segments of exactly 74 or 58 around T3BlbkFJ) and legacy keys
    pattern: /\bsk-(?:proj|svcacct|admin)-(?:[A-Za-z0-9_-]{74}|[A-Za-z0-9_-]{58})T3BlbkFJ(?:[A-Za-z0-9_-]{74}|[A-Za-z0-9_-]{58})\b|\bsk-[a-zA-Z0-9]{20}T3BlbkFJ[a-zA-Z0-9]{20}\b/g,
    defaultClassification: 'recognized',
    defaultConfidence: 'high',
  },

  // 5. Anthropic
  {
    id: 'anthropic-api-key',
    version: GITLEAKS_RULE_VERSION,
    name: 'Anthropic API Key',
    pattern: /\bsk-ant-api03-[a-zA-Z0-9_-]{93}AA\b/g,
    defaultClassification: 'recognized',
    defaultConfidence: 'high',
  },
  {
    id: 'anthropic-admin-api-key',
    version: GITLEAKS_RULE_VERSION,
    name: 'Anthropic Admin API Key',
    pattern: /\bsk-ant-admin01-[a-zA-Z0-9_-]{93}AA\b/g,
    defaultClassification: 'recognized',
    defaultConfidence: 'high',
  },

  // 6. AWS
  {
    id: 'aws-access-key-id',
    version: GITLEAKS_RULE_VERSION,
    name: 'AWS Access Key ID',
    // Supports modern [A-Z2-7]{16} and legacy [A-Z0-9]{16}
    pattern: /\b((?:A3T[A-Z0-9]|AKIA|ASIA|ABIA|ACCA)[A-Z0-9]{16})\b/g,
    defaultClassification: 'recognized',
    defaultConfidence: 'high',
  },
  {
    id: 'aws-secret-access-key',
    version: GITLEAKS_RULE_VERSION,
    name: 'AWS Secret Access Key',
    pattern: /(?:\baws_secret_access_key|\baws_secret_key|\bsecret_access_key|\baws_access_secret)["']?\s*[=:]\s*["']?([A-Za-z0-9/+=]{40})["']?/gi,
    defaultClassification: 'recognized',
    defaultConfidence: 'high',
    extractValue(match) {
      const full = match[0]
      const val = match[1]
      const start = match.index + full.indexOf(val)
      return { value: val, start, end: start + val.length }
    },
  },
  {
    id: 'aws-bedrock-api-key-long-lived',
    version: GITLEAKS_RULE_VERSION,
    name: 'Amazon Bedrock Long-Lived API Key',
    pattern: /\bABSK[A-Za-z0-9+/]{109,269}={0,2}\b/g,
    defaultClassification: 'recognized',
    defaultConfidence: 'high',
  },
  {
    id: 'aws-bedrock-api-key-short-lived',
    version: GITLEAKS_RULE_VERSION,
    name: 'Amazon Bedrock Short-Lived API Key',
    pattern: /\bbedrock-api-key-YmVkcm9jay5hbWF6b25hd3MuY29t[A-Za-z0-9_.~+-]*/g,
    defaultClassification: 'recognized',
    defaultConfidence: 'high',
  },

  // 7. Google Cloud & Service Accounts
  {
    id: 'gcp-api-key',
    version: GITLEAKS_RULE_VERSION,
    name: 'GCP API Key',
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    defaultClassification: 'recognized',
    defaultConfidence: 'high',
  },
  {
    id: 'google-service-account-key',
    version: 'custom-v1.0.0',
    name: 'Google Service Account Private Key JSON',
    pattern: /"(?:private_key|privateKey)"\s*:\s*"(-----BEGIN (?:[A-Z0-9_-]+ )?PRIVATE KEY-----(?:\\n|[\s\S])+?-----END (?:[A-Z0-9_-]+ )?PRIVATE KEY-----\\n?)"/g,
    defaultClassification: 'recognized',
    defaultConfidence: 'high',
    extractValue(match) {
      const full = match[0]
      const val = match[1]
      const start = match.index + full.indexOf(val)
      return { value: val, start, end: start + val.length }
    },
  },

  // 8. PEM Keys & Certificates
  {
    id: 'private-key-block',
    version: GITLEAKS_RULE_VERSION,
    name: 'Private Key Block',
    pattern: /-----BEGIN (?:[A-Z0-9_-]+ )?PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END (?:[A-Z0-9_-]+ )?PRIVATE KEY(?: BLOCK)?-----|$)/g,
    defaultClassification: 'suspicious',
    defaultConfidence: 'high',
  },
  {
    id: 'private-key-escaped',
    version: 'custom-v1.0.0',
    name: 'Escaped Private Key Block',
    pattern: /-----BEGIN (?:[A-Z0-9_-]+ )?PRIVATE KEY(?: BLOCK)?-----\\n[\s\S]*?(?:-----END (?:[A-Z0-9_-]+ )?PRIVATE KEY(?: BLOCK)?-----\\n?|$)/g,
    defaultClassification: 'suspicious',
    defaultConfidence: 'high',
  },
  {
    id: 'public-key-certificate',
    version: 'custom-v1.0.0',
    name: 'Public Key or Certificate',
    pattern: /-----BEGIN (?:PUBLIC KEY|CERTIFICATE)-----[\s\S]*?(?:-----END (?:PUBLIC KEY|CERTIFICATE)-----|$)/g,
    defaultClassification: 'publishable',
    defaultConfidence: 'high',
  },

  // 9. Supabase Prefixes
  {
    id: 'supabase-publishable',
    version: 'custom-v1.0.0',
    name: 'Supabase Publishable API Key',
    pattern: /\bsb_publishable_[a-zA-Z0-9_-]+\b/g,
    defaultClassification: 'publishable',
    defaultConfidence: 'high',
  },
  {
    id: 'supabase-secret',
    version: 'custom-v1.0.0',
    name: 'Supabase Secret API Key',
    pattern: /\bsb_secret_[a-zA-Z0-9_-]+\b/g,
    defaultClassification: 'recognized',
    defaultConfidence: 'high',
  },
  {
    id: 'supabase-pat',
    version: 'custom-v1.0.0',
    name: 'Supabase Personal Access Token',
    pattern: /\bsbp_[a-zA-Z0-9_]+\b/g,
    defaultClassification: 'recognized',
    defaultConfidence: 'high',
  },

  // 10. Database URLs
  {
    id: 'database-url-credentials',
    version: 'custom-v1.0.0',
    name: 'Database URL with Credentials',
    pattern: /\b(?:postgres|postgresql|mysql|mongodb|redis|mssql|cockroachdb):\/\/(?:[a-zA-Z0-9._~%-]+):([^\s@]+)@/gi,
    defaultClassification: 'recognized',
    defaultConfidence: 'high',
    extractValue(match) {
      const full = match[0]
      const password = match[1]
      const start = match.index + full.indexOf(password)
      return { value: password, start, end: start + password.length }
    },
  },

  // 11. JWT
  {
    id: 'jwt-signing-secret',
    version: 'custom-v1.0.0',
    name: 'JWT Signing Secret Configuration',
    pattern: /(?:\bjwt[_-]?secret|\bjwt[_-]?key|\bjwt[_-]?signature)["']?\s*[=:]\s*["']?([^\s"'<>;]{8,})["']?/gi,
    defaultClassification: 'suspicious',
    defaultConfidence: 'high',
    extractValue(match) {
      const full = match[0]
      const val = match[1]
      const start = match.index + full.indexOf(val)
      return { value: val, start, end: start + val.length }
    },
  },
  {
    id: 'jwt-bearer-token',
    version: 'custom-v1.0.0',
    name: 'JWT Bearer Artifact',
    pattern: /\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{6,}\b/g,
    defaultClassification: 'uncertain',
    defaultConfidence: 'medium',
  },

  // 12. Generic Credential Assignment with High Entropy
  {
    id: 'generic-credential-assignment',
    version: 'custom-v1.0.0',
    name: 'Generic Credential Assignment',
    pattern: /\b(api[_-]?(?:key|secret)|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key|secret[_-]?key|password|passwd|webhook[_-]?secret)["']?\s*[=:]\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|`((?:\\.|[^`\\])*)`|([^\s"'<>,;}]+))/gi,
    defaultClassification: 'suspicious',
    defaultConfidence: 'medium',
    extractValue(match) {
      const full = match[0]
      const val = match[2] ?? match[3] ?? match[4] ?? match[5]
      if (!val) return null

      const eqIdx = full.search(/[=:]/)
      if (eqIdx === -1) return null

      let valOffsetInFull: number
      if (match[2] !== undefined) {
        valOffsetInFull = full.indexOf('"', eqIdx) + 1
      } else if (match[3] !== undefined) {
        valOffsetInFull = full.indexOf("'", eqIdx) + 1
      } else if (match[4] !== undefined) {
        valOffsetInFull = full.indexOf('`', eqIdx) + 1
      } else {
        const afterEq = full.slice(eqIdx + 1)
        const nonWs = afterEq.search(/\S/)
        valOffsetInFull = eqIdx + 1 + (nonWs === -1 ? 0 : nonWs)
      }

      const start = match.index + valOffsetInFull
      return { value: val, start, end: start + val.length }
    },
  },
]
