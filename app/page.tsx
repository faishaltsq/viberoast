'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowDownRight, ArrowRight, Check, CircleDot, GitBranch, Menu, RotateCcw, Search, Terminal, X, Zap } from 'lucide-react'
import type { Intensity, Language, RoastReport } from '@/lib/types/report'
import { isRepositoryReport, isWebsiteReport, reportSchema } from '@/lib/types/report'
import { calculateScore } from '@/lib/roast/score'
import { parseGitHubUrl } from '@/lib/github/parse-url'
import { Mascot } from '@/components/bro-code/mascot'
import { Results } from '@/components/roast/results'
import { RepoResults } from '@/components/roast/RepoResults'
import { RepositoryForm } from '@/components/roast/RepositoryForm'
import { Fixes } from '@/components/fixes/fixes'
import { RepositoryFix } from '@/components/fixes/RepositoryFix'
import { Dialog, SectionLabel } from '@/components/shared/primitives'
import {
  LANGUAGE_COOKIE_NAME,
  type ScanMode,
  isValidLanguage,
  resolveInitialLanguage,
  resolveScanMode,
} from '@/lib/hall-navigation'

type View = 'home' | 'results' | 'fixes'

const PUBLIC_PREVIEW_EXAMPLES = [
  {
    name: 'TaskToast',
    en: 'Bro, your empty state has more personality than the app.',
    id: 'Bro, halaman kosongmu lebih berkepribadian daripada aplikasinya.',
    score: 18,
    rank: '01',
    color: 'green',
  },
  {
    name: 'CryptoBros.app',
    en: 'The gradients called. They want their 2021 back.',
    id: 'Gradiennya menelepon. Mereka minta tahun 2021 dikembalikan.',
    score: 72,
    rank: '02',
    color: 'red',
  },
  {
    name: 'SaaSStarter',
    en: 'It is giving template, but at least the template is centered.',
    id: 'Auranya template banget, tapi setidaknya templatenya rata tengah.',
    score: 42,
    rank: '03',
    color: 'yellow',
  },
] as const

