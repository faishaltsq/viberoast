'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, FileText } from 'lucide-react'
import type { Language, PromptOptions, RoastReport, WebsiteReport } from '@/lib/types/report'
import { generatePrompt } from '@/lib/prompts/generate'
import { Mascot } from '@/components/bro-code/mascot'
import { downloadText, SectionLabel } from '@/components/shared/primitives'
import styles from './fixes.module.css'

const severities = ['high', 'medium', 'low'] as const
const priority = { high: 0, medium: 1, low: 2 }
type Feedback = { prompt: string; kind: 'copied' | 'copy-failed' | 'other'; message: string }

export function Fixes({ report, language, selectedIds, select, results }: { report: WebsiteReport; language: Language; selectedIds: string[]; select: (ids: string[]) => void; results: () => void }) {
  const id = language === 'id'
  const t = (en: string, indo: string) => id ? indo : en
  const [mode, setMode] = useState<'quick' | 'full' | 'selected'>('selected')
  const [preset, setPreset] = useState<PromptOptions['preset']>('Codex')
  const [promptLanguage, setPromptLanguage] = useState<Language>(language)
  const [detail, setDetail] = useState<PromptOptions['detail']>('detailed')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [copyingPrompt, setCopyingPrompt] = useState<string | null>(null)
  const copyRequest = useRef(0)
  const preview = useRef<HTMLPreElement>(null)
  const sorted = useMemo(() => [...report.scan.findings].sort((a, b) => priority[a.severity] - priority[b.severity]), [report])
  const visible = useMemo(() => mode === 'quick' ? sorted.slice(0, 3) : sorted, [mode, sorted])
  const activeIds = useMemo(() => mode === 'selected' ? selectedIds : visible.map(finding => finding.id), [mode, selectedIds, visible])
  const prompt = useMemo(() => activeIds.length ? generatePrompt(report, { selectedIds: activeIds, preset, language: promptLanguage, detail }) : '', [report, activeIds, preset, promptLanguage, detail])
  const notice = feedback?.prompt === prompt ? feedback : null
  const copied = notice?.kind === 'copied'
  const copying = Boolean(prompt && copyingPrompt === prompt)
  const detailLabel = detail === 'detailed' ? t('Detailed', 'Lengkap') : t('Short', 'Ringkas')
  const severityLabels = { high: t('High severity', 'Keparahan tinggi'), medium: t('Medium severity', 'Keparahan sedang'), low: t('Low severity', 'Keparahan rendah') }

  useEffect(() => () => { copyRequest.current += 1 }, [prompt])

  const clearFeedback = () => {
    copyRequest.current += 1
    setFeedback(null)
    setCopyingPrompt(null)
  }
  const changeSelection = (ids: string[]) => {
    clearFeedback()
    select(ids)
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
      setFeedback({ prompt, kind: 'copied', message: t('Prompt copied. Paste it into your coding agent.', 'Prompt disalin. Tempelkan ke agen coding pilihanmu.') })
    } catch {
      if (request !== copyRequest.current) return
      setFeedback({ prompt, kind: 'copy-failed', message: t('Clipboard access was unavailable. Select the prompt text to copy it manually, or download Markdown.', 'Akses papan klip tidak tersedia. Pilih teks prompt untuk menyalinnya secara manual, atau unduh Markdown.') })
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
      downloadText(prompt, `sourcesanity-${preset.toLowerCase().replaceAll(' ', '-')}.md`)
      setFeedback({ prompt, kind: 'other', message: t('Markdown download started. Check your browser’s downloads.', 'Unduhan Markdown dimulai. Periksa daftar unduhan browsermu.') })
    } catch {
      setFeedback({ prompt, kind: 'other', message: t('Markdown download could not start. Copy the prompt or select its text manually instead.', 'Unduhan Markdown tidak dapat dimulai. Salin prompt atau pilih teksnya secara manual.') })
    }
  }

  return <div className={`fix-page container ${styles.workspace}`} data-testid="fixes-view">
    <button className="back-link" onClick={results}>{t('← Back to your roast', '← Kembali ke hasil')}</button>
    <SectionLabel>{t('FIX MY SHAME', 'WAKTUNYA PERBAIKAN')}</SectionLabel>
    <h1>{t('Turn the roast into a ', 'Ubah roasting jadi ')}<em>{t('roadmap.', 'rencana nyata.')}</em></h1>
    <p className="muted intro">{t('Priorities, actual evidence, and acceptance checks for the issues in your report. Review heuristic findings before implementing them.', 'Prioritas, bukti nyata, dan kriteria penerimaan dari laporanmu. Tinjau temuan heuristik sebelum menerapkannya.')}</p>
    <div className="fix-tabs" role="group" aria-label={t('Fix scope', 'Cakupan perbaikan')}>
      {(['quick', 'full', 'selected'] as const).map(value => <button key={value} aria-pressed={mode === value} className={mode === value ? 'active' : ''} onClick={() => { clearFeedback(); setMode(value) }}>
        {value === 'quick' ? t('Quick Fix', 'Perbaikan Cepat') : value === 'full' ? t('Full Rehab', 'Perbaikan Menyeluruh') : t('Selected Issues', 'Temuan Pilihan')}
        <span>{value === 'quick' ? Math.min(3, sorted.length) : value === 'full' ? sorted.length : selectedIds.length}</span>
      </button>)}
    </div>
    <p className={`muted ${styles.scopeNote}`}>{mode === 'quick' ? t('Quick Fix includes up to three highest-priority findings. It is not a time estimate. Your custom selection is unchanged.', 'Perbaikan Cepat mencakup maksimal tiga temuan berprioritas tertinggi. Ini bukan perkiraan waktu. Pilihan khususmu tidak berubah.') : mode === 'full' ? t('Full Rehab includes all recorded findings. Your custom selection is unchanged.', 'Perbaikan Menyeluruh mencakup semua temuan yang tercatat. Pilihan khususmu tidak berubah.') : t('Choose the exact findings to send to your agent. Your selection stays with this report.', 'Pilih temuan yang ingin dikirim ke agen. Pilihanmu disimpan selama laporan ini terbuka.')}</p>
    {mode === 'selected' && <div className="button-row selection-actions">
      <button className="outline-btn" disabled={!sorted.length || selectedIds.length === sorted.length} onClick={() => changeSelection(sorted.map(finding => finding.id))}>{t('Select all', 'Pilih semua')}</button>
      <button className="outline-btn" disabled={!selectedIds.length} onClick={() => changeSelection([])}>{t('Deselect all', 'Batalkan semua')}</button>
      <span role="status">{selectedIds.length} {t('of', 'dari')} {sorted.length} {t('selected', 'dipilih')}</span>
    </div>}
    {mode === 'selected' && sorted.length > 0 && !selectedIds.length && <div className={`notice ${styles.emptySelection}`}>
      <h2>{t('No issues selected', 'Belum ada temuan dipilih')}</h2>
      <p>{t('Choose a finding below or select all to build your prompt. Deselecting a finding does not resolve it; your report is unchanged.', 'Pilih temuan di bawah atau pilih semua untuk membuat prompt. Membatalkan pilihan tidak menyelesaikan temuan; laporanmu tidak berubah.')}</p>
    </div>}
    <div className="fix-layout">
      <div className="fix-cards">
        {!visible.length && <p className="notice">{t('There are no findings to turn into fixes. Return to the report to review scan limitations.', 'Tidak ada temuan untuk diperbaiki. Kembali ke laporan untuk meninjau batasan pemindaian.')}</p>}
        {severities.map(severity => {
          const findings = visible.filter(finding => finding.severity === severity)
          if (!findings.length) return null
          return <section key={severity} className={styles.severityGroup} aria-label={severityLabels[severity]}>
            <div className={styles.groupHeading}><h2>{severityLabels[severity]}</h2><span>{findings.filter(finding => activeIds.includes(finding.id)).length}/{findings.length} {t('in prompt', 'di prompt')}</span></div>
            {findings.map(finding => <article className={`fix-card ${styles.finding}`} key={finding.id}>
              {mode === 'selected' && <label className={styles.checkboxTarget}><input className="fix-checkbox" type="checkbox" aria-label={`${t('Select', 'Pilih')}: ${finding.title}`} checked={selectedIds.includes(finding.id)} onChange={event => changeSelection(event.target.checked ? [...selectedIds, finding.id] : selectedIds.filter(value => value !== finding.id))} /></label>}
              <div className={styles.findingBody}>
                <span className={styles.findingMeta}>{finding.category} · {finding.verification} · {finding.id}</span>
                <h3>{finding.title}</h3>
                <p>{finding.recommendation}</p>
                <details>
                  <summary>{t('Evidence & acceptance', 'Bukti & kriteria penerimaan')}</summary>
                  <dl className={styles.evidenceMeta}><dt>{t('Observed location', 'Lokasi pengamatan')}</dt><dd><code>{finding.location}</code></dd><dt>{t('Evidence source', 'Sumber bukti')}</dt><dd>{finding.source}</dd></dl>
                  <ul>{finding.evidence.map((evidence, index) => <li key={index}>{evidence}</li>)}</ul>
                  <h4>{t('Acceptance criteria', 'Kriteria penerimaan')}</h4>
                  <ol className={styles.acceptance}>
                    <li>{t('Locate the real implementation and reproduce the evidence at the recorded location.', 'Temukan implementasi asli dan reproduksi bukti di lokasi yang tercatat.')}</li>
                    <li>{t('Apply the recorded recommendation only after confirming the finding. Preserve working behavior.', 'Terapkan rekomendasi tercatat hanya setelah mengonfirmasi temuan. Pertahankan perilaku yang berfungsi.')}</li>
                    <li>{t('Re-check the same viewport and interaction. Show before/after evidence, or record why the finding remains unresolved.', 'Periksa ulang ukuran layar dan interaksi yang sama. Tunjukkan bukti sebelum/sesudah, atau catat alasan temuan belum terselesaikan.')}</li>
                  </ol>
                  {finding.verification !== 'verified' && <p><b>{t('Confirm this finding before changing code.', 'Konfirmasikan temuan ini sebelum mengubah kode.')}</b></p>}
                </details>
              </div>
            </article>)}
          </section>
        })}
      </div>
      <div>
        <div className="prompt-options">
          <label>{t('Agent preset', 'Preset agen')}<select value={preset} onChange={event => { clearFeedback(); setPreset(event.target.value as PromptOptions['preset']) }}>{['Codex', 'Claude Code', 'Cursor', 'Windsurf', 'Generic Agent'].map(value => <option key={value}>{value}</option>)}</select></label>
          <label>{t('Prompt language', 'Bahasa prompt')}<select value={promptLanguage} onChange={event => { clearFeedback(); setPromptLanguage(event.target.value as Language) }}><option value="en">English</option><option value="id">Bahasa Indonesia</option></select></label>
          <label>{t('Prompt detail', 'Detail prompt')}<select value={detail} onChange={event => { clearFeedback(); setDetail(event.target.value as PromptOptions['detail']) }}><option value="short">{t('Short', 'Ringkas')}</option><option value="detailed">{t('Detailed', 'Lengkap')}</option></select></label>
        </div>
        <p className={styles.previewNote}>{t('Live preview. Scope and option changes update the prompt automatically.', 'Pratinjau langsung. Perubahan cakupan dan opsi memperbarui prompt secara otomatis.')}</p>
        <div className="prompt-card">
          <div className={`prompt-head ${styles.promptHeader}`}>
            <FileText aria-hidden="true" />
            <div className={styles.fileHeading}><span>agent-prompt.md</span><span className={styles.fileMeta} aria-live="polite">{preset} · {activeIds.length} {t('issues', 'temuan')} · {detailLabel} · {promptLanguage === 'id' ? 'Bahasa Indonesia' : 'English'}</span></div>
            <button disabled={!prompt || copying} onClick={copy}>{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copying ? t('Copying…', 'Menyalin…') : copied ? t('Copied', 'Tersalin') : t('Copy prompt', 'Salin prompt')}</button>
          </div>
          <pre ref={preview} className={styles.preview} tabIndex={0} aria-label={t('Generated agent prompt', 'Prompt agen yang dibuat')}>{prompt || t('Select at least one issue to generate a prompt. No issues will be sent accidentally.', 'Pilih setidaknya satu temuan untuk membuat prompt. Tidak ada temuan yang terkirim tanpa sengaja.')}</pre>
        </div>
        <div className={`button-row prompt-actions ${styles.actions}`}>
          <button className="outline-btn" disabled={!prompt} onClick={() => { clearFeedback(); setFeedback({ prompt, kind: 'other', message: t('Prompt regenerated from the current evidence and options.', 'Prompt dibuat ulang dari bukti dan opsi saat ini.') }) }}>{t('Regenerate prompt', 'Buat ulang prompt')}</button>
          <button className="dark-btn" disabled={!prompt} onClick={download}>{t('Download Markdown', 'Unduh Markdown')}</button>
        </div>
        {notice && <p className="notice" role="status">{notice.message}</p>}
        {prompt && <button className={`back-link ${styles.manualCopy}`} onClick={selectPrompt}>{t('Select prompt text', 'Pilih teks prompt')}</button>}
        <div className="fix-mascot"><Mascot small state={copied ? 'proud' : 'helpful'} language={language} /></div>
      </div>
    </div>
  </div>
}
