'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowDownRight, ArrowRight, Check, ChevronDown, CircleDot, GitBranch, Menu, RotateCcw, Search, Terminal, X, Zap } from 'lucide-react'
import type { Intensity, Language, RoastReport } from '@/lib/types/report'
import { reportSchema } from '@/lib/types/report'
import { calculateScore } from '@/lib/roast/score'
import { Mascot } from '@/components/bro-code/mascot'
import { Results } from '@/components/roast/results'
import { Fixes } from '@/components/fixes/fixes'
import { examples, Hall } from '@/components/roast/hall'
import { Dialog, SectionLabel } from '@/components/shared/primitives'

type View = 'home' | 'results' | 'fixes' | 'hall'

export default function Page() {
  const [language, setLanguage] = useState<Language>('en')
  const [url, setUrl] = useState('')
  const [repoOpen, setRepoOpen] = useState(false)
  const [intensity, setIntensity] = useState<Intensity>('No Mercy')
  const [view, setView] = useState<View>('home')
  const [section, setSection] = useState('top')
  const [mobileMenu, setMobileMenu] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [report, setReport] = useState<RoastReport | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [scannedTarget, setScannedTarget] = useState('')
  const [improved, setImproved] = useState(false)
  const [dialog, setDialog] = useState<'manifesto' | 'example' | null>(null)
  const controller = useRef<AbortController | null>(null)
  const id = language === 'id'
  const t = (en: string, indo: string) => id ? indo : en

  useEffect(() => { document.documentElement.lang = language }, [language])
  useEffect(() => { if (view !== 'home') document.getElementById('main-content')?.focus({ preventScroll: true }) }, [view])
  useEffect(() => () => controller.current?.abort(), [])
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
    if (!target.trim()) { setError(t('Paste a website URL first. Bro Code needs evidence.', 'Tempel URL website dulu. Bro Code butuh bukti.')); return }
    let normalized: URL
    try {
      normalized = new URL(/^[a-z][a-z\d+.-]*:/i.test(target.trim()) ? target.trim() : `https://${target.trim()}`)
      if (!['http:', 'https:'].includes(normalized.protocol) || !normalized.hostname || normalized.username || normalized.password) throw new Error('Invalid URL')
    } catch { setError(t('Enter a valid public HTTP or HTTPS website URL without credentials.', 'Masukkan URL website publik HTTP atau HTTPS yang valid, tanpa kredensial.')); return }
    setUrl(normalized.href); setError(''); setIsAnalyzing(true)
    const abort = new AbortController()
    controller.current = abort
    const timeout = window.setTimeout(() => abort.abort(), 130_000)
    try {
      const response = await fetch('/api/roast', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: normalized.href, language, intensity }), signal: abort.signal })
      const payload = await response.json()
      if (!response.ok) throw new Error(typeof payload.error === 'string' ? `${id ? 'Pemindaian gagal. Detail layanan: ' : ''}${payload.error}${typeof payload.code === 'string' ? ` (${payload.code})` : ''}` : t('The scan failed. Please try again.', 'Pemindaian gagal. Silakan coba lagi.'))
      const parsed = reportSchema.safeParse(payload)
      if (!parsed.success) throw new Error(t('The server returned an invalid report. No scan result has been substituted.', 'Server mengembalikan laporan yang tidak valid. Tidak ada hasil pemindaian pengganti.'))
      const next = parsed.data
      setImproved(Boolean(report && scannedTarget === normalized.href && report.scan.status === 'completed' && next.scan.status === 'completed' && calculateScore(next.scan.findings) < calculateScore(report.scan.findings)))
      setScannedTarget(normalized.href)
      setReport(next); setSelectedIds(next.scan.findings.map(finding => finding.id)); navigate('results')
    } catch (failure) {
      setError(abort.signal.aborted ? t('The request reached its time limit. No result was invented. Try the URL again.', 'Permintaan melewati batas waktu. Tidak ada hasil yang dibuat-buat. Coba URL ini lagi.') : failure instanceof TypeError ? t('Could not reach the scan service. Check your connection and try again.', 'Layanan pemindaian tidak dapat dihubungi. Periksa koneksi dan coba lagi.') : failure instanceof Error ? failure.message : t('Could not reach the scan service. Please try again.', 'Layanan pemindaian tidak dapat dihubungi. Silakan coba lagi.'))
    } finally { clearTimeout(timeout); controller.current = null; setIsAnalyzing(false) }
  }

  const logo = <a href="#top" className="logo" onClick={event => { event.preventDefault(); navigate('home') }} aria-label={t('VibeRoast home', 'Beranda VibeRoast')}><span className="logo-flame" aria-hidden="true">✦</span> Vibe<span>Roast</span></a>
  return <main id="top" className="site-shell">
    <a className="skip-link" href="#main-content">{t('Skip to content', 'Langsung ke konten')}</a>
    <header className="nav container">{logo}<nav id="main-nav" className={mobileMenu ? 'nav-links open' : 'nav-links'} aria-label={t('Main navigation', 'Navigasi utama')}><a href="#roast" onClick={event => { event.preventDefault(); navigate('home', 'roast') }}>Roast</a><a href="#hall" onClick={event => { event.preventDefault(); navigate('hall') }}>Hall of Shame</a><a href="#how" onClick={event => { event.preventDefault(); navigate('home', 'how') }}>{t('How it works', 'Cara kerja')}</a><button className="nav-unavailable" disabled><GitBranch /> GitHub · {t('Coming soon', 'Segera hadir')}</button></nav><div className="nav-actions"><button className="lang" aria-label={t('Switch to Bahasa Indonesia', 'Ganti ke English')} onClick={() => setLanguage(id ? 'en' : 'id')}>{id ? 'ID' : 'EN'} <span aria-hidden="true">/ {id ? 'EN' : 'ID'}</span></button><button className="menu-btn" onClick={() => setMobileMenu(!mobileMenu)} aria-expanded={mobileMenu} aria-controls="main-nav" aria-label={t('Toggle menu', 'Buka atau tutup menu')}>{mobileMenu ? <X /> : <Menu />}<span>Menu</span></button></div></header>
    <div id="main-content" tabIndex={-1}>
    {view !== 'home' && (isAnalyzing || error) && <div className="container"><div role={error ? 'alert' : 'status'} className="notice request-status">{error || t('Scanning the page and requesting evidence-based analysis. Waiting for the service; progress cannot be measured.', 'Memindai halaman dan meminta analisis berbasis bukti. Menunggu layanan; progres tidak dapat diukur.')}</div></div>}
    {view === 'home' && <>
      <section className="hero container" id="roast"><div className="hero-copy"><div className="eyebrow">{t('WEBSITE REVIEW, WITH RECEIPTS', 'ULASAN WEBSITE, PAKAI BUKTI')} <span className="mono">v0.1</span></div><h1>{id ? <>Websitemu<br /><em>bagus.</em> Katanya.</> : <>Your website is<br /><em>good.</em> Allegedly.</>}</h1><p className="hero-sub">{t('Paste your project URL. Bro Code will roast the design, expose the problems, and give you fixes your AI coding agent can ship.', 'Tempel URL proyekmu. Bro Code akan mengkritik desainnya, menunjukkan masalahnya, dan menyiapkan perbaikan untuk agen coding-mu.')}</p><p className="tagline">{t('Your AI built it.', 'AI-mu yang bikin.')} <strong>{t('Our AI judges it.', 'AI kami yang menilai.')}</strong></p>
      <form className="input-card" onSubmit={event => { event.preventDefault(); void runRoast() }}><div className="input-top"><span className="mono">$ roast --target</span><span className="input-hint">{url ? t('ready to judge', 'siap dinilai') : t('paste a URL to begin', 'tempel URL untuk mulai')}</span></div><div className="input-row"><Terminal aria-hidden="true" /><input value={url} onChange={event => setUrl(event.target.value)} placeholder="https://your-project.example" aria-label={t('Website URL', 'URL website')} autoComplete="url" inputMode="url" aria-describedby={error ? 'roast-error' : 'scan-privacy'} disabled={isAnalyzing} /><button type="submit" className="roast-btn" disabled={isAnalyzing}>{isAnalyzing ? t('Scanning & analyzing…', 'Memindai & menganalisis…') : t('Roast My App', 'Roast Aplikasiku')}{isAnalyzing ? <RotateCcw /> : <ArrowRight />}</button></div><button type="button" className="repo-toggle" onClick={() => setRepoOpen(!repoOpen)} aria-expanded={repoOpen} aria-controls="repo-coming-soon"><GitBranch />{t('GitHub repository · Coming soon', 'Repositori GitHub · Segera hadir')}<ChevronDown className={repoOpen ? 'rotate' : ''} /></button>{repoOpen && <div id="repo-coming-soon"><input className="repo-input" placeholder="github.com/you/your-project" aria-label={t('GitHub repository: coming soon', 'Repositori GitHub: segera hadir')} disabled /><p className="muted">{t('Repository scanning is not supported yet. Only the website URL above will be scanned.', 'Pemindaian repositori belum tersedia. Hanya URL website di atas yang akan dipindai.')}</p></div>}</form>
      <p id="scan-privacy" className="scan-privacy">{t('Public URLs only. Temporary private report. Nothing is published automatically.', 'Hanya URL publik. Laporan privat sementara. Tidak dipublikasikan otomatis.')}</p>{error && <p id="roast-error" className="form-error" role="alert">{error}</p>}{isAnalyzing && <p className="notice" role="status">{t('Scanning the page and requesting evidence-based analysis. Waiting for the service; progress cannot be measured.', 'Memindai halaman dan meminta analisis berbasis bukti. Menunggu layanan; progres tidak dapat diukur.')}</p>}
      <div className="intensity" aria-label={t('Roast intensity', 'Intensitas roasting')}><span className="mono">{t('ROAST INTENSITY', 'INTENSITAS ROASTING')}</span>{(['Friendly Fire', 'No Mercy', 'Career Ending'] as const).map(item => <button key={item} disabled={isAnalyzing} onClick={() => setIntensity(item)} aria-pressed={intensity === item} className={intensity === item ? 'active' : ''}>{item}</button>)}</div>
      </div><div className="hero-mascot"><div className="scribble">{t('READY TO', 'SIAP')}<br /><span>{t('JUDGE.', 'MENILAI.')}</span><ArrowDownRight /></div><Mascot language={language} state={error ? 'suspicious' : isAnalyzing ? 'analyzing' : url.trim() ? 'suspicious' : 'idle'} /><div className="speech">{t('“I’ve seen better landing pages in a 404 error.”', '“Halaman 404 saja kadang lebih niat dari ini.”')}</div></div></section>
      <section className="ticker" aria-label={t('Evidence over fake metrics', 'Bukti, bukan metrik palsu')}><div className="ticker-inner">{t('NO FLUFF', 'TANPA BASA-BASI')} <span>✳</span> {t('NO FAKE METRICS', 'TANPA METRIK PALSU')} <span>✳</span> {t('JUST HONEST FEEDBACK', 'MASUKAN APA ADANYA')} <span>✳</span> {t('NO FLUFF', 'TANPA BASA-BASI')} <span>✳</span> {t('NO FAKE METRICS', 'TANPA METRIK PALSU')} <span>✳</span></div></section>
      <section className="section container" id="how"><SectionLabel>{t('HOW IT WORKS', 'CARA KERJA')}</SectionLabel><h2>{t('Three steps to ', 'Tiga langkah menuju ')}<span>{t('character development.', 'pengembangan karakter.')}</span></h2><div className="steps"><div><b>01</b><Zap /><h3>{t('Submit the evidence.', 'Serahkan buktinya.')}</h3><p>{t('Drop a public website URL. No login, no ceremony, no “book a demo”. GitHub scanning is coming soon.', 'Masukkan URL website publik. Tanpa login, tanpa basa-basi. Pemindaian GitHub menyusul.')}</p></div><div><b>02</b><Search /><h3>{t('Get privately judged.', 'Dinilai secara privat.')}</h3><p>{t('The scanner records browser evidence. AI commentary is grounded in those findings when the provider is available.', 'Pemindai mencatat bukti dari browser. Jika layanan tersedia, komentar AI didasarkan pada temuan tersebut.')}</p></div><div><b>03</b><Check /><h3>{t('Actually fix it.', 'Benar-benar diperbaiki.')}</h3><p>{t('Review the evidence. Generate a fix prompt for your coding agent. Redemption is optional.', 'Tinjau buktinya. Buat prompt perbaikan untuk agen coding-mu. Tobat sih opsional.')}</p></div></div></section>
      <section className="preview-band"><div className="container preview-grid"><div><SectionLabel>{t('ILLUSTRATIVE ROAST · NOT A SCAN', 'CONTOH ROASTING · BUKAN HASIL PEMINDAIAN')}</SectionLabel><h2>{id ? <>“Bro, animasimu ada tujuh, tapi tombol <span>Daftar</span> malah menuju 404.”</> : <>“Bro, your landing page has 7 animations, but the <span>Sign Up</span> button leads straight to a 404.”</>}</h2><p className="muted">{t('A fictional example of the tone, not a finding about your website. A roast should also tell you what to fix.', 'Contoh fiktif gaya komentarnya, bukan temuan dari websitemu. Roasting juga harus menjelaskan apa yang perlu diperbaiki.')}</p><button className="text-btn" onClick={() => setDialog('example')}>{t('Read the illustrative example', 'Baca contoh ilustratif')} <ArrowRight /></button></div><div className="terminal-preview"><div className="terminal-bar"><CircleDot /><span>viberoast / {t('illustration.log', 'contoh.log')}</span><span>•••</span></div><div className="terminal-lines"><p><i>01</i>{t('fictional viewport...', 'viewport fiktif...')} <strong>{t('example', 'contoh')}</strong></p><p><i>02</i>{t('button hierarchy...', 'hierarki tombol...')} <strong>{t('example', 'contoh')}</strong></p><p><i>03</i>{t('measuring vibe...', 'mengukur aura...')} <mark>{t('not a metric', 'bukan metrik')}</mark></p><p><i>04</i>{t('locating personality...', 'mencari kepribadian...')} <mark>{t('comedy only', 'hanya komedi')}</mark></p><p className="terminal-result">{t('Example verdict:', 'Contoh vonis:')} <b>{t('needs character development.', 'perlu pengembangan karakter.')}</b></p></div></div></div></section>
      <section className="section container split-section"><div><SectionLabel>{t('MEET BRO CODE', 'KENALAN DENGAN BRO CODE')}</SectionLabel><h2>{t('The senior dev', 'Senior developer')}<br />{t('you ', 'yang ')}<span>{t('didn’t hire.', 'tak kamu rekrut.')}</span></h2><p className="muted wide">{t('A skeptical fictional reviewer with a soft spot for readable interfaces. Bro Code doesn’t care about your pitch deck. He cares about your line-height.', 'Reviewer fiktif yang skeptis, tapi suka antarmuka yang mudah dibaca. Bro Code tidak peduli pitch deck-mu. Dia peduli line-height-mu.')}</p><button className="outline-btn" onClick={() => setDialog('manifesto')}>{t('Read his manifesto', 'Baca manifestonya')} <ArrowRight /></button></div><div className="quote-card"><Mascot small language={language} /><p>{t('“Good design is when I don’t have to explain the button to you.”', '“Desain bagus itu kalau tombolnya tidak perlu dijelaskan dulu.”')}</p><small>Bro Code, {t('a fictional reviewer', 'reviewer fiktif')}</small></div></section>
      <section className="redemption container"><div className="redemption-copy"><SectionLabel>{t('REDEMPTION ARC', 'JALUR PENEBUSAN')}</SectionLabel><h2>{t('Roasted.', 'Diroasting.')}<br /><span>{t('Fixed.', 'Diperbaiki.')}</span><br />{t('Redeemed.', 'Ditebus.')}</h2><p>{t('Copy the fix prompt. Ship the changes. Come back and make Bro Code proud.', 'Salin prompt perbaikan. Terapkan perubahannya. Kembali dan bikin Bro Code bangga.')}</p><button className="dark-btn" onClick={() => navigate(report ? 'fixes' : 'home', report ? 'top' : 'roast')}>{report ? t('Enter fix mode', 'Masuk mode perbaikan') : t('Scan a URL to unlock fixes', 'Pindai URL untuk membuat perbaikan')} <ArrowRight /></button></div><div><p className="illustration-label">{t('ILLUSTRATIVE BEFORE / AFTER · NOT MEASURED RESULTS', 'ILUSTRASI SEBELUM / SESUDAH · BUKAN HASIL PENGUKURAN')}</p><div className="before-after"><div className="mock-screen before"><div className="mock-top" /><div className="mock-body"><span>HELLO WORLD</span><b>{t('We make software.', 'Kami bikin software.')}</b><i>{t('Sign up', 'Daftar')}</i></div><label>{t('BEFORE · EXAMPLE', 'SEBELUM · CONTOH')}</label></div><ArrowRight /><div className="mock-screen after"><div className="mock-top" /><div className="mock-body"><span>hello, human</span><b>{t('Your next task.', 'Tugas berikutnya.')}<br />{t('One clear action.', 'Satu aksi jelas.')}</b><i>{t('Create a task', 'Buat tugas')}</i></div><label>{t('AFTER · EXAMPLE', 'SESUDAH · CONTOH')}</label></div></div></div></section>
      <section className="hall-preview container" id="hall"><div className="hall-heading"><div><SectionLabel>{t('ILLUSTRATIVE EXAMPLES · NOT COMMUNITY DATA', 'CONTOH ILUSTRATIF · BUKAN DATA KOMUNITAS')}</SectionLabel><h2>Hall of <span>Shame.</span></h2></div><button className="outline-btn" onClick={() => navigate('hall')}>{t('Browse examples', 'Lihat contoh')} <ArrowRight /></button></div><div className="leader-list">{examples.map(item => <div className="leader-row" key={item.name}><span className="rank">{item.rank}</span><div className={`thumb ${item.color}`} aria-hidden="true" /><div className="leader-main"><b>{item.name} <small>({t('fictional', 'fiktif')})</small></b><span>{id ? item.id : item.en}</span></div><strong className="score">{item.score}<small>{t(' comedy heat', ' panas komedi')}</small></strong></div>)}</div></section>
      <section className="final-cta container"><Mascot small language={language} state="helpful" /><div><SectionLabel>{t('YOUR TURN', 'GILIRANMU')}</SectionLabel><h2>{t('Let him cook.', 'Biar dia menilai.')}</h2><p>{t('Real evidence. A little attitude.', 'Bukti nyata. Sedikit nyinyir.')}</p></div><button className="roast-btn" onClick={() => { navigate('home', 'roast'); document.querySelector<HTMLInputElement>('input[autocomplete="url"]')?.focus() }}>{t('Roast My App', 'Roast Aplikasiku')} <ArrowRight /></button></section>
    </>}
    {view === 'results' && report && <Results key={report.id} report={report} language={language} improved={improved} fixes={() => navigate('fixes')} home={() => navigate('home')} rescan={() => void runRoast(scannedTarget)} scanning={isAnalyzing} />}
    {view === 'fixes' && report && <Fixes key={report.id} report={report} language={language} selectedIds={selectedIds} select={setSelectedIds} results={() => navigate('results')} />}
    {view === 'hall' && <Hall language={language} home={() => navigate('home')} />}
    </div>
    <footer className="footer container">{logo}<span>{t('Built with questionable taste & good intentions.', 'Dibuat dengan selera meragukan & niat baik.')}</span><span>© {new Date().getFullYear()} VibeRoast</span></footer>
    {dialog && <Dialog language={language} close={() => setDialog(null)} title={dialog === 'manifesto' ? t('Bro Code’s manifesto', 'Manifesto Bro Code') : t('An illustrative roast', 'Contoh roasting ilustratif')}>{dialog === 'manifesto' ? <><p>{t('Roast the interface, not the person. Evidence before opinions. No imaginary bugs. No invented success metrics.', 'Kritik antarmukanya, bukan orangnya. Bukti sebelum opini. Tidak mengarang bug. Tidak mengarang metrik keberhasilan.')}</p><p>{t('Keep what works. Confirm uncertain findings. Make the next action obvious. And never confuse a comedy score with a professional audit.', 'Pertahankan yang sudah benar. Konfirmasikan temuan yang belum pasti. Buat tindakan berikutnya jelas. Jangan samakan skor komedi dengan audit profesional.')}</p></> : <><p className="notice">{t('Fictional example, not a scan of your site.', 'Contoh fiktif, bukan hasil pemindaian situsmu.')}</p><h3>{t('A beautiful dead end is still a dead end.', 'Jalan buntu yang cantik tetap jalan buntu.')}</h3><p>{t('If a sign-up action returns 404, confirm its destination in the browser. Fix the route or link, then test the complete sign-up journey. An animation count alone does not prove a usability problem.', 'Jika tombol daftar menuju 404, konfirmasikan tujuannya di browser. Perbaiki rute atau tautannya, lalu uji seluruh alur pendaftaran. Jumlah animasi saja tidak membuktikan masalah kegunaan.')}</p><button className="dark-btn" onClick={() => { setDialog(null); navigate('home', 'roast') }}>{t('Scan my own URL', 'Pindai URL saya')}</button></>}</Dialog>}
  </main>
}
