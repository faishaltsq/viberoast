'use client'

import { ExternalLink, ChevronDown } from 'lucide-react'
import type { Commentary, Finding, Language } from '@/lib/types/report'
import styles from './results-hall.module.css'

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

  // Parse location into path and line for GitHub permalink
  const locationParts = finding.location.split(':')
  const filePath = locationParts[0]
  const lineNum = locationParts[1] ? `#L${locationParts[1]}` : ''
  const githubUrl = `https://github.com/${owner}/${repo}/blob/${sha}/${filePath}${lineNum}`

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
          {commentaryItem?.roast ?? finding.title}
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
            <h3>{finding.title}</h3>
            <p>{finding.description}</p>
            {commentaryItem?.explanation && commentaryItem.explanation !== finding.description && (
              <p>{commentaryItem.explanation}</p>
            )}
            <p className="report-url">
              <b>{t('Location', 'Lokasi')}:</b>{' '}
              <a
                href={githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--red)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                title={t('Open exact file & line on GitHub at inspected commit', 'Buka berkas & baris persis di GitHub pada commit yang diperiksa')}
              >
                <code>{finding.location}</code> <ExternalLink size={12} />
              </a>
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
                  {evidence}
                </li>
              ))}
            </ul>
          </div>

          <div className="fix">
            <small>{t('RECOMMENDED FIX', 'SARAN PERBAIKAN')}</small>
            <p>{finding.recommendation}</p>
            {commentaryItem?.recommendation && commentaryItem.recommendation !== finding.recommendation && (
              <p>
                <b>{t('AI suggestion', 'Saran AI')}:</b> {commentaryItem.recommendation}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
