/**
 * Core type definitions for secret detection, classification, and redaction.
 * Browser-safe and portable with zero node-specific dependencies.
 */

export type SecretClassification =
  | 'recognized'
  | 'suspicious'
  | 'placeholder'
  | 'publishable'
  | 'uncertain'

export type SecretConfidence = 'high' | 'medium' | 'low'

export interface SecretCandidate {
  ruleId: string
  ruleVersion: string
  classification: SecretClassification
  confidence: SecretConfidence
  start: number
  end: number
  lineStart: number
  lineEnd: number
  value: string
}

export interface SecretRule {
  id: string
  version: string
  name: string
  pattern: RegExp
  defaultClassification: SecretClassification
  defaultConfidence: SecretConfidence
  extractValue?: (match: RegExpExecArray) => { value: string; start: number; end: number } | null
}