export default function Page() {
  const [language, setLanguage] = useState<Language>('en')
  const [scanMode, setScanMode] = useState<ScanMode>('website')
  const [url, setUrl] = useState('')
  const [intensity, setIntensity] = useState<Intensity>('No Mercy')
  const [view, setView] = useState<View>('home')
  const [section, setSection] = useState('top')
  const [mobileMenu, setMobileMenu] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [tickerPaused, setTickerPaused] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
  const [longRunning, setLongRunning] = useState(false)
  const [error, setError] = useState('')
  const [errorReaction, setErrorReaction] = useState<'disappointed' | 'confused'>('disappointed')
  const [report, setReport] = useState<RoastReport | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [scannedTarget, setScannedTarget] = useState('')
  const [improved, setImproved] = useState(false)
  const [dialog, setDialog] = useState<'manifesto' | 'example' | null>(null)
  const controller = useRef<AbortController | null>(null)
  const id = language === 'id'
  const t = (en: string, indo: string) => id ? indo : en

  const pendingMessage = scanMode === 'repository'
    ? t('Fetching repository tree and inspecting source files. Please wait…', 'Mengambil pohon repositori dan memeriksa berkas sumber. Mohon tunggu…')
    : t('Preparing the scanner, then scanning and analyzing the page. An idle scanner may need up to 50 seconds to wake. Progress cannot be measured.', 'Menyiapkan scanner, lalu memindai dan menganalisis halaman. Scanner yang tidur mungkin perlu hingga 50 detik untuk bangun. Progres tidak dapat diukur.')

  const intensityDescription = {
    'Friendly Fire': t('Your code gets teased. Your ego survives.', 'Kodemu diceng-cengin. Egomu selamat.'),
    'No Mercy': t('Honest feedback with emotional damage.', 'Masukan jujur, bonus luka batin.'),
    'Career Ending': t('Maximum drama. Same factual accuracy.', 'Drama maksimal. Akurasi tetap sama.'),
  }[intensity]

  const speech = error ? t('No evidence, no roast. Let’s get that URL working.', 'Tanpa bukti, tanpa roasting. Bereskan URL-nya dulu.')
    : isAnalyzing ? (scanMode === 'repository' ? t('Inspecting actual source files. No fake code receipts.', 'Memeriksa berkas kode nyata. Bukan bukti fiktif.') : t('Waiting for recorded evidence. No imaginary progress bars.', 'Menunggu bukti pemindaian. Bukan progres karangan.'))
    : inputFocused ? (scanMode === 'repository' ? t('A GitHub repo? Time to read the actual code.', 'Repo GitHub? Waktunya baca kode aslinya.') : t('A public URL? Now you have my attention.', 'URL publik? Oke, sekarang gue penasaran.'))
    : intensity === 'Friendly Fire' ? t('Gentle review. The receipts still count.', 'Review santai. Buktinya tetap serius.')
    : intensity === 'Career Ending' ? t('Maximum drama queued. Facts are non-negotiable.', 'Drama sudah siap. Fakta tetap wajib.')
    : scanMode === 'repository' ? t('Show me the repo. Let’s see what you pushed.', 'Tunjukkan reponya. Mari kita lihat apa yang kamu push.')
    : t('Show me the page. Then we can talk.', 'Tunjukkan halamannya. Baru kita ngobrol.')

  const tickerText = <>{t('NO FLUFF', 'TANPA BASA-BASI')}<span className="ticker-separator" aria-hidden="true">✳</span>{t('NO FAKE METRICS', 'TANPA METRIK PALSU')}<span className="ticker-separator" aria-hidden="true">✳</span>{t('JUST HONEST FEEDBACK', 'MASUKAN APA ADANYA')}<span className="ticker-separator" aria-hidden="true">✳</span></>

  const initialSyncDone = useRef(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const search = typeof window !== 'undefined' ? window.location.search : ''
      const cookieStr = typeof document !== 'undefined' ? document.cookie : ''
      const targetLang = resolveInitialLanguage(search, cookieStr)
      if (targetLang !== 'en') {
        setLanguage(targetLang)
      }
      const queryLang = new URLSearchParams(search).get('lang')
      if (isValidLanguage(queryLang)) {
        document.cookie = `${LANGUAGE_COOKIE_NAME}=${queryLang}; path=/; max-age=31536000; SameSite=Lax`
      }
      const mode = resolveScanMode(search)
      if (mode) {
        setScanMode(mode)
      }
      initialSyncDone.current = true
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    document.documentElement.lang = language
    if (!initialSyncDone.current) return
    document.cookie = `${LANGUAGE_COOKIE_NAME}=${language}; path=/; max-age=31536000; SameSite=Lax`
  }, [language])
  useEffect(() => { if (view !== 'home') document.getElementById('main-content')?.focus({ preventScroll: true }) }, [view])
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => {
    if (!isAnalyzing) return
    const timer = window.setTimeout(() => setLongRunning(true), 30_000)
    return () => clearTimeout(timer)
  }, [isAnalyzing])
  useEffect(() => {
    if (!mobileMenu) return
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Element && !event.target.closest('header.nav')) setMobileMenu(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [mobileMenu])
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(view === 'home' ? section : 'top')
      target?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
    })
    return () => cancelAnimationFrame(frame)
  }, [view, section])

  const navigate = (next: View, target = 'top') => {
    setView(next); setSection(target); setMobileMenu(false)
    if (view === next) document.getElementById(next === 'home' ? target : 'top')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }

  const runRoast = async (target = url) => {
    if (controller.current) return
    setLongRunning(false)
    setErrorReaction('disappointed')
    if (!target.trim()) { setError(t('Paste a website URL first. Bro Code needs evidence.', 'Tempel URL website dulu. Bro Code butuh bukti.')); return }
    let normalized: URL
    try {
      const value = target.trim()
      if (value.length > 2048 || /[\u0000-\u0020\u007f\\]/.test(value)) throw new Error('Invalid URL')
      normalized = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`)
      if (!['http:', 'https:'].includes(normalized.protocol) || (!normalized.hostname.includes('.') && !normalized.hostname.startsWith('[')) || normalized.username || normalized.password) throw new Error('Invalid URL')
      if (normalized.port) { setError(t('Use a standard HTTP or HTTPS port (80 or 443). Custom ports cannot be scanned.', 'Gunakan port HTTP atau HTTPS standar (80 atau 443). Port khusus tidak dapat dipindai.')); return }
    } catch { setError(t('Enter a valid public HTTP or HTTPS website URL without credentials.', 'Masukkan URL website publik HTTP atau HTTPS yang valid, tanpa kredensial.')); return }
    setError(''); setIsAnalyzing(true)
    const abort = new AbortController()
    controller.current = abort
    const timeout = window.setTimeout(() => abort.abort(), 170_000)
    try {
      const response = await fetch('/api/roast', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: normalized.href, language, intensity }), signal: abort.signal })
      let payload
      try { payload = await response.json() } catch {
        throw new Error(t('The service returned an unreadable response. Your URL is still here; try again shortly.', 'Respons layanan tidak dapat dibaca. URL-mu tetap tersimpan; coba lagi sebentar.'))
      }
      if (payload === null || typeof payload !== 'object') throw new Error(t('The server returned an invalid report. Try again shortly.', 'Server mengembalikan laporan yang tidak valid. Coba lagi sebentar.'))
      if (!response.ok) {
        const messages: Record<string, string> = {
          SCANNER_UNAVAILABLE: t('The isolated scanner is unavailable. Even Bro Code needs a page he can reach. Try again shortly.', 'Scanner terisolasi tidak tersedia. Bro Code juga butuh halaman yang bisa diakses. Coba lagi sebentar.'),
          SCANNER_BUSY: t('The scanner is busy with another review. Your URL is saved here; try again shortly.', 'Scanner sedang meninjau halaman lain. URL-mu tetap di sini; coba lagi sebentar.'),
          SCANNER_TIMEOUT: t('The scanner timed out. The website may be slow or unavailable. Check the URL and try again.', 'Waktu pemindaian habis. Website mungkin lambat atau tidak tersedia. Periksa URL lalu coba lagi.'),
          RATE_LIMITED: t('Bro, even professional haters need a break. Too many scans; wait ten minutes before retrying.', 'Bro, tukang kritik juga butuh istirahat. Terlalu banyak pemindaian; tunggu sepuluh menit lalu coba lagi.'),
          INVALID_URL: t('Only public HTTP or HTTPS websites on standard ports can be scanned. Check the URL and try again.', 'Hanya website publik HTTP atau HTTPS di port standar yang bisa dipindai. Periksa URL lalu coba lagi.'),
          DEPLOYMENT_NOT_CONFIGURED: t('Scanning is not configured on this deployment. No result was generated. Please try again when the service is available.', 'Pemindaian belum dikonfigurasi pada deployment ini. Tidak ada hasil yang dibuat. Coba lagi saat layanan tersedia.'),
        }
        throw new Error(messages[payload.code] ?? (typeof payload.error === 'string' ? `${id ? 'Pemindaian gagal. Detail layanan: ' : ''}${payload.error}` : t('The scan failed. Please try again.', 'Pemindaian gagal. Silakan coba lagi.')))
      }
      const parsed = reportSchema.safeParse(payload)
      if (!parsed.success) throw new Error(t('The server returned an invalid report. No scan result has been substituted.', 'Server mengembalikan laporan yang tidak valid. Tidak ada hasil pemindaian pengganti.'))
      const next = parsed.data
      if (!isWebsiteReport(next)) throw new Error(t('The server returned an invalid report. No scan result has been substituted.', 'Server mengembalikan laporan yang tidak valid. Tidak ada hasil pemindaian pengganti.'))
      setImproved(Boolean(report && isWebsiteReport(report) && scannedTarget === normalized.href && report.scan.status === 'completed' && next.scan.status === 'completed' && calculateScore(next.scan.findings) < calculateScore(report.scan.findings)))
      setScannedTarget(normalized.href)
      setReport(next); setSelectedIds(next.scan.findings.map(finding => finding.id)); navigate('results')
    } catch (failure) {
      setErrorReaction('confused')
      setError(abort.signal.aborted ? t('The request reached its time limit. No result was invented. Try the URL again.', 'Permintaan melewati batas waktu. Tidak ada hasil yang dibuat-buat. Coba URL ini lagi.') : failure instanceof TypeError ? t('Could not reach the scan service. Check your connection and try again.', 'Layanan pemindaian tidak dapat dihubungi. Periksa koneksi dan coba lagi.') : failure instanceof Error ? failure.message : t('Could not reach the scan service. Please try again.', 'Layanan pemindaian tidak dapat dihubungi. Silakan coba lagi.'))
    } finally { clearTimeout(timeout); controller.current = null; setIsAnalyzing(false) }
  }

  const runRepoRoast = async (target: string) => {
    if (controller.current) return
    setLongRunning(false)
    setErrorReaction('disappointed')
    const trimmed = target.trim()
    if (!trimmed) {
      setError(t('Enter a GitHub repository URL first.', 'Masukkan URL repositori GitHub dulu.'))
      return
    }
    const parsedRepo = parseGitHubUrl(trimmed)
    if (!parsedRepo) {
      setError(t('Enter a valid public GitHub repository URL (e.g. github.com/owner/repo).', 'Masukkan URL repositori GitHub publik yang valid (misal github.com/owner/repo).'))
      return
    }
    setError('')
    setIsAnalyzing(true)
    const abort = new AbortController()
    controller.current = abort
    const timeout = window.setTimeout(() => abort.abort(), 170_000)
    try {
      const response = await fetch('/api/repository/roast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed, language, intensity }),
        signal: abort.signal,
      })
      let payload
      try { payload = await response.json() } catch {
        throw new Error(t('The service returned an unreadable response. Try again shortly.', 'Respons layanan tidak dapat dibaca. Coba lagi sebentar.'))
      }
      if (payload === null || typeof payload !== 'object') throw new Error(t('The server returned an invalid report. Try again shortly.', 'Server mengembalikan laporan yang tidak valid. Coba lagi sebentar.'))
      if (!response.ok) {
        const messages: Record<string, string> = {
          INVALID_REPOSITORY: t('Repository does not exist, is private, or cannot be accessed.', 'Repositori tidak ada, privat, atau tidak dapat diakses.'),
          RATE_LIMITED: t('Bro, too many repository requests. Wait a bit before retrying.', 'Terlalu banyak permintaan repositori. Tunggu sebentar lalu coba lagi.'),
          DEPLOYMENT_NOT_CONFIGURED: t('Repository scanning is not configured on this deployment.', 'Pemindaian repositori belum dikonfigurasi pada deployment ini.'),
        }
        throw new Error(messages[payload.code] ?? (typeof payload.error === 'string' ? payload.error : t('The repository inspection failed. Please try again.', 'Inspeksi repositori gagal. Silakan coba lagi.')))
      }
      const parsed = reportSchema.safeParse(payload)
      if (!parsed.success) throw new Error(t('The server returned an invalid report.', 'Server mengembalikan laporan yang tidak valid.'))
      const next = parsed.data
      if (!isRepositoryReport(next)) throw new Error(t('The server returned an invalid repository report.', 'Server mengembalikan laporan repositori yang tidak valid.'))
      setScannedTarget(trimmed)
      setReport(next)
      setSelectedIds(next.repoScan.findings.map(f => f.id))
      navigate('results')
    } catch (failure) {
      setErrorReaction('confused')
      setError(abort.signal.aborted ? t('The request reached its time limit. Try the repo again.', 'Permintaan melewati batas waktu. Coba repositori ini lagi.') : failure instanceof TypeError ? t('Could not reach the scan service. Check your connection and try again.', 'Layanan pemindaian tidak dapat dihubungi. Periksa koneksi dan coba lagi.') : failure instanceof Error ? failure.message : t('The repository inspection failed.', 'Inspeksi repositori gagal.'))
    } finally {
      clearTimeout(timeout)
      controller.current = null
      setIsAnalyzing(false)
    }
  }

  const logo = <a href="#top" className="logo" onClick={event => { event.preventDefault(); navigate('home') }} aria-label={t('VibeRoast home', 'Beranda VibeRoast')}><span className="logo-flame" aria-hidden="true">✦</span> Vibe<span>Roast</span></a>

  return <main id="top" className="site-shell">
    <a className="skip-link" href="#main-content">{t('Skip to content', 'Langsung ke konten')}</a>
    <header className="nav container" onKeyDown={event => { if (event.key === 'Escape' && mobileMenu) { setMobileMenu(false); event.currentTarget.querySelector<HTMLButtonElement>('.menu-btn')?.focus() } }}>
      {logo}
      <nav id="main-nav" className={mobileMenu ? 'nav-links open' : 'nav-links'} aria-label={t('Main navigation', 'Navigasi utama')}>
        <a href="#roast" aria-current={view === 'home' && section !== 'how' ? 'page' : undefined} onClick={event => { event.preventDefault(); navigate('home', 'roast') }}>Roast</a>
        <a href={`/hall?lang=${language}`}>Hall of Shame</a>
        <a href="#how" aria-current={view === 'home' && section === 'how' ? 'location' : undefined} onClick={event => { event.preventDefault(); navigate('home', 'how') }}>{t('How it works', 'Cara kerja')}</a>
        <button
          className="nav-link-btn"
          type="button"
          onClick={() => {
            setScanMode('repository')
            navigate('home', 'roast')
          }}
          data-testid="nav-github-judge-btn"
        >
          <GitBranch size={14} /> GitHub Judge
        </button>
      </nav>
      <div className="nav-actions">
        <button
          className="lang"
          aria-label={t('Switch to Bahasa Indonesia', 'Ganti ke English')}
          onClick={() => {
            const next = id ? 'en' : 'id'
            initialSyncDone.current = true
            setLanguage(next)
            document.cookie = `${LANGUAGE_COOKIE_NAME}=${next}; path=/; max-age=31536000; SameSite=Lax`
          }}
        >
          {id ? 'ID' : 'EN'} <span aria-hidden="true">/ {id ? 'EN' : 'ID'}</span>
        </button>
        <button className="menu-btn" onClick={() => setMobileMenu(!mobileMenu)} aria-expanded={mobileMenu} aria-controls="main-nav" aria-label={t('Toggle menu', 'Buka atau tutup menu')}>
          {mobileMenu ? <X /> : <Menu />}<span>Menu</span>
        </button>
      </div>
    </header>

    <div id="main-content" tabIndex={-1}>
    {view !== 'home' && (isAnalyzing || error) && <div className="container"><div role={error ? 'alert' : 'status'} className="notice request-status">{error || pendingMessage}</div></div>}
    {view === 'home' && <>
      <section className="hero container" id="roast">
        <div className="hero-copy">
          <div className="eyebrow">
            {scanMode === 'repository'
              ? t('GITHUB REPO AUDIT, WITH REAL CODE', 'AUDIT REPO GITHUB, PAKAI KODE ASLI')
              : t('WEBSITE REVIEW, WITH RECEIPTS', 'ULASAN WEBSITE, PAKAI BUKTI')}{' '}
            <span className="mono">v0.2</span>
          </div>
          <h1>
            {id ? (
              scanMode === 'repository' ? <>Kodemu<br /><em>bersih.</em> Katanya.</> : <>Websitemu<br /><em>bagus.</em> Katanya.</>
            ) : (
              scanMode === 'repository' ? <>Your codebase is<br /><em>clean.</em> Allegedly.</> : <>Your website is<br /><em>good.</em> Allegedly.</>
            )}
          </h1>
          <p className="hero-sub">
            {scanMode === 'repository'
              ? t(
                  'Paste your public GitHub repository URL. Bro Code will inspect the code, flag technical debt, security traps & missing tests, then give you fixes your AI coding agent can ship.',
                  'Tempel URL repositori GitHub publikmu. Bro Code akan memeriksa kode, menandai hutang teknis, jebakan keamanan & pengujian yang hilang, lalu menyiapkan perbaikan untuk agen AI-mu.'
                )
              : t(
                  'Paste your project URL. Bro Code will roast the design, expose the problems, and give you fixes your AI coding agent can ship.',
                  'Tempel URL proyekmu. Bro Code akan mengkritik desainnya, menunjukkan masalahnya, dan menyiapkan perbaikan untuk agen coding-mu.'
                )}
          </p>
          <p className="tagline">
            {t('Your AI built it.', 'AI-mu yang bikin.')}{' '}
            <strong>{t('Our AI judges it.', 'AI kami yang menilai.')}</strong>
          </p>

          <div className="mode-toggle" role="tablist" aria-label={t('Analysis mode', 'Mode analisis')}>
            <button
              type="button"
              role="tab"
              aria-selected={scanMode === 'website'}
              className={`mode-btn ${scanMode === 'website' ? 'active' : ''}`}
              onClick={() => {
                setScanMode('website')
                setError('')
              }}
              data-testid="mode-website-btn"
            >
              🌐 {t('Website Roast', 'Roast Website')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={scanMode === 'repository'}
              className={`mode-btn ${scanMode === 'repository' ? 'active' : ''}`}
              onClick={() => {
                setScanMode('repository')
                setError('')
              }}
              data-testid="mode-repository-btn"
            >
              <GitBranch size={14} /> {t('GitHub Repo Judge', 'Judge Repo GitHub')}
            </button>
          </div>

          {scanMode === 'website' ? (
            <form
              className="input-card"
              aria-busy={isAnalyzing}
              data-invalid={Boolean(error)}
              onSubmit={(event) => {
                event.preventDefault()
                void runRoast()
              }}
              data-testid="website-form"
            >
              <div className="input-top">
                <span className="mono">$ roast --target</span>
                <span className="input-hint">
                  {isAnalyzing ? t('request in flight', 'permintaan diproses') : t('public website URL', 'URL website publik')}
                </span>
              </div>
              <div className="input-row">
                <Terminal aria-hidden="true" />
                <input
                  value={url}
                  onChange={(event) => {
                    setUrl(event.target.value)
                    setError('')
                  }}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  placeholder="https://your-project.example"
                  aria-label={t('Website URL', 'URL website')}
                  autoComplete="url"
                  inputMode="url"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'scan-privacy roast-error' : 'scan-privacy'}
                  disabled={isAnalyzing}
                />
                <button type="submit" className="roast-btn" disabled={isAnalyzing}>
                  {isAnalyzing ? (
                    <>
                      {t('Scanning & analyzing…', 'Memindai & menganalisis…')}
                      <RotateCcw className="rotate" />
                    </>
                  ) : (
                    <>
                      {t('Roast My App', 'Roast Aplikasiku')}
                      <ArrowRight />
                    </>
                  )}
                </button>
              </div>
              <button
                type="button"
                className="repo-toggle"
                onClick={() => {
                  setScanMode('repository')
                  setError('')
                }}
                aria-label={t('Switch to GitHub Repository Judge', 'Ganti ke Judge Repositori GitHub')}
              >
                <GitBranch />
                {t('Switch to GitHub repository judge', 'Beralih ke judge repositori GitHub')}
                <ArrowRight style={{ width: '12px' }} />
              </button>
            </form>
          ) : (
            <RepositoryForm
              language={language}
              isAnalyzing={isAnalyzing}
              error={error}
              setError={setError}
              onRoast={runRepoRoast}
              onFocusChange={setInputFocused}
            />
          )}

          <p id="scan-privacy" className="scan-privacy">
            {scanMode === 'repository'
              ? t(
                  'Public GitHub repositories only. Pinned to commit SHA. Read-only static analysis. Nothing is published automatically.',
                  'Hanya repositori GitHub publik. Terkunci ke commit SHA. Analisis statis baca-saja. Tidak dipublikasikan otomatis.'
                )
              : t(
                  'Public URLs only. Temporary private report. Nothing is published automatically.',
                  'Hanya URL publik. Laporan privat sementara. Tidak dipublikasikan otomatis.'
                )}
          </p>
          {error && (
            <p id="roast-error" className="form-error" role="alert">
              {error}
            </p>
          )}
          {isAnalyzing && (
            <div className="notice" role="status">
              <p>{pendingMessage}</p>
              {longRunning && (
                <p>
                  {t(
                    'Still waiting for the service. You can keep this tab open; the request has a time limit and will return a result or an error, not invented progress.',
                    'Masih menunggu layanan. Biarkan tab ini terbuka; permintaan memiliki batas waktu dan akan menampilkan hasil atau error, bukan progres karangan.'
                  )}
                </p>
              )}
            </div>
          )}

          <div className="intensity" role="group" aria-label={t('Roast intensity', 'Intensitas roasting')}>
            <span className="mono">{t('ROAST INTENSITY', 'INTENSITAS ROASTING')}</span>
            {(['Friendly Fire', 'No Mercy', 'Career Ending'] as const).map((item) => (
              <button
                key={item}
                disabled={isAnalyzing}
                onClick={() => setIntensity(item)}
                aria-describedby={intensity === item ? 'intensity-description' : undefined}
                aria-pressed={intensity === item}
                className={intensity === item ? 'active' : ''}
              >
                {item}
              </button>
            ))}
          </div>
          <p className="intensity-description" id="intensity-description">
            {intensityDescription}
          </p>
        </div>

        <div className="hero-mascot" data-intensity={intensity}>
          <div className="scribble">
            {t('READY TO', 'SIAP')}
            <br />
            <span>{t('JUDGE.', 'MENILAI.')}</span>
            <ArrowDownRight />
          </div>
          <Mascot
            language={language}
            state={
              error
                ? errorReaction
                : isAnalyzing
                ? 'analyzing'
                : inputFocused
                ? 'curious'
                : (url.trim() || scanMode === 'repository')
                ? 'suspicious'
                : 'idle'
            }
          />
          <div className="speech">{speech}</div>
        </div>
      </section>

      <section className="ticker" aria-label={t('Evidence over fake metrics', 'Bukti, bukan metrik palsu')}>
        <div className="ticker-window">
          <div className="ticker-inner" id="home-ticker-track" data-paused={tickerPaused}>
            {[0, 1].map((copy) => (
              <div className="ticker-group" key={copy} aria-hidden={copy === 1 ? true : undefined}>
                <span className="ticker-copy">{tickerText}</span>
                <span className="ticker-copy" aria-hidden="true">{tickerText}</span>
                <span className="ticker-copy" aria-hidden="true">{tickerText}</span>
              </div>
            ))}
          </div>
        </div>
        <button
          className="ticker-toggle"
          type="button"
          aria-controls="home-ticker-track"
          aria-label={tickerPaused ? t('Resume scrolling text', 'Lanjutkan teks berjalan') : t('Pause scrolling text', 'Jeda teks berjalan')}
          onClick={() => setTickerPaused((paused) => !paused)}
        >
          {tickerPaused ? t('Resume', 'Lanjutkan') : t('Pause', 'Jeda')}
        </button>
      </section>

      <section className="section container" id="how">
        <SectionLabel>{t('HOW IT WORKS', 'CARA KERJA')}</SectionLabel>
        <h2>
          {t('Three steps to ', 'Tiga langkah menuju ')}
          <span>{t('character development.', 'pengembangan karakter.')}</span>
        </h2>
        <div className="steps">
          <div>
            <b>01</b>
            <Zap />
            <h3>{t('Submit the evidence.', 'Serahkan buktinya.')}</h3>
            <p>
              {t(
                'Drop a public website URL or a public GitHub repository. No login, no ceremony, no “book a demo”.',
                'Masukkan URL website publik atau repositori GitHub publik. Tanpa login, tanpa basa-basi.'
              )}
            </p>
          </div>
          <div>
            <b>02</b>
            <Search />
            <h3>{t('Get privately judged.', 'Dinilai secara privat.')}</h3>
            <p>
              {t(
                'The scanner records browser and code evidence. AI commentary is grounded in those findings when the provider is available.',
                'Pemindai mencatat bukti dari browser atau kode. Jika layanan tersedia, komentar AI didasarkan pada temuan tersebut.'
              )}
            </p>
          </div>
          <div>
            <b>03</b>
            <Check />
            <h3>{t('Actually fix it.', 'Benar-benar diperbaiki.')}</h3>
            <p>
              {t(
                'Review the evidence. Generate a fix prompt for your coding agent. Redemption is optional.',
                'Tinjau buktinya. Buat prompt perbaikan untuk agen coding-mu. Tobat sih opsional.'
              )}
            </p>
          </div>
        </div>
      </section>

      <section className="preview-band">
        <div className="container preview-grid">
          <div>
            <SectionLabel>{t('ILLUSTRATIVE ROAST · NOT A SCAN', 'CONTOH ROASTING · BUKAN HASIL PEMINDAIAN')}</SectionLabel>
            <h2>
              {id
                ? <>“Bro, animasimu ada tujuh, tapi tombol <span>Daftar</span> malah menuju 404.”</>
                : <>“Bro, your landing page has 7 animations, but the <span>Sign Up</span> button leads straight to a 404.”</>}
            </h2>
            <p className="muted">
              {t(
                'A fictional example of the tone, not a finding about your website. A roast should also tell you what to fix.',
                'Contoh fiktif gaya komentarnya, bukan temuan dari websitemu. Roasting juga harus menjelaskan apa yang perlu diperbaiki.'
              )}
            </p>
            <button className="text-btn" onClick={() => setDialog('example')}>
              {t('Read the illustrative example', 'Baca contoh ilustratif')} <ArrowRight />
            </button>
          </div>
          <div className="terminal-preview">
            <div className="terminal-bar">
              <CircleDot />
              <span>viberoast / {t('illustration.log', 'contoh.log')}</span>
              <span>•••</span>
            </div>
            <div className="terminal-lines">
              <p><i>01</i>{t('fictional viewport...', 'viewport fiktif...')} <strong>{t('example', 'contoh')}</strong></p>
              <p><i>02</i>{t('button hierarchy...', 'hierarki tombol...')} <strong>{t('example', 'contoh')}</strong></p>
              <p><i>03</i>{t('measuring vibe...', 'mengukur aura...')} <mark>{t('not a metric', 'bukan metrik')}</mark></p>
              <p><i>04</i>{t('locating personality...', 'mencari kepribadian...')} <mark>{t('comedy only', 'hanya komedi')}</mark></p>
              <p className="terminal-result">{t('Example verdict:', 'Contoh vonis:')} <b>{t('needs character development.', 'perlu pengembangan karakter.')}</b></p>
            </div>
          </div>
        </div>
      </section>

      <section className="section container split-section">
        <div>
          <SectionLabel>{t('MEET BRO CODE', 'KENALAN DENGAN BRO CODE')}</SectionLabel>
          <h2>
            {t('The senior dev', 'Senior developer')}<br />
            {t('you ', 'yang ')}<span>{t('didn’t hire.', 'tak kamu rekrut.')}</span>
          </h2>
          <p className="muted wide">
            {t(
              'A skeptical fictional reviewer with a soft spot for readable interfaces. Bro Code doesn’t care about your pitch deck. He cares about your line-height.',
              'Reviewer fiktif yang skeptis, tapi suka antarmuka yang mudah dibaca. Bro Code tidak peduli pitch deck-mu. Dia peduli line-height-mu.'
            )}
          </p>
          <button className="outline-btn" onClick={() => setDialog('manifesto')}>
            {t('Read his manifesto', 'Baca manifestonya')} <ArrowRight />
          </button>
        </div>
        <div className="quote-card">
          <Mascot small language={language} />
          <p>{t('“Good design is when I don’t have to explain the button to you.”', '“Desain bagus itu kalau tombolnya tidak perlu dijelaskan dulu.”')}</p>
          <small>Bro Code, {t('a fictional reviewer', 'reviewer fiktif')}</small>
        </div>
      </section>

      <section className="redemption container">
        <div className="redemption-copy">
          <SectionLabel>{t('REDEMPTION ARC', 'JALUR PENEBUSAN')}</SectionLabel>
          <h2>
            {t('Roasted.', 'Diroasting.')}<br />
            <span>{t('Fixed.', 'Diperbaiki.')}</span><br />
            {t('Redeemed.', 'Ditebus.')}
          </h2>
          <p>{t('Copy the fix prompt. Ship the changes. Come back and make Bro Code proud.', 'Salin prompt perbaikan. Terapkan perubahannya. Kembali dan bikin Bro Code bangga.')}</p>
          <button className="dark-btn" onClick={() => navigate(report ? 'fixes' : 'home', report ? 'top' : 'roast')}>
            {report ? t('Enter fix mode', 'Masuk mode perbaikan') : t('Scan a URL to unlock fixes', 'Pindai URL untuk membuat perbaikan')} <ArrowRight />
          </button>
        </div>
        <div>
          <p className="illustration-label">{t('ILLUSTRATIVE BEFORE / AFTER · NOT MEASURED RESULTS', 'ILUSTRASI SEBELUM / SESUDAH · BUKAN HASIL PENGUKURAN')}</p>
          <div className="before-after">
            <div className="mock-screen before">
              <div className="mock-top" />
              <div className="mock-body">
                <span>HELLO WORLD</span>
                <b>{t('We make software.', 'Kami bikin software.')}</b>
                <i>{t('Sign up', 'Daftar')}</i>
              </div>
              <label>{t('BEFORE · EXAMPLE', 'SEBELUM · CONTOH')}</label>
            </div>
            <ArrowRight />
            <div className="mock-screen after">
              <div className="mock-top" />
              <div className="mock-body">
                <span>hello, human</span>
                <b>{t('Your next task.', 'Tugas berikutnya.')}<br />{t('One clear action.', 'Satu aksi jelas.')}</b>
                <i>{t('Create a task', 'Buat tugas')}</i>
              </div>
              <label>{t('AFTER · EXAMPLE', 'SESUDAH · CONTOH')}</label>
            </div>
          </div>
        </div>
      </section>

      <section className="hall-preview container" id="hall">
        <div className="hall-heading">
          <div>
            <SectionLabel>{t('ILLUSTRATIVE EXAMPLES · NOT COMMUNITY DATA', 'CONTOH ILUSTRATIF · BUKAN DATA KOMUNITAS')}</SectionLabel>
            <h2>Hall of <span>Shame.</span></h2>
          </div>
          <a href={`/hall?lang=${language}`} className="outline-btn">
            {t('Browse examples', 'Lihat contoh')} <ArrowRight />
          </a>
        </div>
        <div className="leader-list">
          {PUBLIC_PREVIEW_EXAMPLES.map((item) => (
            <div className="leader-row" key={item.name}>
              <span className="rank">{item.rank}</span>
              <div className={`thumb ${item.color}`} aria-hidden="true" />
              <div className="leader-main">
                <b>{item.name} <small>({t('fictional', 'fiktif')})</small></b>
                <span>{id ? item.id : item.en}</span>
              </div>
              <strong className="score">
                {item.score}<small>{t(' comedy heat', ' panas komedi')}</small>
              </strong>
            </div>
          ))}
        </div>
      </section>

      <section className="final-cta container">
        <Mascot small language={language} state="helpful" />
        <div>
          <SectionLabel>{t('YOUR TURN', 'GILIRANMU')}</SectionLabel>
          <h2>{t('Let him cook.', 'Biar dia menilai.')}</h2>
          <p>{t('Real evidence. A little attitude.', 'Bukti nyata. Sedikit nyinyir.')}</p>
        </div>
        <button
          className="roast-btn"
          onClick={() => {
            navigate('home', 'roast')
            document.querySelector<HTMLInputElement>('input[autocomplete="url"]')?.focus()
          }}
        >
          {t('Roast My App', 'Roast Aplikasiku')} <ArrowRight />
        </button>
      </section>
    </>}

    {view === 'results' && report && isWebsiteReport(report) && (
      <Results
        key={report.id}
        report={report}
        language={language}
        improved={improved}
        fixes={() => navigate('fixes')}
        home={() => navigate('home')}
        rescan={() => void runRoast(scannedTarget)}
        scanning={isAnalyzing}
      />
    )}

    {view === 'results' && report && isRepositoryReport(report) && (
      <RepoResults
        key={report.id}
        report={report}
        language={language}
        fixes={() => navigate('fixes')}
        home={() => navigate('home')}
        rescan={() => void runRepoRoast(scannedTarget)}
        scanning={isAnalyzing}
      />
    )}

    {view === 'fixes' && report && isWebsiteReport(report) && (
      <Fixes
        key={report.id}
        report={report}
        language={language}
        selectedIds={selectedIds}
        select={setSelectedIds}
        results={() => navigate('results')}
      />
    )}

    {view === 'fixes' && report && isRepositoryReport(report) && (
      <RepositoryFix
        key={report.id}
        report={report}
        language={language}
        selectedIds={selectedIds}
        select={setSelectedIds}
        results={() => navigate('results')}
      />
    )}
    </div>

    <footer className="footer container">
      {logo}
      <span>{t('Built with questionable taste & good intentions.', 'Dibuat dengan selera meragukan & niat baik.')}</span>
      <span>© {new Date().getFullYear()} VibeRoast</span>
    </footer>

    {dialog && (
      <Dialog
        language={language}
        close={() => setDialog(null)}
        title={dialog === 'manifesto' ? t('Bro Code’s manifesto', 'Manifesto Bro Code') : t('An illustrative roast', 'Contoh roasting ilustratif')}
      >
        {dialog === 'manifesto' ? (
          <>
            <p>{t('Roast the interface, not the person. Evidence before opinions. No imaginary bugs. No invented success metrics.', 'Kritik antarmukanya, bukan orangnya. Bukti sebelum opini. Tidak mengarang bug. Tidak mengarang metrik keberhasilan.')}</p>
            <p>{t('Keep what works. Confirm uncertain findings. Make the next action obvious. And never confuse a comedy score with a professional audit.', 'Pertahankan yang sudah benar. Konfirmasikan temuan yang belum pasti. Buat tindakan berikutnya jelas. Jangan samakan skor komedi dengan audit profesional.')}</p>
          </>
        ) : (
          <>
            <p className="notice">{t('Fictional example, not a scan of your site.', 'Contoh fiktif, bukan hasil pemindaian situsmu.')}</p>
            <h3>{t('A beautiful dead end is still a dead end.', 'Jalan buntu yang cantik tetap jalan buntu.')}</h3>
            <p>{t('If a sign-up action returns 404, confirm its destination in the browser. Fix the route or link, then test the complete sign-up journey. An animation count alone does not prove a usability problem.', 'Jika tombol daftar menuju 404, konfirmasikan tujuannya di browser. Perbaiki rute atau tautannya, lalu uji seluruh alur pendaftaran. Jumlah animasi saja tidak membuktikan masalah kegunaan.')}</p>
            <button
              className="dark-btn"
              onClick={() => {
                setDialog(null)
                navigate('home', 'roast')
              }}
            >
              {t('Scan my own URL', 'Pindai URL saya')}
            </button>
          </>
        )}
      </Dialog>
    )}
  </main>
}
