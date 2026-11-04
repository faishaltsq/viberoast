'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, FileText } from 'lucide-react'
import type { Finding, Language, PromptOptions, RepositoryReport } from '@/lib/types/report'
import { generatePrompt, mergeRepoFindings, safeGitHubPermaUrl } from '@/lib/prompts/generate'
import { redactSecrets } from '@/lib/security/redact'
import { downloadText, SectionLabel } from '@/components/shared/primitives'
import styles from './fixes.module.css'

const priority = { high: 0, medium: 1, low: 2 }
type Feedback = { prompt: string; kind: 'copied' | 'copy-failed' | 'other'; message: string }

interface RepositoryFixProps {
  report: RepositoryReport
  language: Language
  selectedIds: string[]
  select: (ids: string[]) => void
  results: () => void
}

export function RepositoryFix({
  report,
  language,
  selectedIds,
  select,
  results,
}: RepositoryFixProps) {
  const id = language === 'id'
  const t = (en: string, indo: string) => (id ? indo : en)

  const [mode, setMode] = useState<'quick' | 'full' | 'selected'>('selected')
  const [preset, setPreset] = useState<PromptOptions['preset']>('Codex')
  const [promptLanguage, setPromptLanguage] = useState<Language>(language)
  const [detail, setDetail] = useState<PromptOptions['detail']>('detailed')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [copyingPrompt, setCopyingPrompt] = useState<string | null>(null)
  const copyRequest = useRef(0)
  const preview = useRef<HTMLPreElement>(null)

  const scan = report.repoScan
  const isSecurity = (f: Finding) => Boolean(f.security || f.category === 'Security')
  const sorted = useMemo(() => {
    const merged = mergeRepoFindings(scan.securityFindings, scan.findings)
    return merged.sort((a, b) => {
      const secDiff = (isSecurity(b) ? 1 : 0) - (isSecurity(a) ? 1 : 0)
      if (secDiff !== 0) return secDiff
      return priority[a.severity] - priority[b.severity]
    })
  }, [scan.securityFindings, scan.findings])

  const knownSet = useMemo(() => new Set(sorted.map((f) => f.id)), [sorted])

  const boundedSelectedIds = useMemo(() => {
    const seen = new Set<string>()
    const result: string[] = []
    for (const id of selectedIds) {
      if (knownSet.has(id) && !seen.has(id)) {
        seen.add(id)
        result.push(id)
        if (result.length === 60) break
      }
    }
    return result
  }, [selectedIds, knownSet])

  const visible = useMemo(() => (mode === 'quick' ? sorted.slice(0, 3) : sorted), [mode, sorted])
  const activeIds = useMemo(
    () => (mode === 'selected' ? boundedSelectedIds : visible.slice(0, 60).map((f) => f.id)),
    [mode, boundedSelectedIds, visible]
  )

  const prompt = useMemo(() => {
    if (!activeIds.length) return ''
    return generatePrompt(report, {
      selectedIds: activeIds,
      preset,
      language: promptLanguage,
      detail,
    })
  }, [report, activeIds, preset, promptLanguage, detail])

  const notice = feedback?.prompt === prompt ? feedback : null
  const copied = notice?.kind === 'copied'
  const copying = Boolean(prompt && copyingPrompt === prompt)
  const detailLabel = detail === 'detailed' ? t('Detailed', 'Lengkap') : t('Short', 'Ringkas')

  useEffect(() => () => { copyRequest.current += 1 }, [prompt])

  const clearFeedback = () => {
    copyRequest.current += 1
    setFeedback(null)
    setCopyingPrompt(null)
  }

  const changeSelection = (ids: string[]) => {
    clearFeedback()
    const seen = new Set<string>()
    const clamped: string[] = []
    for (const id of ids) {
      if (knownSet.has(id) && !seen.has(id)) {
        seen.add(id)
        clamped.push(id)
        if (clamped.length === 60) break
      }
    }
    select(clamped)
  }

  const copy = async () => {
    if (!prompt) return
    const request = ++copyRequest.current
    setFeedback(null)
    setCopyingPrompt(prompt)
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(prompt)
      if (request !== copyRequest.current) return
      setFeedback({
        prompt,
        kind: 'copied',
        message: t(
          'Repository prompt copied. Paste it into your coding agent workspace.',
          'Prompt repositori disalin. Tempelkan ke workspace agen coding-mu.'
        ),
      })
    } catch {
      if (request !== copyRequest.current) return
      setFeedback({
        prompt,
        kind: 'copy-failed',
        message: t(
          'Clipboard access was unavailable. Select the prompt text to copy manually, or download Markdown.',
          'Akses papan klip tidak tersedia. Pilih teks prompt untuk menyalin secara manual, atau unduh Markdown.'
        ),
      })
    } finally {
      if (request === copyRequest.current) setCopyingPrompt(null)
    }
  }

  const selectPrompt = () => {
    if (!preview.current) return
    preview.current.focus()
    const range = document.createRange()
    range.selectNodeContents(preview.current)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  const download = () => {
    if (!prompt) return
    clearFeedback()
    try {
      downloadText(
        prompt,
        `sourcesanity-${redactSecrets(scan.owner)}-${redactSecrets(scan.repo)}-${preset.toLowerCase().replaceAll(' ', '-')}.md`
      )
      setFeedback({
        prompt,
        kind: 'other',
        message: t(
          'Markdown download started. Check your browser’s downloads.',
          'Unduhan Markdown dimulai. Periksa daftar unduhan browsermu.'
        ),
      })
    } catch {
      setFeedback({
        prompt,
        kind: 'other',
        message: t(
          'Markdown download could not start. Copy the prompt or select text manually instead.',
          'Unduhan Markdown gagal. Salin prompt atau pilih teks secara manual.'
        ),
      })
    }
  }

  return (
    <div className={`fix-page container ${styles.workspace}`} data-testid="repo-fixes-view">
      <button className="back-link" onClick={results} data-testid="back-to-results">
        {t('← Back to your repository roast', '← Kembali ke hasil roasting')}
      </button>
      <SectionLabel>{t('FIX MY REPO SHAME', 'WAKTUNYA REPO PERBAIKAN')}</SectionLabel>
      <h1>
        {t('Turn code debt into an ', 'Ubah temuan kode jadi ')}
        <em>{t('executable brief.', 'instruksi siap jalan.')}</em>
      </h1>
      <p className="muted intro">
        {t(
          `Source-grounded fix instructions for ${redactSecrets(scan.owner)}/${redactSecrets(scan.repo)} (commit ${scan.sha.slice(0, 7)}). Generates exact file locations, evidence, and acceptance criteria for your AI coding agent.`,
          `Instruksi perbaikan berbasis kode untuk ${redactSecrets(scan.owner)}/${redactSecrets(scan.repo)} (commit ${scan.sha.slice(0, 7)}). Menyediakan lokasi berkas persis, bukti, dan kriteria penerimaan untuk agen AI-mu.`
        )}
      </p>

      <div className="fix-tabs" role="group" aria-label={t('Fix scope', 'Cakupan perbaikan')}>
        {(['quick', 'full', 'selected'] as const).map((value) => (
          <button
            key={value}
            aria-pressed={mode === value}
            className={mode === value ? 'active' : ''}
            onClick={() => {
              clearFeedback()
              setMode(value)
            }}
          >
            {value === 'quick'
              ? t('Quick Fix (Top 3)', 'Perbaikan Cepat (Top 3)')
              : value === 'full'
              ? t('Full Rehab', 'Semua Temuan')
              : t('Selected Issues', 'Temuan Pilihan')}
            <span>{value === 'quick' ? Math.min(3, sorted.length) : value === 'full' ? Math.min(60, sorted.length) : boundedSelectedIds.length}</span>
          </button>
        ))}
      </div>

      <p className={`muted ${styles.scopeNote}`}>
        {mode === 'quick'
          ? t('Quick Fix includes up to three highest-severity findings.', 'Perbaikan Cepat mencakup maksimal tiga temuan prioritas tertinggi.')
          : mode === 'full'
          ? sorted.length > 60
            ? t(
                `Full Rehab includes the first 60 prioritized findings (${sorted.length - 60} remaining in additional reviewed batches).`,
                `Semua Temuan mencakup 60 temuan prioritas pertama (${sorted.length - 60} tersisa dalam batch tinjauan berikutnya).`
              )
            : t('Full Rehab includes all recorded repository findings.', 'Semua Temuan mencakup seluruh temuan yang tercatat pada repositori.')
          : t('Choose specific findings to include in your agent implementation brief.', 'Pilih temuan spesifik untuk dimasukkan ke brief implementasi agenmu.')}
      </p>

      {mode === 'selected' && (
        <div className="button-row selection-actions">
          <button
            className="outline-btn"
            disabled={!sorted.length || boundedSelectedIds.length === Math.min(60, sorted.length)}
            onClick={() => changeSelection(sorted.slice(0, 60).map((f) => f.id))}
          >
            {t('Select all', 'Pilih semua')}
          </button>
          <button
            className="outline-btn"
            disabled={!boundedSelectedIds.length}
            onClick={() => changeSelection([])}
          >
            {t('Deselect all', 'Batalkan semua')}
          </button>
          <span role="status">
            {boundedSelectedIds.length} {t('of', 'dari')} {sorted.length} {t('selected', 'dipilih')}{sorted.length > 60 ? ` (${t('max 60 per prompt', 'maks 60 per prompt')})` : ''}
          </span>
        </div>
      )}

      <div className="fix-layout">
        <div className="fix-cards">
          {visible.map((finding) => {
            const isChecked = activeIds.includes(finding.id)
            const permaUrl = safeGitHubPermaUrl(scan.owner, scan.repo, scan.sha, finding.location, finding.security)
            const displayLocation = redactSecrets(finding.location)

            return (
              <div
                key={finding.id}
                className="fix-card"
                data-selected={isChecked}
                style={{ cursor: mode === 'selected' ? 'pointer' : 'default' }}
                onClick={() => {
                  if (mode !== 'selected') return
                  if (isChecked) {
                    changeSelection(boundedSelectedIds.filter((id) => id !== finding.id))
                  } else if (boundedSelectedIds.length < 60) {
                    changeSelection([...boundedSelectedIds, finding.id])
                  }
                }}
              >
                <div
                  className="fix-check"
                  role="checkbox"
                  aria-checked={isChecked}
                  aria-label={redactSecrets(finding.title)}
                  tabIndex={mode === 'selected' ? 0 : -1}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault()
                      if (mode === 'selected') {
                        if (isChecked) {
                          changeSelection(boundedSelectedIds.filter((id) => id !== finding.id))
                        } else if (boundedSelectedIds.length < 60) {
                          changeSelection([...boundedSelectedIds, finding.id])
                        }
                      }
                    }
                  }}
                >
                  {isChecked && <Check size={16} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <small className="mono" style={{ color: 'var(--red)', fontWeight: 800 }}>
                      {redactSecrets(finding.category)} · {finding.severity.toUpperCase()}
                    </small>
                    {permaUrl ? (
                      <a
                        href={permaUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontSize: '11px', color: '#686158', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                      >
                        <code>{displayLocation}</code> <ExternalLink size={11} />
                      </a>
                    ) : (
                      <span style={{ fontSize: '11px', color: '#686158' }}>
                        <code>{displayLocation}</code>
                      </span>
                    )}
                  </div>
                  <h3>{redactSecrets(finding.title)}</h3>
                  <p>{redactSecrets(finding.description)}</p>
                  <p className="fix-rec" style={{ fontSize: '12px', color: '#29533b', margin: 0 }}>
                    <b>{t('Recommended action', 'Tindakan yang disarankan')}:</b> {redactSecrets(finding.recommendation)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        <div className="prompt-card">
          <div className="prompt-head">
            <FileText size={16} />
            <span>{t('AGENT PROMPT GENERATOR', 'GENERATOR PROMPT AGEN')}</span>
            <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
              <button
                type="button"
                onClick={download}
                disabled={!prompt}
                title={t('Download prompt as Markdown', 'Unduh prompt sebagai Markdown')}
                data-testid="download-md-btn"
              >
                <FileText size={12} /> {t('Download .md', 'Unduh .md')}
              </button>
              <button
                type="button"
                onClick={copy}
                disabled={!prompt || copying}
                style={{ background: copied ? 'var(--green)' : undefined, color: copied ? '#fff' : undefined }}
                data-testid="copy-prompt-btn"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? t('Copied!', 'Tersalin!') : copying ? t('Copying…', 'Menyalin…') : t('Copy Prompt', 'Salin Prompt')}
              </button>
            </div>
          </div>

          <div style={{ padding: '12px 16px', background: '#252422', borderBottom: '1px solid #3d3b37', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', fontSize: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: '#aaa' }}>{t('Agent', 'Agen')}:</span>
              <select
                value={preset}
                onChange={(e) => {
                  clearFeedback()
                  setPreset(e.target.value as PromptOptions['preset'])
                }}
                style={{ background: '#1c1b18', color: '#fff', border: '1px solid #555', padding: '4px 8px', borderRadius: '3px', font: 'inherit' }}
              >
                <option value="Codex">Codex</option>
                <option value="Claude Code">Claude Code</option>
                <option value="Cursor">Cursor</option>
                <option value="Windsurf">Windsurf</option>
                <option value="Generic Agent">Generic Agent</option>
              </select>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: '#aaa' }}>{t('Detail', 'Detail')}:</span>
              <button
                type="button"
                onClick={() => {
                  clearFeedback()
                  setDetail(detail === 'detailed' ? 'short' : 'detailed')
                }}
                style={{ background: '#1c1b18', color: '#fff', border: '1px solid #555', padding: '4px 8px', borderRadius: '3px', font: 'inherit', cursor: 'pointer' }}
              >
                {detailLabel}
              </button>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: '#aaa' }}>{t('Prompt Lang', 'Bahasa')}:</span>
              <button
                type="button"
                onClick={() => {
                  clearFeedback()
                  setPromptLanguage(promptLanguage === 'en' ? 'id' : 'en')
                }}
                style={{ background: '#1c1b18', color: '#fff', border: '1px solid #555', padding: '4px 8px', borderRadius: '3px', font: 'inherit', cursor: 'pointer' }}
              >
                {promptLanguage.toUpperCase()}
              </button>
            </label>

            <button
              type="button"
              onClick={selectPrompt}
              disabled={!prompt}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#888', textDecoration: 'underline', cursor: 'pointer', fontSize: '11px' }}
            >
              {t('Select text', 'Pilih teks')}
            </button>
          </div>

          {notice && (
            <div style={{ background: notice.kind === 'copied' ? '#1b382b' : '#382b1b', color: '#fff', padding: '8px 16px', fontSize: '12px' }} role="status">
              {notice.message}
            </div>
          )}

          <pre ref={preview} tabIndex={0} style={{ maxHeight: '480px', overflowY: 'auto' }}>
            {prompt || (
              <span style={{ color: '#888' }}>
                {t(
                  'No findings selected. Choose at least one finding above to generate an agent implementation prompt.',
                  'Tidak ada temuan yang dipilih. Pilih minimal satu temuan di atas untuk membuat prompt agen.'
                )}
              </span>
            )}
          </pre>
        </div>
      </div>
    </div>
  )
}
