'use client'

import { useState } from 'react'
import {
  ChevronDown,
  ExternalLink,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  Shield,
  FileSearch,
} from 'lucide-react'
import type { Finding, Language, RepoScanResult } from '@/lib/types/report'
import { redactSecrets } from '@/lib/security/redact'
import { getSafeGitHubUrl } from './RepoFindingCard'
import styles from './results-hall.module.css'

export type SecurityClassification = 'secret' | 'hotspot'

// Explicit credential detection rule inventory from lib/security/secrets/patterns.ts
const CREDENTIAL_RULE_IDS = new Set([
  // GitHub
  'github-pat',
  'github-fine-grained-pat',
  'github-oauth',
  'github-app-token',
  'github-refresh-token',
  'github-token-broad',
  // Stripe
  'stripe-secret-key',
  'stripe-webhook-secret',
  // Slack
  'slack-bot-token',
  'slack-user-token',
  'slack-app-token',
  'slack-config-access-token',
  'slack-config-refresh-token',
  'slack-legacy-workspace-token',
  'slack-webhook-url',
  'slack-token-broad',
  // OpenAI
  'openai-api-key',
  // Anthropic
  'anthropic-api-key',
  'anthropic-admin-api-key',
  // AWS (note: aws-access-key-id is an identifier hotspot, NOT a private secret)
  'aws-secret-access-key',
  'aws-bedrock-api-key-long-lived',
  'aws-bedrock-api-key-short-lived',
  // Google & GCP
  'gcp-api-key',
  'google-service-account-key',
  // PEM Keys
  'private-key-block',
  'private-key-escaped',
  // Supabase
  'supabase-secret',
  'supabase-pat',
  // Database URLs
  'database-url-credentials',
  // JWT
  'jwt-signing-secret',
  'jwt-bearer-token',
  // Generic Credential Assignment
  'generic-credential-assignment',
])

const EXPLICIT_HOTSPOT_RULE_IDS = new Set([
  'aws-access-key-id',
  'cors.wildcard-credentials',
  'sec.committed-env-file',
  'sec.tracked-credential-file',
  'sec.tracked-key-file',
  'sec-committed-env-file',
  'sec-tracked-credential-file',
  'sec-tracked-key-file',
  'stripe-publishable-key',
  'supabase-publishable',
  'public-key-certificate',
])

export function classifySecurityFinding(finding: Finding): SecurityClassification {
  const ruleId = (finding.security?.ruleId ?? '').toLowerCase().trim()

  // 1. Explicit hotspot rules that MUST be hotspots (never private secrets)
  // Filename rules, CORS wildcard credentials, AWS identifier, publishable keys
  if (ruleId && EXPLICIT_HOTSPOT_RULE_IDS.has(ruleId)) {
    return 'hotspot'
  }

  // 2. Exact match against backend credential detection rule inventory
  if (ruleId && CREDENTIAL_RULE_IDS.has(ruleId)) {
    return 'secret'
  }

  // 3. Qualified fallback for legacy or synthesized finding IDs
  const findingId = finding.id.toLowerCase()
  if (
    findingId.includes('aws-access-key-id') ||
    findingId.includes('committed-env-file') ||
    findingId.includes('tracked-credential-file') ||
    findingId.includes('tracked-key-file') ||
    findingId.includes('cors.wildcard-credentials')
  ) {
    return 'hotspot'
  }

  if (findingId.startsWith('sec-hardcoded-secret-')) {
    for (const credRule of CREDENTIAL_RULE_IDS) {
      if (findingId.includes(credRule)) {
        return 'secret'
      }
    }
  }

  // Check if finding.id itself is a recognized credential rule ID (e.g. synthetic fixtures)
  for (const credRule of CREDENTIAL_RULE_IDS) {
    if (findingId.startsWith(credRule)) {
      return 'secret'
    }
  }

  // 4. Broad unknown rules default to hotspot, NOT secret
  return 'hotspot'
}

