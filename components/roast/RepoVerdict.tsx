'use client'

import type { Language, RepositoryReport } from '@/lib/types/report'
import { Mascot } from '@/components/bro-code/mascot'
import styles from './results-hall.module.css'

interface RepoVerdictProps {
  report: RepositoryReport
  language: Language
}

export function RepoVerdict({ report, language }: RepoVerdictProps) {
  const id = language === 'id'
  const t = (en: string, indo: string) => (id ? indo : en)
  const commentary = report.commentary
  const scan = report.repoScan
  const noFindings = scan.findings.length === 0
  const reaction = commentary?.verdict.reaction ?? (noFindings ? 'idle' : 'suspicious')

  return (
    <div className={`verdict-card ${!commentary || noFindings ? styles.scannerVerdict : ''}`} data-testid="repo-verdict">
      <div className="verdict-top">
        {commentary
          ? t('BRO CODE’S REPO VERDICT · COMEDY', 'VONIS REPO BRO CODE · KOMEDI')
          : t('REPOSITORY ANALYSIS SUMMARY', 'RINGKASAN ANALISIS REPOSITORI')}
      </div>
      <blockquote>
        {commentary?.verdict.headline ??
          (noFindings
            ? t('Clean tree, quiet commit. Nothing caught in inspection.', 'Pohon file bersih, commit tenang. Tidak ada temuan.')
            : t('Source inspected. Evidence logged. The roast can wait.', 'Kode sumber diperiksa. Bukti dicatat. Roasting bisa menunggu.'))}
      </blockquote>
      <p>
        {commentary?.verdict.summary ??
          (noFindings
            ? t(
                'No findings were flagged within the 30 inspected files. This is not a guarantee of security or architecture soundness; review coverage.',
                'Tidak ada masalah yang ditemukan di 30 berkas yang diperiksa. Ini bukan jaminan keamanan atau arsitektur; periksa batasan cakupan.'
              )
            : t(
                `${scan.findings.length} findings recorded across ${scan.coverage.filesInspected} inspected files. Review code evidence below.`,
                `${scan.findings.length} temuan tercatat di ${scan.coverage.filesInspected} berkas yang diperiksa. Tinjau bukti kode di bawah.`
              ))}
      </p>
      {commentary && (
        <div className="nickname">
          <Mascot small state={reaction} language={language} />
          <span>
            <small>{t('DEVELOPER NICKNAME', 'JULUKAN DEVELOPER')}</small>
            <b>{commentary.verdict.developerNickname}</b>
          </span>
        </div>
      )}
    </div>
  )
}
