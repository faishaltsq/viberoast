/**
 * Classification logic for detected secret candidates.
 * Distinguishes recognized secrets, suspicious assignments, placeholders,
 * publishable tokens, and uncertain shapes.
 */

import type { SecretClassification } from './types'

export function calculateShannonEntropy(str: string): number {
  if (!str) return 0
  const frequencies = new Map<string, number>()
  for (let i = 0; i < str.length; i++) {
    const ch = str[i]
    frequencies.set(ch, (frequencies.get(ch) || 0) + 1)
  }
  let entropy = 0
  const len = str.length
  for (const count of frequencies.values()) {
    const p = count / len
    entropy -= p * Math.log2(p)
  }
  return entropy
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    while (payload.length % 4 !== 0) payload += '='

    let decoded = ''
    if (typeof atob === 'function') {
      decoded = atob(payload)
    } else {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
      for (let i = 0; i < payload.length; i += 4) {
        const b0 = chars.indexOf(payload[i])
        const b1 = chars.indexOf(payload[i + 1])
        const b2 = payload[i + 2] === '=' ? 0 : chars.indexOf(payload[i + 2])
        const b3 = payload[i + 3] === '=' ? 0 : chars.indexOf(payload[i + 3])
        if (b0 === -1 || b1 === -1) return null
        decoded += String.fromCharCode((b0 << 2) | (b1 >> 4))
        if (payload[i + 2] !== '=') decoded += String.fromCharCode(((b1 & 15) << 4) | (b2 >> 2))
        if (payload[i + 3] !== '=') decoded += String.fromCharCode(((b2 & 3) << 6) | b3)
      }
    }
    const parsed = JSON.parse(decoded)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

const PLACEHOLDER_LITERAL_REGEX = /^(?:YOUR[_-]?API[_-]?KEY[_-]?HERE|YOUR[_-]?KEY[_-]?HERE|INSERT[_-]?KEY[_-]?HERE|REPLACE[_-]?ME|CHANGEME|DUMMY|EXAMPLE|MY[_-]?SECRET[_-]?KEY|TEST[_-]?SECRET|XXXX+|0000+|12345678+)$/i

const ANON_KEY_NAMES = /^(?:(?:NEXT_PUBLIC_)?SUPABASE_(?:ANON_KEY|PUBLISHABLE_KEY)|supabaseKey|supabase_anon_key)$/i
const SERVICE_KEY_NAMES = /^(?:SUPABASE_(?:SERVICE_ROLE_KEY|SERVICE_KEY|SECRET_KEY)|supabase_service_role_key)$/i

export function extractAssignmentKey(textBefore: string): string | null {
  const match = textBefore.match(/(?:^|[^a-zA-Z0-9_$-])([a-zA-Z0-9_$-]+)(?:\s*:\s*[a-zA-Z0-9_$<>[\]]+)?\s*['"\]]*\s*[:=]\s*['"`]?\s*$/)
  return match ? match[1] : null
}

export function classifySecret(
  value: string,
  context: string,
  ruleId: string,
  assignmentKey?: string | null
): SecretClassification {
  if (!value || typeof value !== 'string') return 'placeholder'
  const trimmed = value.trim()
  if (trimmed.length < 4) return 'placeholder'

  // 1. Check for placeholders and template/interpolation variables
  if (PLACEHOLDER_LITERAL_REGEX.test(trimmed)) return 'placeholder'
  if (/^<[^>]+>$/.test(trimmed)) return 'placeholder'
  if (/^\$\{[^}]+\}$/.test(trimmed)) return 'placeholder'
  if (/^\{\{[^}]+\}\}$/.test(trimmed)) return 'placeholder'
  if (/^process\.env\.[A-Za-z0-9_]+$/.test(trimmed)) return 'placeholder'
  if (/^(?:true|false|null|undefined)$/i.test(trimmed)) return 'placeholder'
  if (/(?:^|\b)(?:AKIA|ASIA)[A-Z0-9]*EXAMPLE\b/i.test(trimmed)) return 'placeholder'

  // Repetitive or monotonous dummy sequences (e.g. 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')
  const payloadOnly = trimmed.replace(/^(?:gh[pousr]_|github_pat_|sk_|rk_|pk_|xox[baprs]-)/i, '')
  if (payloadOnly.length >= 10) {
    const distinct = new Set(payloadOnly.split('')).size
    if (distinct <= 2) {
      if (/^[xX0]+$/.test(payloadOnly)) {
        return 'placeholder'
      }
      return 'uncertain'
    }
  }

  // UUID check without high-entropy credential context
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    if (!/(?:secret|private[_-]?key|token)/i.test(context)) {
      return 'placeholder'
    }
  }

  // 2. Publishable checks
  if (ruleId === 'stripe-publishable-key' || /^pk_(?:test|live|prod)_/i.test(trimmed)) {
    return 'publishable'
  }
  if (ruleId === 'supabase-publishable' || /^sb_publishable_/i.test(trimmed)) {
    return 'publishable'
  }
  if (ruleId === 'public-key-certificate' || /-----BEGIN (?:PUBLIC KEY|CERTIFICATE)-----/.test(trimmed)) {
    return 'publishable'
  }

  // 3. Supabase JWT inspection (contextual role verification)
  if (trimmed.startsWith('eyJ')) {
    const payload = decodeJwtPayload(trimmed)
    const isSupabaseIssuer = payload && typeof payload.iss === 'string' && payload.iss.toLowerCase().includes('supabase')

    let key = assignmentKey
    if (key === undefined) {
      const valIdx = context.indexOf(trimmed)
      const before = valIdx !== -1 ? context.slice(0, valIdx) : context
      key = extractAssignmentKey(before)
    }

    const hasScopedAnonContext = Boolean(key && ANON_KEY_NAMES.test(key))
    const hasScopedServiceContext = Boolean(key && SERVICE_KEY_NAMES.test(key))

    if (payload && isSupabaseIssuer) {
      if (payload.role === 'anon' && hasScopedAnonContext) {
        return 'publishable'
      }
      if (payload.role === 'service_role' && hasScopedServiceContext) {
        return 'recognized'
      }
    }

    return 'uncertain'
  }

  // Broad loose shapes return uncertain, never recognized
  if (ruleId.endsWith('-broad') || ruleId === 'github-token-broad' || ruleId === 'slack-token-broad') {
    return 'uncertain'
  }

  // 4. Recognized provider keys
  if (
    ruleId.startsWith('github-') ||
    ruleId === 'stripe-secret-key' ||
    ruleId === 'stripe-webhook-secret' ||
    ruleId.startsWith('slack-') ||
    ruleId === 'openai-api-key' ||
    ruleId.startsWith('anthropic-') ||
    ruleId.startsWith('aws-bedrock') ||
    ruleId === 'aws-secret-access-key' ||
    ruleId === 'gcp-api-key' ||
    ruleId === 'google-service-account-key' ||
    ruleId === 'supabase-secret' ||
    ruleId === 'supabase-pat'
  ) {
    if (ruleId.startsWith('github-')) {
      if (trimmed.startsWith('ghp_') && trimmed.length !== 40) return 'uncertain'
      if (trimmed.startsWith('github_pat_') && trimmed.length !== 93) return 'uncertain'
      if (/^gh[ousr]_/.test(trimmed) && trimmed.length !== 40) return 'uncertain'
    }
    return 'recognized'
  }

  // 5. AWS Access Key ID
  if (ruleId === 'aws-access-key-id') {
    // Identifier alone is not confidential, but high confidence pattern match
    // Check if ends in EXAMPLE or low entropy
    if (trimmed.endsWith('EXAMPLE')) return 'placeholder'
    return 'recognized'
  }

  // 6. Private Key Blocks
  if (ruleId === 'private-key-block' || ruleId === 'private-key-escaped') {
    return 'suspicious'
  }

  // 7. JWT Signing Secret configuration
  if (ruleId === 'jwt-signing-secret') {
    return 'suspicious'
  }

  // 8. Database URL credentials
  if (ruleId === 'database-url-credentials') {
    let decoded = trimmed
    try {
      decoded = decodeURIComponent(trimmed)
    } catch {
      return 'uncertain'
    }
    if (PLACEHOLDER_LITERAL_REGEX.test(decoded) || /^(?:password|secret|test|root|admin)$/i.test(decoded)) {
      return 'placeholder'
    }
    return 'recognized'
  }

  // 9. Generic credential assignment
  if (ruleId === 'generic-credential-assignment') {
    // If key context is merely api_key without secret/password/token, do not assume private credential
    const isBareApiKey = /\bapi[_-]?key\b/i.test(context) && !/(?:secret|token|password|passwd|private)/i.test(context)
    if (isBareApiKey) {
      return 'uncertain'
    }
    const entropy = calculateShannonEntropy(trimmed)
    if (entropy >= 3.5 && trimmed.length >= 16) {
      return 'suspicious'
    }
    return 'uncertain'
  }

  return 'uncertain'
}