interface RepoSecurityProps {
  scan: RepoScanResult
  language: Language
}

export function RepoSecurity({ scan, language }: RepoSecurityProps) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const id = language === 'id'
  const t = (en: string, indo: string) => (id ? indo : en)

  const { owner, repo, sha } = scan

  // Merge dedicated security findings with any categorized findings
  const securityFindings: Finding[] = (
    scan.securityFindings && scan.securityFindings.length > 0
      ? scan.securityFindings
      : scan.findings.filter((f) => f.category === 'Security')
  )

  const secretsCount = securityFindings.filter(
    (f) => classifySecurityFinding(f) === 'secret'
  ).length
  const hotspotsCount = securityFindings.filter(
    (f) => classifySecurityFinding(f) === 'hotspot'
  ).length

  const coverage = scan.securityCoverage
  const staticCov = scan.staticCoverage
  const omittedCount =
    scan.omittedSecurityFindings ??
    coverage?.omittedSecurityFindings ??
    coverage?.findingsSummary?.omitted ??
    0

  const totalFindingsCount =
    scan.totalSecurityFindings ??
    coverage?.totalSecurityFindings ??
    coverage?.findingsSummary?.total ??
    (securityFindings.length + omittedCount)

  return (
    <section
      className={styles.securityPanel}
      data-testid="repo-security-panel"
      aria-labelledby="security-focus-heading"
    >
      {/* 1. Header & Strict Non-Grade Disclaimer */}
      <div className={styles.securityNoticeBox}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <Shield size={18} color="#f59e0b" aria-hidden="true" />
          <h3
            id="security-focus-heading"
            className="mono"
            style={{ margin: 0, fontSize: '13px', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.05em' }}
          >
            {t('SourceSanity Security Focus', 'Fokus Keamanan SourceSanity')}
          </h3>
        </div>
        <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.5, color: '#d4d0c7' }}>
          {t(
            'Security observations are prioritized separately from styling, architecture, and comedy issue-density. The Roast Heat score is not an audit grade or security certification.',
            'Pengamatan keamanan diprioritaskan secara terpisah dari gaya, arsitektur, dan skor komedi. Nilai Roast Heat bukan nilai audit atau sertifikasi keamanan.'
          )}
        </p>
      </div>

      {/* 2. Key Triage Counters */}
      <div className={styles.securityMetrics}>
        <div className={styles.securityMetricCard} data-testid="metric-total-findings">
          <strong>{totalFindingsCount}</strong>
          <small>{t('Total Security Findings', 'Total Temuan Keamanan')}</small>
          {omittedCount > 0 && (
            <span
              style={{ fontSize: '10px', color: '#888', marginTop: '2px', display: 'block' }}
              data-testid="admitted-omitted-indicator"
            >
              {t(
                `${securityFindings.length} admitted · ${omittedCount} omitted`,
                `${securityFindings.length} dimuat · ${omittedCount} diabaikan`
              )}
            </span>
          )}
        </div>
        <div className={styles.securityMetricCard} data-testid="metric-exposed-secrets">
          <strong style={{ color: secretsCount > 0 ? 'var(--red)' : 'inherit' }}>
            {secretsCount}
          </strong>
          <small>{t('Potential Exposed Secrets', 'Potensi Rahasia Terbuka')}</small>
        </div>
        <div className={styles.securityMetricCard} data-testid="metric-security-hotspots">
          <strong style={{ color: hotspotsCount > 0 ? '#b45309' : 'inherit' }}>
            {hotspotsCount}
          </strong>
          <small>{t('Security Hotspots', 'Titik Rawan Keamanan')}</small>
        </div>
        <div className={styles.securityMetricCard} data-testid="metric-files-checked">
          <strong>
            {coverage ? `${coverage.filesInspected}/${coverage.filesDiscovered}` : t('Legacy', 'Versi Lama')}
          </strong>
          <small>{t('Files Inspected For Secrets', 'Berkas Diperiksa Untuk Rahasia')}</small>
        </div>
      </div>

      {/* 3. Coverage, Limits & Status Breakdown */}
      {!coverage ? (
        <div className="notice" data-testid="legacy-security-coverage" role="status">
          <p style={{ margin: 0, fontSize: '12px' }}>
            {t(
              'Security coverage not available (legacy report — scope was not checked for secrets).',
              'Cakupan keamanan tidak tersedia (laporan versi lama — cakupan tidak diperiksa untuk rahasia).'
            )}
          </p>
        </div>
      ) : (
        <div className={styles.securityCoverageBox} data-testid="security-coverage-details">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', borderBottom: '1px solid #444', paddingBottom: '8px', marginBottom: '10px' }}>
            <span className="mono" style={{ color: '#4ade80', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileSearch size={14} /> {t('Secret Inspection Scope & Budget', 'Cakupan & Anggaran Pemeriksaan Rahasia')}
            </span>
            <span className="mono" style={{ fontSize: '11px', color: '#aaa' }}>
              {(coverage.bytesInspected / 1024).toFixed(1)} KiB / {(coverage.caps.maxBytesTotal / 1024).toFixed(0)} KiB ({t('cap', 'maks')}: {coverage.caps.maxFiles} {t('files', 'berkas')}, {coverage.caps.timeoutMs / 1000}s)
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', fontSize: '11px', marginBottom: '8px' }}>
            <div>
              <span style={{ color: '#888' }}>{t('Inspected', 'Diperiksa')}:</span>{' '}
              <b style={{ color: '#4ade80' }}>{coverage.statusCounts?.inspected ?? coverage.counts?.inspected ?? 0}</b>
            </div>
            <div>
              <span style={{ color: '#888' }}>{t('Filename-only', 'Hanya Nama')}:</span>{' '}
              <span>{coverage.statusCounts?.['filename-only'] ?? coverage.counts?.filenameOnly ?? 0}</span>
            </div>
            <div>
              <span style={{ color: '#888' }}>{t('Skipped (policy)', 'Dilewati (kebijakan)')}:</span>{' '}
              <span>{coverage.statusCounts?.['skipped-policy'] ?? coverage.counts?.skippedPolicy ?? 0}</span>
            </div>
            <div>
              <span style={{ color: '#888' }}>{t('Skipped (budget)', 'Dilewati (anggaran)')}:</span>{' '}
              <span>{coverage.statusCounts?.['skipped-budget'] ?? coverage.counts?.skippedBudget ?? 0}</span>
            </div>
            <div>
              <span style={{ color: '#888' }}>{t('Oversized', 'Terlalu Besar')}:</span>{' '}
              <span>{coverage.statusCounts?.oversized ?? coverage.counts?.oversized ?? 0}</span>
            </div>
            <div>
              <span style={{ color: '#888' }}>{t('Unavailable', 'Tidak Dapat Dibaca')}:</span>{' '}
              <span>{coverage.statusCounts?.unavailable ?? coverage.counts?.unavailable ?? 0}</span>
            </div>
          </div>

          {/* Scope warning badges */}
          {(coverage.treeTruncated || coverage.contentTruncated || coverage.budgetExceeded || coverage.deadlineExceeded || coverage.unknownRemaining) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
              {coverage.treeTruncated && (
                <span className="mono" style={{ background: '#3a2e12', color: '#fef08a', border: '1px solid #facc15', padding: '2px 6px', borderRadius: '3px', fontSize: '10px' }}>
                  ⚠ {t('Tree budget reached (truncated)', 'Batas pohon tercapai (terpotong)')}
                </span>
              )}
              {coverage.deadlineExceeded && (
                <span className="mono" style={{ background: '#3a2e12', color: '#fef08a', border: '1px solid #facc15', padding: '2px 6px', borderRadius: '3px', fontSize: '10px' }}>
                  ⚠ {t('Inspection timeout reached', 'Batas waktu inspeksi tercapai')}
                </span>
              )}
              {(() => {
                if (!coverage.contentTruncated && !coverage.budgetExceeded) return null
                const isByteCap = coverage.bytesInspected >= coverage.caps.maxBytesTotal
                const filesAttempted = coverage.filesAttempted ?? coverage.attemptsCount ?? coverage.filesInspected
                const fileCap = coverage.caps.maxAttempts ?? coverage.caps.maxFiles
                const isFileCap = filesAttempted >= fileCap

                if (isByteCap) {
                  return (
                    <span className="mono" style={{ background: '#3a2e12', color: '#fef08a', border: '1px solid #facc15', padding: '2px 6px', borderRadius: '3px', fontSize: '10px' }}>
                      ⚠ {t('Content byte budget reached', 'Batas anggaran byte terlampaui')}
                    </span>
                  )
                }
                if (isFileCap) {
                  return (
                    <span className="mono" style={{ background: '#3a2e12', color: '#fef08a', border: '1px solid #facc15', padding: '2px 6px', borderRadius: '3px', fontSize: '10px' }}>
                      ⚠ {t('File attempt limit reached', 'Batas percobaan berkas tercapai')}
                    </span>
                  )
                }
                return (
                  <span className="mono" style={{ background: '#3a2e12', color: '#fef08a', border: '1px solid #facc15', padding: '2px 6px', borderRadius: '3px', fontSize: '10px' }}>
                    ⚠ {t('Incomplete content inspection (limited scope)', 'Pemeriksaan konten tidak lengkap (cakupan terbatas)')}
                  </span>
                )
              })()}
              {coverage.unknownRemaining && (
                <span className="mono" style={{ background: '#3a2e12', color: '#fef08a', border: '1px solid #facc15', padding: '2px 6px', borderRadius: '3px', fontSize: '10px' }}>
                  ⚠ {t('Uninspected tree remainder', 'Sisa berkas pohon belum diperiksa')}
                </span>
              )}
            </div>
          )}

          {omittedCount > 0 && (
            <p style={{ margin: '8px 0 0', color: '#f59e0b', fontSize: '11px' }}>
              {t(
                `(${omittedCount} security findings omitted due to analysis caps)`,
                `(${omittedCount} temuan keamanan diabaikan karena batas kapasitas)`
              )}
            </p>
          )}

          {/* Optional Static Analysis Coverage */}
          {staticCov && (
            <div style={{ borderTop: '1px solid #333', marginTop: '10px', paddingTop: '8px', fontSize: '11px' }}>
              <span style={{ color: '#888' }}>{t('Static Parsing Scope', 'Cakupan Parsing Statis')}:</span>{' '}
              <span>
                {staticCov.filesParsed}/{staticCov.filesAttempted} {t('parsed', 'diparsing')} ({staticCov.filesPartial} {t('partial', 'parsial')}, {staticCov.filesUnsupported} {t('unsupported', 'tidak didukung')})
              </span>
            </div>
          )}
        </div>
      )}

      {/* 4. Findings List OR Clean Copy */}
      {securityFindings.length === 0 ? (
        !coverage ? (
          <div className="notice" data-testid="legacy-unassessed-security" role="status">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Shield size={18} color="#a8a29e" aria-hidden="true" />
              <b style={{ color: 'var(--ink)' }}>
                {t('Security analysis not assessed in this legacy report.', 'Analisis keamanan tidak dinilai dalam laporan versi lama ini.')}
              </b>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#716c65' }}>
              {t(
                'This repository scan was generated prior to security inspection coverage. Rescan the repository to run secret and credential detection.',
                'Pemindaian repositori ini dibuat sebelum cakupan inspeksi keamanan tersedia. Pindai ulang repositori untuk menjalankan deteksi rahasia dan kredensial.'
              )}
            </p>
          </div>
        ) : coverage.filesInspected === 0 ? (
          <div className="notice" data-testid="zero-scope-security-notice" role="status">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Shield size={18} color="#a8a29e" aria-hidden="true" />
              <b style={{ color: 'var(--ink)' }}>
                {t('No files were inspected for security findings.', 'Tidak ada berkas yang diperiksa untuk temuan keamanan.')}
              </b>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#716c65' }}>
              {t(
                'Inspection scope was zero files. Security status is unknown and cannot be reported as clean.',
                'Cakupan inspeksi nol berkas. Status keamanan tidak diketahui dan tidak dapat dilaporkan sebagai bersih.'
              )}
            </p>
          </div>
        ) : (
          <div className="notice" data-testid="no-security-findings" role="status">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={18} color="var(--green)" aria-hidden="true" />
              <b style={{ color: 'var(--ink)' }}>
                {t('No security findings detected in the inspected scope.', 'Tidak ada temuan keamanan yang terdeteksi dalam cakupan yang diperiksa.')}
              </b>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#716c65' }}>
              {t(
                'Zero exposed credentials or recognized security hotspots were detected within the inspected files and budget limit. This is not a complete guarantee of zero security defects; review coverage constraints above.',
                'Nol kredensial terbuka atau titik rawan keamanan yang terdeteksi dalam berkas dan batas anggaran yang diperiksa. Ini bukan jaminan ketiadaan cacat keamanan; periksa batasan cakupan di atas.'
              )}
            </p>
          </div>
        )
      ) : (
        <div className="finding-list" data-testid="security-findings-list">
          {securityFindings.map((finding, index) => {
            const classification = classifySecurityFinding(finding)
            const isSecret = classification === 'secret'
            const open = expanded === finding.id
            const safeTitle = redactSecrets(finding.title)
            const safeDescription = redactSecrets(finding.description)
            const safeObservation = finding.security?.observation
              ? redactSecrets(finding.security.observation)
              : safeDescription
            const safeEvidence = finding.evidence.map((ev) => redactSecrets(ev))
            const safeLocation = redactSecrets(finding.location)
            const safeRecommendation = redactSecrets(finding.recommendation)
            const safePossibleImpact = finding.security?.possibleImpact
              ? redactSecrets(finding.security.possibleImpact)
              : null
            const safeCoverageLimitations = finding.security?.coverageLimitations
              ? redactSecrets(finding.security.coverageLimitations)
              : null
            const githubUrl = getSafeGitHubUrl(owner, repo, sha, finding)

            const verificationLabel =
              finding.verification === 'verified'
                ? t('VERIFIED', 'TERVERIFIKASI')
                : finding.verification === 'heuristic'
                ? t('HEURISTIC · REVIEW', 'HEURISTIK · TINJAU')
                : t('INCONCLUSIVE', 'BELUM PASTI')

            return (
              <div
                className={`finding ${open ? 'open' : ''}`}
                data-verification={finding.verification}
                data-classification={classification}
                data-testid={`security-finding-${finding.id}`}
                key={finding.id}
              >
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={`security-detail-${finding.id}`}
                  onClick={() => setExpanded(open ? null : finding.id)}
                >
                  <span className="finding-num">{String(index + 1).padStart(2, '0')}</span>
                  <span className="finding-title">
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span className={isSecret ? styles.securityBadgeSecret : styles.securityBadgeHotspot}>
                        {isSecret ? (
                          <>
                            <KeyRound size={11} aria-hidden="true" /> {t('POTENTIAL EXPOSED SECRET', 'POTENSI RAHASIA TERBUKA')}
                          </>
                        ) : (
                          <>
                            <ShieldAlert size={11} aria-hidden="true" /> {t('SECURITY HOTSPOT', 'TITIK RAWAN KEAMANAN')}
                          </>
                        )}
                      </span>
                      <span>{safeTitle}</span>
                    </span>
                    <span className={`finding-meta ${styles.findingMeta}`}>
                      <span>
                        {t('Confidence', 'Keyakinan')}:{' '}
                        {finding.confidence === 'high'
                          ? t('high', 'tinggi')
                          : finding.confidence === 'medium'
                          ? t('medium', 'sedang')
                          : t('low', 'rendah')}
                      </span>
                      <span className={styles.verification}>{verificationLabel}</span>
                      {finding.security?.ruleId && (
                        <span className="mono" style={{ fontSize: '10px', color: '#686158' }}>
                          rule: {finding.security.ruleId}
                          {finding.security.ruleVersion ? ` (v${finding.security.ruleVersion})` : ''}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className={`severity ${finding.severity}`}>
                    {finding.severity === 'high'
                      ? t('HIGH', 'TINGGI')
                      : finding.severity === 'medium'
                      ? t('MEDIUM', 'SEDANG')
                      : t('LOW', 'RENDAH')}
                  </span>
                  <ChevronDown aria-hidden="true" />
                </button>

                {open && (
                  <div id={`security-detail-${finding.id}`} className="finding-detail">
                    {/* Column 1: Observation & Location */}
                    <div>
                      <small>{t('SECURITY OBSERVATION', 'PENGAMATAN KEAMANAN')}</small>
                      <h4 style={{ margin: '4px 0 8px', fontSize: '15px' }}>{safeTitle}</h4>
                      <p>{safeObservation}</p>
                      <p className="report-url">
                        <b>{t('Location', 'Lokasi')}:</b>{' '}
                        {githubUrl ? (
                          <a
                            href={githubUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            title={t('Open exact file & line on GitHub at inspected commit', 'Buka berkas & baris persis di GitHub pada commit yang diperiksa')}
                          >
                            <code>{safeLocation}</code> <ExternalLink size={12} />
                          </a>
                        ) : (
                          <code>{safeLocation}</code>
                        )}
                      </p>
                      <p className="muted" style={{ fontSize: '11px' }}>
                        {t('Rule', 'Aturan')}: <code>{finding.security?.ruleId ?? finding.id}</code> · {t('Commit', 'Commit')}: <code>{sha.slice(0, 7)}</code>
                      </p>
                    </div>

                    {/* Column 2: Masked Evidence & Scope */}
                    <div>
                      <small>{t('MASKED EVIDENCE', 'BUKTI TERMASKING')}</small>
                      <p className={styles.verificationNote}>
                        <b>{verificationLabel}</b>
                        <br />
                        {finding.verification === 'verified'
                          ? t('Directly detected pattern. Credentials redacted defensively.', 'Pola terdeteksi langsung. Kredensial diredaksi secara defensif.')
                          : t('Heuristic pattern match. Review context before rotation.', 'Pencocokan heuristik. Tinjau konteks sebelum rotasi.')}
                      </p>
                      <ul style={{ fontFamily: 'monospace', fontSize: '11px', listStyle: 'none', margin: 0, padding: 0 }}>
                        {safeEvidence.map((ev, i) => (
                          <li
                            key={i}
                            style={{
                              padding: '4px 6px',
                              background: '#20201e',
                              color: '#f5f1e8',
                              borderRadius: '3px',
                              marginBottom: '4px',
                              wordBreak: 'break-all',
                            }}
                          >
                            {ev}
                          </li>
                        ))}
                      </ul>
                      {safeCoverageLimitations && (
                        <div style={{ marginTop: '10px', fontSize: '11px', color: '#716c65' }}>
                          <b>{t('Limitations', 'Batasan')}:</b> {safeCoverageLimitations}
                        </div>
                      )}
                    </div>

                    {/* Column 3: Remediation & Impact */}
                    <div className="fix">
                      <small>{t('REMEDIATION PRIORITY', 'PRIORITAS PERBAIKAN')}</small>
                      <p style={{ fontWeight: 600 }}>{safeRecommendation}</p>
                      {safePossibleImpact && (
                        <div style={{ marginTop: '10px', fontSize: '11px', color: '#716c65' }}>
                          <b>{t('Possible Impact', 'Dampak Potensial')}:</b> {safePossibleImpact}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
