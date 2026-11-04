'use client'

import { ExternalLink, ChevronDown } from 'lucide-react'
import type { Commentary, Finding, Language } from '@/lib/types/report'
import { redactSecrets } from '@/lib/security/redact'
import styles from './results-hall.module.css'

export function getSafeGitHubUrl(
  owner: string,
  repo: string,
  sha: string,
  finding: Finding
): string | null {
  // Validate owner, repo, sha: pinned ref only (40 hex chars)
  if (!/^[a-zA-Z0-9_.-]+$/.test(owner) || !/^[a-zA-Z0-9_.-]+$/.test(repo)) {
    return null
  }
  if (!/^[0-9a-fA-F]{40}$/.test(sha)) {
    return null
  }

  // Finding source must be repository if specified
  if (finding.source && finding.source !== 'repository') {
    return null
  }

  // Extract raw path from security metadata or location
  const rawPath = (
    finding.security?.filePath ??
    (finding as { filePath?: string }).filePath ??
    finding.location.split(':')[0]
  )?.trim()

  if (!rawPath || rawPath === '.' || rawPath === '/' || rawPath.endsWith('/')) {
    return null
  }

  // Normalize leading ./
  const cleanPath = rawPath.replace(/^\.\//, '')
  if (
    !cleanPath ||
    cleanPath.includes('..') ||
    cleanPath.startsWith('http://') ||
    cleanPath.startsWith('https://')
  ) {
    return null
  }

  // Virtual root or non-file location identifiers
  const lowerPath = cleanPath.toLowerCase()
  if (lowerPath === 'repo root' || lowerPath === 'repository' || lowerPath === 'root' || lowerPath === 'head') {
    return null
  }

  // Defensive credential / redaction marker checks:
  // Reject if path contains [redacted] (case-insensitive) or if redactSecrets changes it
  if (/\[redacted\]/i.test(cleanPath) || redactSecrets(cleanPath) !== cleanPath) {
    return null
  }

  // Also check if URI-decoded path reveals any credentials or redactions
  try {
    const decoded = decodeURIComponent(cleanPath)
    if (/\[redacted\]/i.test(decoded) || redactSecrets(decoded) !== decoded) {
      return null
    }
  } catch {
    return null
  }

  // Line range formatting: #L12-L14 or #L12
  const lineStart = finding.security?.lineStart ?? (finding as { lineStart?: number }).lineStart
  const lineEnd = finding.security?.lineEnd ?? (finding as { lineEnd?: number }).lineEnd
  let lineHash = ''

  if (lineStart != null && lineEnd != null) {
    lineHash = lineStart === lineEnd ? `#L${lineStart}` : `#L${lineStart}-L${lineEnd}`
  } else if (lineStart != null) {
    lineHash = `#L${lineStart}`
  } else {
    const locMatch = finding.location.match(/:(\d+)(?:-(\d+))?$/)
    if (locMatch && locMatch[1]) {
      const s = locMatch[1]
      const e = locMatch[2]
      lineHash = e && e !== s ? `#L${s}-L${e}` : `#L${s}`
    }
  }

  // Encode each segment with encodeURIComponent to safely preserve #, ?, spaces, etc.
  const encodedPath = cleanPath
    .split('/')
    .map(encodeURIComponent)
    .join('/')

  return `https://github.com/${owner}/${repo}/blob/${sha}/${encodedPath}${lineHash}`
}

interface RepoFindingCardProps {
  finding: Finding
  index: number
  owner: string
  repo: string
  sha: string
  commentary?: Commentary | null
  expanded: boolean
  onToggle: () => void
  language: Language
}

export function RepoFindingCard({
  finding,
  index,
  owner,
  repo,
  sha,
  commentary,
  expanded,
  onToggle,
  language,
}: RepoFindingCardProps) {
  const id = language === 'id'
  const t = (en: string, indo: string) => (id ? indo : en)

  const commentaryItem = commentary?.findings.find((item: Commentary['findings'][number]) =>
    item.evidenceIds.includes(finding.id)
  )

  const verification =
    finding.verification === 'verified'
      ? t('VERIFIED', 'TERVERIFIKASI')
      : finding.verification === 'heuristic'
      ? t('HEURISTIC · REVIEW', 'HEURISTIK · TINJAU')
      : t('INCONCLUSIVE', 'BELUM PASTI')

  const verificationNote =
    finding.verification === 'verified'
      ? t('Directly detected in source code or configuration files.', 'Terdeteksi langsung pada kode sumber atau berkas konfigurasi.')
      : finding.verification === 'heuristic'
      ? t('Static pattern match. Review surrounding logic before refactoring.', 'Pencocokan pola statis. Tinjau logika sekitar sebelum refactor.')
      : t('Heuristic was inconclusive; investigate manually before changing.', 'Heuristik belum pasti; periksa manual sebelum mengubah kode.')

  // Parse location into path and line for GitHub permalink, defensively redacting secrets
  const safeLocation = redactSecrets(finding.location)
  const safeTitle = redactSecrets(finding.title)
  const safeDescription = redactSecrets(finding.description)
  const safeExplanation = commentaryItem?.explanation ? redactSecrets(commentaryItem.explanation) : null
  const safeRoast = commentaryItem?.roast ? redactSecrets(commentaryItem.roast) : null
  const safeRecommendation = redactSecrets(finding.recommendation)
  const safeAiRecommendation = commentaryItem?.recommendation
    ? redactSecrets(commentaryItem.recommendation)
    : null

  const githubUrl = getSafeGitHubUrl(owner, repo, sha, finding)

  return (
    <div
      className={`finding ${expanded ? 'open' : ''}`}
      data-verification={finding.verification}
      data-testid={`repo-finding-${finding.id}`}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={`finding-detail-${finding.id}`}
        onClick={onToggle}
      >
        <span className="finding-num">{String(index + 1).padStart(2, '0')}</span>
        <span className="finding-title">
          {safeRoast ?? safeTitle}
          <span className={`finding-meta ${styles.findingMeta}`}>
            <span>{finding.category}</span>
            <span>
              {t('Confidence', 'Keyakinan')}:{' '}
              {finding.confidence === 'high'
                ? t('high', 'tinggi')
                : finding.confidence === 'medium'
                ? t('medium', 'sedang')
                : t('low', 'rendah')}
            </span>
            <span className={styles.verification}>{verification}</span>
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

      {expanded && (
        <div id={`finding-detail-${finding.id}`} className="finding-detail">
          <div>
            <small>{t('OBSERVED ISSUE', 'MASALAH YANG DIAMATI')}</small>
            <h3>{safeTitle}</h3>
            <p>{safeDescription}</p>
            {safeExplanation && safeExplanation !== safeDescription && (
              <p>{safeExplanation}</p>
            )}
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
              {t('Source', 'Sumber')}: {finding.source} · ID: <code>{finding.id}</code>
            </p>
          </div>

          <div>
            <small>{t('CODE EVIDENCE', 'BUKTI KODE')}</small>
            <p className={styles.verificationNote}>
              <b>{verification}</b>
              <br />
              {verificationNote}
            </p>
            <ul style={{ fontFamily: 'monospace', fontSize: '12px' }}>
              {finding.evidence.map((evidence, i) => (
                <li key={i} style={{ wordBreak: 'break-all' }}>
                  {redactSecrets(evidence)}
                </li>
              ))}
            </ul>
          </div>

          <div className="fix">
            <small>{t('RECOMMENDED FIX', 'SARAN PERBAIKAN')}</small>
            <p>{safeRecommendation}</p>
            {safeAiRecommendation && safeAiRecommendation !== safeRecommendation && (
              <p>
                <b>{t('AI suggestion', 'Saran AI')}:</b> {safeAiRecommendation}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
