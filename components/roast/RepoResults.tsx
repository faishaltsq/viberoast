'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, ExternalLink, GitBranch, RotateCcw, Star, GitFork } from 'lucide-react'
import type { Language, RepositoryReport } from '@/lib/types/report'
import { calculateScore } from '@/lib/roast/score'
import { downloadShareCard, shareText } from '@/lib/share/card'
import { Mascot } from '@/components/bro-code/mascot'
import { SectionLabel } from '@/components/shared/primitives'
import { RepoVerdict } from './RepoVerdict'
import { RepoEvidence } from './RepoEvidence'
import { RepoFindingCard } from './RepoFindingCard'
import styles from './results-hall.module.css'

interface RepoResultsProps {
  report: RepositoryReport
  language: Language
  fixes: () => void
  home: () => void
  rescan: () => void
  scanning?: boolean
}

export function RepoResults({
  report,
  language,
  fixes,
  home,
  rescan,
  scanning = false,
}: RepoResultsProps) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [sharing, setSharing] = useState<'square' | 'landscape' | null>(null)
  const [expiredAt, setExpiredAt] = useState<string | null>(() => Date.parse(report.expiresAt) <= Date.now() ? report.expiresAt : null)
  const expired = expiredAt === report.expiresAt
  const id = language === 'id'
  const t = (en: string, indo: string) => (id ? indo : en)

  const scan = report.repoScan
  const score = calculateScore(scan.findings)
  const commentary = report.commentary
  const reaction = commentary?.verdict.reaction ?? 'suspicious'
  const isPartial = scan.coverage.treeTruncated || scan.coverage.contentTruncated

  useEffect(() => {
    const remaining = Math.max(0, Date.parse(report.expiresAt) - Date.now())
    const timer = window.setTimeout(() => setExpiredAt(report.expiresAt), remaining)
    return () => clearTimeout(timer)
  }, [report.expiresAt])

  const exportCard = async (format: 'square' | 'landscape') => {
    if (sharing) return
    setSharing(format)
    try {
      await downloadShareCard(report, format, language)
    } finally {
      setSharing(null)
    }
  }

  const repoPermaUrl = `https://github.com/${scan.owner}/${scan.repo}/tree/${scan.sha}`

  return (
    <div className={`results-page container ${styles.results}`} data-testid="repo-results">
      <button className="back-link" onClick={home} data-testid="back-to-home">
        {t('← Back to the landing page', '← Kembali ke beranda')}
      </button>

      <div className="results-header">
        <div>
          <SectionLabel>
            {isPartial
              ? t('PARTIAL REPOSITORY SCAN', 'PEMINDAIAN REPOSITORI PARSIAL')
              : t('INSPECTION COMPLETE', 'INSPEKSI SELESAI')}
          </SectionLabel>
          <h1>
            {t('Here’s what Bro Code ', 'Ini pendapat Bro Code ')}
            <em>{t('really', 'sebenarnya')}</em>
            {t(' thinks of your code.', ' tentang kodemu.')}
          </h1>
          <p className="muted report-url" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span>{t('Repository', 'Repositori')}:</span>
            <a
              href={repoPermaUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontWeight: 800, color: 'var(--ink)', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <GitBranch size={16} /> {scan.owner}/{scan.repo} <ExternalLink size={12} />
            </a>
            <span>· {report.intensity}</span>
          </p>
          <p className="muted" style={{ fontSize: '13px' }}>
            <span>{t('Commit', 'Commit')}: <code>{scan.sha.slice(0, 7)}</code> ({scan.defaultBranch})</span>
            {scan.stargazerCount != null && scan.stargazerCount > 0 && (
              <span style={{ marginLeft: '10px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <Star size={12} /> {scan.stargazerCount}
              </span>
            )}
            {scan.forkCount != null && scan.forkCount > 0 && (
              <span style={{ marginLeft: '8px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <GitFork size={12} /> {scan.forkCount}
              </span>
            )}
            {scan.commitMessage && (
              <span style={{ display: 'block', marginTop: '4px', fontStyle: 'italic' }}>
                &ldquo;{scan.commitMessage.slice(0, 100)}&rdquo;
              </span>
            )}
          </p>
        </div>
        <Mascot small language={language} state={reaction} />
      </div>

      {report.aiStatus === 'unavailable' && (
        <div className="notice scanner-only" role="status">
          <b>{t('Static analysis report. AI roast unavailable.', 'Laporan analisis statis. Roasting AI tidak tersedia.')}</b>
          <p>
            {report.aiMessage ??
              t(
                'The findings below are verified static analysis results. No AI verdict has been fabricated.',
                'Temuan di bawah adalah hasil analisis statis terverifikasi. Kami tidak mengarang vonis AI.'
              )}
          </p>
        </div>
      )}

      {expired && (
        <aside className="notice" role="status">
          <h2>{t('Temporary report expired', 'Laporan sementara sudah kedaluwarsa')}</h2>
          <p>
            {t(
              'This snapshot’s temporary availability window has ended. Evidence already loaded remains available. Rescan to check current commit.',
              'Masa ketersediaan laporan ini sudah berakhir. Bukti yang sudah dimuat tetap dapat dilihat. Nilai ulang untuk commit terkini.'
            )}
          </p>
          <button className="outline-btn" disabled={scanning} onClick={rescan}>
            {scanning ? t('Inspecting…', 'Memeriksa…') : t('Inspect fresh report', 'Periksa laporan baru')}
          </button>
        </aside>
      )}

      {scan.warnings.length > 0 && (
        <aside className="notice" aria-labelledby="repo-warnings">
          <h2 id="repo-warnings">{t('Analysis limitations', 'Batasan analisis')}</h2>
          <ul>
            {scan.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </aside>
      )}

      <div className="results-grid" style={{ gridTemplateColumns: 'minmax(320px, 1.2fr) minmax(280px, 1fr)', gap: '24px' }}>
        <RepoEvidence scan={scan} language={language} />
        <RepoVerdict report={report} language={language} />
      </div>

      <div className="findings-head" style={{ marginTop: '40px' }}>
        <div>
          <SectionLabel>{t('THE CODE RECEIPTS', 'BUKTI KODE')}</SectionLabel>
          <h2>
            {t('Code findings', 'Temuan kode')} <span>({scan.findings.length})</span>
          </h2>
        </div>
        <button className="dark-btn" onClick={fixes} data-testid="repo-fix-my-shame-btn">
          {t('Fix my shame', 'Bantu perbaiki')} <ArrowRight />
        </button>
      </div>

      {!scan.findings.length && (
        <p className="notice">
          {t(
            'No high-priority findings discovered in the inspected files. This is not a complete guarantee of zero bugs; check coverage limitations above.',
            'Tidak ada temuan berprioritas tinggi dalam berkas yang diperiksa. Ini bukan jaminan tanpa bug; periksa batasan cakupan di atas.'
          )}
        </p>
      )}

      <div className="finding-list">
        {scan.findings.map((finding, index) => (
          <RepoFindingCard
            key={finding.id}
            finding={finding}
            index={index}
            owner={scan.owner}
            repo={scan.repo}
            sha={scan.sha}
            commentary={report.commentary}
            expanded={expanded === finding.id}
            onToggle={() => setExpanded(expanded === finding.id ? null : finding.id)}
            language={language}
          />
        ))}
      </div>

      <section className="scan-strengths">
        <SectionLabel>{t('SOLID ENGINEERING PRACTICES', 'PRAKTIK REKAYASA YANG BAIK')}</SectionLabel>
        <h2>{t('Observed strengths', 'Kelebihan yang diamati')}</h2>
        {scan.strengths.length ? (
          <ul>
            {scan.strengths.map((strength, index) => (
              <li key={index}>{strength}</li>
            ))}
          </ul>
        ) : (
          <p>{t('No explicit strengths recorded within the inspected files.', 'Belum ada kelebihan yang tercatat dalam berkas yang diperiksa.')}</p>
        )}
        {report.commentary?.overallSummary && <p>{report.commentary.overallSummary}</p>}
      </section>

      <div className="meter-card">
        <div>
          <SectionLabel>{t('CODE ISSUE-DENSITY INDICATOR', 'INDIKATOR KEPADATAN MASALAH KODE')}</SectionLabel>
          <h2>{t('Roast heat. Not an audit grade.', 'Panas roasting. Bukan nilai audit.')}</h2>
          <p className="muted">
            {t(
              'High / medium / low: 12 / 6 / 2 points across static checks (maintainability, dependencies, testing, CI, security, structure). Higher means more observed issues.',
              'Tinggi / sedang / rendah: 12 / 6 / 2 poin dari pemeriksaan statis (pemeliharaan, dependensi, pengujian, CI, keamanan, struktur). Nilai lebih tinggi berarti lebih banyak temuan.'
            )}
          </p>
        </div>
        <div className="meter-score">
          <strong>{score}</strong>
          <span>/100</span>
          <div className="meter-line" aria-hidden="true">
            <i style={{ width: `${score}%` }} />
          </div>
        </div>
      </div>

      <section className="share-actions" aria-busy={sharing !== null}>
        <h2>{t('Share the roast. Keep the code safe.', 'Bagikan roastingnya. Kode tetap aman.')}</h2>
        <p className="muted" id="repo-share-privacy">
          {t(
            'The terminal share card includes repository name, commit SHA, and top findings with redacted secrets. X opens pre-filled text only; nothing is published automatically.',
            'Kartu terminal menyertakan nama repositori, commit SHA, dan temuan utama tanpa rahasia. X hanya membuka teks; tidak ada yang dipublikasikan otomatis.'
          )}
        </p>
        <div className="button-row">
          <button
            className="outline-btn"
            disabled={sharing !== null}
            aria-describedby="repo-share-privacy"
            onClick={() => exportCard('square')}
            data-testid="download-square-png"
          >
            {sharing === 'square' ? t('Preparing square PNG…', 'Menyiapkan PNG persegi…') : t('Download square PNG', 'Unduh PNG persegi')}
          </button>
          <button
            className="outline-btn"
            disabled={sharing !== null}
            aria-describedby="repo-share-privacy"
            onClick={() => exportCard('landscape')}
            data-testid="download-landscape-png"
          >
            {sharing === 'landscape' ? t('Preparing landscape PNG…', 'Menyiapkan PNG lanskap…') : t('Download landscape PNG', 'Unduh PNG lanskap')}
          </button>
          <a
            className="outline-btn"
            aria-describedby="repo-share-privacy"
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText(report, language))}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('Share text on X', 'Bagikan teks di X')}
          </a>
          <button className="dark-btn" disabled={scanning} onClick={rescan}>
            <RotateCcw />
            {scanning ? t('Inspecting…', 'Memeriksa…') : t('Re-judge this repository', 'Nilai ulang repositori ini')}
          </button>
        </div>
      </section>
    </div>
  )
}
