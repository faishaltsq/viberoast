/**
 * Secret detector engine. Scans content using vetted pattern rules,
 * extracts exact character spans and line boundaries, and classifies candidates.
 */

import { SECRET_RULES } from './patterns'
import { classifySecret, extractAssignmentKey } from './classify'
import type { SecretCandidate, SecretClassification, SecretConfidence } from './types'

function getLineNumber(lineOffsets: number[], charOffset: number): number {
  let low = 0
  let high = lineOffsets.length - 1
  let result = 0
  while (low <= high) {
    const mid = (low + high) >> 1
    if (lineOffsets[mid] <= charOffset) {
      result = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return result + 1
}

function buildLineOffsets(content: string): number[] {
  const offsets: number[] = [0]
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') {
      offsets.push(i + 1)
    }
  }
  return offsets
}

const SPECIFIC_RULE_PREFIXES = [
  'github-',
  'stripe-',
  'slack-',
  'openai-',
  'anthropic-',
  'aws-',
  'gcp-',
  'google-',
  'supabase-',
]

export function getRulePriority(ruleId: string): number {
  if (ruleId.endsWith('-broad') || ruleId.endsWith('-legacy') || ruleId.includes('-broad')) return 2
  for (const prefix of SPECIFIC_RULE_PREFIXES) {
    if (ruleId.startsWith(prefix)) return 10
  }
  if (ruleId === 'database-url-credentials') return 8
  if (ruleId.startsWith('private-key')) return 7
  if (ruleId === 'public-key-certificate') return 7
  if (ruleId.startsWith('jwt-')) return 5
  return 1
}

export function detectSecrets(content: string, path?: string): SecretCandidate[] {
  if (!content || typeof content !== 'string') return []

  const lineOffsets = buildLineOffsets(content)
  const rawCandidates: SecretCandidate[] = []

  for (const rule of SECRET_RULES) {
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags)
    let match: RegExpExecArray | null

    while ((match = regex.exec(content)) !== null) {
      let value = match[0]
      let start = match.index
      let end = match.index + match[0].length

      if (rule.extractValue) {
        const extracted = rule.extractValue(match)
        if (!extracted) continue
        value = extracted.value
        start = extracted.start
        end = extracted.end
      } else if (match[1]) {
        const full = match[0]
        const sub = match[1]
        const subIdx = full.indexOf(sub)
        if (subIdx !== -1) {
          value = sub
          start = match.index + subIdx
          end = start + sub.length
        }
      }

      if (!value || value.length < 4) continue

      const lineStart = getLineNumber(lineOffsets, start)
      const lineEnd = getLineNumber(lineOffsets, Math.max(start, end - 1))

      // Context window: up to 100 characters before and after
      const ctxStart = Math.max(0, start - 100)
      const ctxEnd = Math.min(content.length, end + 100)
      const context = (path ? `${path} ` : '') + content.slice(ctxStart, ctxEnd)

      const textBefore = content.slice(ctxStart, start)
      const assignmentKey = extractAssignmentKey(textBefore)

      const classification: SecretClassification = classifySecret(value, context, rule.id, assignmentKey)
      let confidence: SecretConfidence = rule.defaultConfidence
      if (classification === 'placeholder') {
        confidence = 'low'
      } else if (classification === 'uncertain') {
        confidence = 'low'
      }

      rawCandidates.push({
        ruleId: rule.id,
        ruleVersion: rule.version,
        classification,
        confidence,
        start,
        end,
        lineStart,
        lineEnd,
        value,
      })
    }
  }

  if (rawCandidates.length <= 1) return rawCandidates

  // Deduplicate exact identical candidates (same ruleId, start, end)
  // Drop broad fallback duplicates when a specific higher-priority rule matched the token span
  const isBroadRule = (ruleId: string): boolean => ruleId.endsWith('-broad') || ruleId.includes('-broad')
  const nonBroad = rawCandidates.filter((c) => !isBroadRule(c.ruleId))
  const filteredCandidates = rawCandidates.filter((c) => {
    if (isBroadRule(c.ruleId)) {
      return !nonBroad.some((other) => other.start <= c.start && other.end >= c.end)
    }
    return true
  })

  // Preserve all overlapping candidates so redactor can compute full union spans
  filteredCandidates.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start
    return a.end - b.end
  })

  const results: SecretCandidate[] = []
  const seen = new Set<string>()
  for (const candidate of filteredCandidates) {
    const key = `${candidate.ruleId}:${candidate.start}:${candidate.end}`
    if (seen.has(key)) continue
    seen.add(key)
    results.push(candidate)
  }

  return results
}
