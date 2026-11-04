'use client'

import type { HallCase, HallLanguage } from '@/lib/hall/types'
import { Mascot } from '@/components/bro-code/mascot'
import { Dialog } from '@/components/shared/primitives'
import styles from './hall.module.css'

export function HallCaseFileModal({
  caseItem,
  language,
  onClose,
  onLanguageChange,
}: {
  caseItem: HallCase
  language: HallLanguage
  onClose: () => void
  onLanguageChange?: (lang: HallLanguage) => void
}) {
  const isId = language === 'id'

  const mascotMood =
    caseItem.collection === 'vibes' || caseItem.comedyHeat < 40
      ? 'impressed'
      : 'disappointed'

  const localizedTarget =
    caseItem.targetKind === 'website'
      ? isId
        ? 'Situs web'
        : 'Website'
      : isId
        ? 'Repositori'
        : 'Repository'

  const getSeverityLabel = (severity: 'low' | 'medium' | 'high') => {
    if (isId) {
      return severity === 'high' ? 'TINGGI' : severity === 'medium' ? 'SEDANG' : 'RENDAH'
    }
    return severity.toUpperCase()
  }

  const headerPrefix = (
    <div>
      <div className={styles.caseEyebrow}>
        <span>{isId ? "BERKAS KASUS BRO CODE" : "BRO CODE'S CASE FILE"}</span>
        <span className={styles.anonymousBadge}>
          {isId ? 'Kasus Anonim' : 'Anonymous Case'}
        </span>
      </div>
      <div className={styles.modalBadges}>
        <span className={styles.targetKindBadge}>{localizedTarget}</span>
        <span className={styles.fictionalBadge}>
          {isId ? 'CONTOH FIKTIF · TIDAK DIPINDAI' : 'FICTIONAL EXAMPLE · NOT SCANNED'}
        </span>
        <span className={styles.targetKindBadge}>{caseItem.category[language]}</span>
      </div>
      <p className={styles.modalAlias} style={{ marginTop: '4px', marginBottom: '8px' }}>
        {isId ? 'Alias Publik:' : 'Public Alias:'} <strong>{caseItem.publicAlias[language]}</strong>
      </p>
    </div>
  )

  const headerActions = onLanguageChange ? (
    <button
      type="button"
      className={styles.modalLangBtn}
      onClick={() => onLanguageChange(language === 'en' ? 'id' : 'en')}
      aria-label={isId ? 'Ganti bahasa ke English' : 'Switch language to Indonesian'}
      title={isId ? 'Switch to English' : 'Ganti ke Bahasa Indonesia'}
    >
      <span>{language === 'en' ? 'ID' : 'EN'}</span>
    </button>
  ) : null

  return (
    <Dialog
      title={caseItem.title[language]}
      language={language}
      close={onClose}
      titleId="case-file-title"
      ariaDescribedby="case-file-desc"
      className={styles.modalDialog}
      headerPrefix={headerPrefix}
      headerActions={headerActions}
    >
      <div className={styles.reactionRow}>
        <div className={styles.mascotCol}>
          <Mascot small language={language} state={mascotMood} />
        </div>
        <div className={styles.reactionCol}>
          <span className={styles.reactionLabel}>
            {isId ? 'Reaksi Bro Code' : 'Bro Code Reaction'}
          </span>
          <p className={styles.reactionQuote}>“{caseItem.broCodeReaction[language]}”</p>
        </div>
      </div>

      <div className={styles.verdictBox}>
        <span className={styles.verdictLabel}>
          {isId ? 'PUTUSAN AUDIT FIKTIF' : 'SYNTHETIC AUDIT VERDICT'}
        </span>
        <h3 className={styles.verdictHeadline}>“{caseItem.verdictHeadline[language]}”</h3>
        <p id="case-file-desc" className={styles.verdictSummary}>
          {caseItem.verdictSummary[language]}
        </p>
      </div>

      <div className={styles.heatBox}>
        <div className={styles.heatNumberCol}>
          {caseItem.comedyHeat}
          <small>/100</small>
        </div>
        <div className={styles.heatTextCol}>
          <strong>{isId ? 'Panas Komedi Ilustratif' : 'Illustrative Comedy Heat'}</strong>
          <p>
            {isId
              ? 'Panas komedi adalah indeks hiburan edukatif, bukan audit keamanan atau sertifikasi mutu perangkat lunak. Anonimitas masa depan yang hipotetis tidak dapat menjamin bahwa situasi unik tidak dapat dikenali. Seluruh spesimen bersifat sintetis.'
              : 'Comedy heat is an illustrative educational index, not a security audit or software quality certification. Hypothetical future anonymity cannot guarantee that unique circumstances are unrecognizable. All specimens are entirely synthetic.'}
          </p>
        </div>
      </div>

      <section className={styles.findingsSection}>
        <h3 className={styles.sectionHeading}>
          <span>{isId ? 'Bukti Temuan (The Receipts)' : 'The Receipts'}</span>
          <span className={styles.tabCount}>{caseItem.findings.length}</span>
        </h3>
        <div className={styles.findingsList}>
          {caseItem.findings.map((finding, idx) => (
            <details
              key={finding.id}
              className={styles.findingDetails}
              open={idx === 0}
            >
              <summary className={styles.findingSummary}>
                <span
                  className={`${styles.severityTag} ${
                    finding.severity === 'high'
                      ? styles.severityHigh
                      : finding.severity === 'medium'
                        ? styles.severityMedium
                        : styles.severityLow
                  }`}
                >
                  {getSeverityLabel(finding.severity)}
                </span>
                <span className={styles.findingTitleText}>{finding.title[language]}</span>
                <span className={styles.findingCatText}>{finding.category[language]}</span>
              </summary>
              <div className={styles.findingBody}>
                <span className={styles.fictionalObservationBadge}>
                  {isId ? 'Observasi Spesimen Sintetis' : 'Synthetic Specimen Observation'}
                </span>
                <div className={styles.findingBlock}>
                  <h4>{isId ? 'Penjelasan Teknis' : 'Technical Explanation'}</h4>
                  <p>{finding.explanation[language]}</p>
                </div>
                <div className={`${styles.findingBlock} ${styles.roastBlock}`}>
                  <h4>{isId ? 'Komentar Pedas' : 'Roast Commentary'}</h4>
                  <p>“{finding.roast[language]}”</p>
                </div>
                <div className={`${styles.findingBlock} ${styles.remediationBlock}`}>
                  <h4>{isId ? 'Langkah Perbaikan' : 'Remediation Step'}</h4>
                  <p>{finding.remediation[language]}</p>
                </div>
              </div>
            </details>
          ))}
        </div>
      </section>

      {(caseItem.strengths.length > 0 || caseItem.limitations.length > 0) && (
        <div className={styles.strengthsLimitationsRow}>
          {caseItem.strengths.length > 0 && (
            <div className={styles.metaCard}>
              <h4>{isId ? 'Pertahankan yang Bagus (Keep the Good Parts)' : 'Keep the Good Parts'}</h4>
              <ul>
                {caseItem.strengths.map((str, idx) => (
                  <li key={idx}>{str[language]}</li>
                ))}
              </ul>
            </div>
          )}
          {caseItem.limitations.length > 0 && (
            <div className={styles.metaCard}>
              <h4>{isId ? 'Cakupan Analisis (Analysis Scope)' : 'Analysis Scope'}</h4>
              <ul>
                {caseItem.limitations.map((lim, idx) => (
                  <li key={idx}>{lim[language]}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <footer className={styles.modalFooter}>
        <div className={styles.modalActions}>
          <a
            href={`/?mode=website&lang=${language}#roast`}
            className="outline-btn"
          >
            {isId ? '← Uji Website Sendiri' : '← Judge Your Website'}
          </a>
          <a
            href={`/?mode=repository&lang=${language}#roast`}
            className="outline-btn"
          >
            {isId ? '← Uji Repositori Sendiri' : '← Judge Your Repository'}
          </a>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="dark-btn"
        >
          {isId ? 'Tutup Berkas' : 'Close Case File'}
        </button>
      </footer>
    </Dialog>
  )
}
