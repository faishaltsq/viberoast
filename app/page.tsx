'use client'

import { useState } from 'react'
import {
  ArrowDownRight,
  ArrowRight,
  Check,
  ChevronDown,
  CircleDot,
  Copy,
  GitBranch,
  Heart,
  Link2,
  Menu,
  Play,
  RotateCcw,
  Search,
  Share2,
  Sparkles,
  Terminal,
  X,
  Zap,
} from 'lucide-react'

const findings = [
  { title: 'CTA lu lebih misterius daripada roadmap startup.', issue: 'Primary action lacks contrast and clear hierarchy in the hero section.', evidence: 'The coral button competes with three secondary links above the fold.', severity: 'HIGH', fix: 'Use one dominant CTA, increase contrast, and move the supporting action below it.' },
  { title: 'Banyak gerak, sedikit arah.', issue: 'Seven animated elements draw attention away from the product value proposition.', evidence: 'Hero animation density is high while the next action remains unclear.', severity: 'MED', fix: 'Keep one purposeful motion cue and reduce decorative transitions.' },
  { title: 'Mobile-nya disuruh diet layout.', issue: 'The hero grid collapses too late for narrow screens.', evidence: 'The preview shows a 2-column layout below 768px.', severity: 'HIGH', fix: 'Stack the preview and form at 900px, preserving comfortable tap targets.' },
]

const leaderboard = [
  { name: 'TaskToast', verdict: 'Bro, your empty state has more personality than the app.', score: 91, emoji: '01', color: 'green' },
  { name: 'CryptoBros.app', verdict: 'The gradients called. They want their 2021 back.', score: 38, emoji: '02', color: 'red' },
  { name: 'SaaSStarter', verdict: 'It is giving template, but at least the template is centered.', score: 64, emoji: '03', color: 'yellow' },
]

function Logo() {
  return <a href="#top" className="logo" aria-label="VibeRoast home"><span className="logo-flame">✦</span> Vibe<span>Roast</span></a>
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="section-label"><span className="dot" /> {children}</div>
}

function Mascot({ small = false }: { small?: boolean }) {
  return <div className={`mascot-wrap ${small ? 'mascot-small' : ''}`}><img src="/bro-code.png" alt="Bro Code, the skeptical CRT code reviewer" /></div>
}

export default function Page() {
  const [url, setUrl] = useState('')
  const [repoOpen, setRepoOpen] = useState(false)
  const [intensity, setIntensity] = useState('No Mercy')
  const [view, setView] = useState<'home' | 'results' | 'fixes' | 'hall'>('home')
  const [expanded, setExpanded] = useState<number | null>(0)
  const [copied, setCopied] = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)

  const runRoast = () => { setView('results'); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const copyPrompt = async () => { setCopied(true); await navigator.clipboard?.writeText('Improve the VibeRoast findings: clarify the primary CTA, reduce competing motion, and stack the hero layout for mobile.'); setTimeout(() => setCopied(false), 1800) }

  return <main id="top" className="site-shell">
    <header className="nav container">
      <Logo />
      <nav className={mobileMenu ? 'nav-links open' : 'nav-links'}>
        <a href="#roast" onClick={() => setMobileMenu(false)}>Roast</a>
        <a href="#hall" onClick={() => { setView('hall'); setMobileMenu(false) }}>Hall of Shame</a>
        <a href="#how">How it works</a>
        <a href="https://github.com" target="_blank" rel="noreferrer"><GitBranch /> GitHub</a>
      </nav>
      <div className="nav-actions"><button className="lang">ID <span>/</span> EN</button><button className="menu-btn" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Toggle menu">{mobileMenu ? <X /> : <Menu />}</button></div>
    </header>

    {view === 'home' && <>
      <section className="hero container" id="roast">
        <div className="hero-copy"><div className="eyebrow"><span className="live-dot" /> AI-POWERED DESIGN AUDIT <span className="mono">v0.1</span></div><h1>Website lu<br /><em>bagus.</em> Katanya.</h1><p className="hero-sub">Masukin URL project lu. Bro Code bakal nge-roast desainnya, bongkar masalahnya, terus kasih solusi yang bisa langsung dikerjain AI agent lu.</p><p className="tagline">Your AI built it. <strong>Our AI judges it.</strong></p>
          <div className="input-card"><div className="input-top"><span className="mono">$ roast --target</span><span className="input-hint">{url ? 'ready to judge' : 'paste a URL to begin'}</span></div><div className="input-row"><Terminal /><input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.nativeEvent.isComposing && runRoast()} placeholder="https://your-questionable-saas.vercel.app" aria-label="Website URL" /><button className="roast-btn" onClick={runRoast}>Roast My App <ArrowRight /></button></div><button className="repo-toggle" onClick={() => setRepoOpen(!repoOpen)}><GitBranch /> {repoOpen ? 'Hide repository option' : 'Or add a GitHub repository'} <ChevronDown className={repoOpen ? 'rotate' : ''} /></button>{repoOpen && <input className="repo-input" placeholder="github.com/you/your-project" aria-label="GitHub repository" />}</div>
          <div className="intensity"><span className="mono">ROAST INTENSITY</span>{['Friendly Fire', 'No Mercy', 'Career Ending'].map(item => <button key={item} onClick={() => setIntensity(item)} className={intensity === item ? 'active' : ''}>{item}</button>)}</div>
        </div><div className="hero-mascot"><div className="scribble">READY TO<br /><span>JUDGE.</span><ArrowDownRight /></div><Mascot /><div className="speech">“I’ve seen better<br />landing pages in a<br />404 error.”</div></div>
      </section>

      <section className="ticker"><div className="ticker-inner">NO FLUFF <span>✳</span> NO FAKE METRICS <span>✳</span> JUST HONEST FEEDBACK <span>✳</span> NO FLUFF <span>✳</span> NO FAKE METRICS <span>✳</span> JUST HONEST FEEDBACK <span>✳</span></div></section>
      <section className="section container" id="how"><SectionLabel>HOW IT WORKS</SectionLabel><h2>Three steps to <span>character development.</span></h2><div className="steps"><div><b>01</b><Zap /><h3>Submit the evidence.</h3><p>Drop a URL or GitHub repo. No login, no ceremony, no “book a demo”.</p></div><div><b>02</b><Search /><h3>Get publicly judged.</h3><p>Bro Code audits your UI, UX, accessibility, and overall questionable decisions.</p></div><div><b>03</b><Check /><h3>Actually fix it.</h3><p>Copy a battle-tested prompt into your coding agent. Redemption is optional.</p></div></div></section>
      <section className="preview-band"><div className="container preview-grid"><div><SectionLabel>EXAMPLE ROAST</SectionLabel><h2>“Bro, landing page lu punya 7 animasi, tapi tombol <span>Sign Up</span> malah nyasar ke 404.”</h2><p className="muted">A roast should sting a little. It should also tell you exactly what to do next.</p><button className="text-btn" onClick={() => setView('results')}>See the full roast <ArrowRight /></button></div><div className="terminal-preview"><div className="terminal-bar"><CircleDot /><span>viberoast / audit.log</span><span>•••</span></div><div className="terminal-lines"><p><i>01</i> scanning viewport... <strong>done</strong></p><p><i>02</i> checking button hierarchy... <strong>done</strong></p><p><i>03</i> measuring vibe... <mark>questionable</mark></p><p><i>04</i> locating personality... <mark>not found</mark></p><p className="terminal-result">Verdict: <b>needs character development.</b></p></div></div></div></section>
      <section className="section container split-section"><div><SectionLabel>MEET BRO CODE</SectionLabel><h2>The senior dev<br />you <span>didn’t hire.</span></h2><p className="muted wide">He has reviewed 4,872 landing pages and only smiled twice. Bro Code doesn’t care about your pitch deck. He cares about your line-height.</p><button className="outline-btn">Read his manifesto <ArrowRight /></button></div><div className="quote-card"><Mascot small /><p>“Good design is when I don’t have to explain the button to you.”</p><small>— Bro Code, probably</small></div></section>
      <section className="redemption container"><div className="redemption-copy"><SectionLabel>REDEMPTION ARC</SectionLabel><h2>Roasted.<br /><span>Fixed.</span><br />Redeemed.</h2><p>Copy the fix prompt. Ship the changes. Come back and make Bro Code proud.</p><button className="dark-btn" onClick={() => setView('fixes')}>Enter fix mode <ArrowRight /></button></div><div className="before-after"><div className="mock-screen before"><div className="mock-top" /><div className="mock-body"><span>HELLO WORLD</span><b>We make software.</b><i>Sign up</i></div><label>BEFORE <strong>38</strong></label></div><ArrowRight /><div className="mock-screen after"><div className="mock-top" /><div className="mock-body"><span>hello, human</span><b>Tools that feel<br />like magic.</b><i>Get started →</i></div><label>AFTER <strong>86</strong></label></div></div></section>
      <section className="hall-preview container" id="hall"><div className="hall-heading"><div><SectionLabel>COMMUNITY</SectionLabel><h2>Hall of <span>Shame.</span></h2></div><button className="outline-btn" onClick={() => setView('hall')}>View leaderboard <ArrowRight /></button></div><div className="leader-list">{leaderboard.map(item => <div className="leader-row" key={item.name}><span className="rank">{item.emoji}</span><div className={`thumb ${item.color}`} /> <div className="leader-main"><b>{item.name}</b><span>{item.verdict}</span></div><strong className="score">{item.score}<small>/100</small></strong><ArrowRight /></div>)}</div></section>
      <section className="final-cta container"><Mascot small /><div><SectionLabel>YOUR TURN</SectionLabel><h2>Let him cook.</h2><p>It’s free. It’s fast. It’s a little mean.</p></div><button className="roast-btn" onClick={() => document.getElementById('roast')?.scrollIntoView({ behavior: 'smooth' })}>Roast My App <ArrowRight /></button></section>
    </>}

    {view === 'results' && <Results expanded={expanded} setExpanded={setExpanded} setView={setView} />}
    {view === 'fixes' && <Fixes copied={copied} copyPrompt={copyPrompt} setView={setView} />}
    {view === 'hall' && <Hall setView={setView} />}

    <footer className="footer container"><Logo /><span>Built with questionable taste &amp; good intentions.</span><span>© 2025 VibeRoast</span></footer>
  </main>
}

function Results({ expanded, setExpanded, setView }: { expanded: number | null; setExpanded: (n: number | null) => void; setView: (v: 'home' | 'results' | 'fixes' | 'hall') => void }) {
  return <div className="results-page container"><button className="back-link" onClick={() => setView('home')}>← Back to the landing page</button><div className="results-header"><div><SectionLabel>ROAST COMPLETE · JUST NOW</SectionLabel><h1>Here’s what Bro Code <em>really</em> thinks.</h1><p className="muted">Audit for <b>questionable-saas.vercel.app</b> · No Mercy mode</p></div><Mascot small /></div><div className="results-grid"><div className="site-shot"><div className="browser-bar"><span /><span /><span /> questionable-saas.vercel.app</div><div className="fake-site"><small>YOUR BRAND</small><h2>Ship faster.<br />Look better.</h2><p>We help teams build things for the internet.</p><button>Get started</button><div className="fake-circles" /></div><div className="shot-toggle"><button className="active">Desktop</button><button>Mobile</button></div></div><div className="verdict-card"><div className="verdict-top"><span>BRO CODE’S VERDICT</span><span className="red-dot" /></div><blockquote>“Bro, landing page lu punya 7 animasi, tapi tombol Sign Up malah nyasar ke 404.”</blockquote><div className="nickname"><Mascot small /><span><small>DEVELOPER NICKNAME</small><b>Senior Prompt Engineer,<br />Junior Error Handler</b></span></div></div></div><div className="findings-head"><div><SectionLabel>THE RECEIPTS</SectionLabel><h2>Roast findings <span>({findings.length})</span></h2></div><button className="dark-btn" onClick={() => setView('fixes')}>Fix my shame <ArrowRight /></button></div><div className="finding-list">{findings.map((item, i) => <div className={`finding ${expanded === i ? 'open' : ''}`} key={item.title}><button onClick={() => setExpanded(expanded === i ? null : i)}><span className="finding-num">0{i + 1}</span><span className="finding-title">{item.title}</span><span className={`severity ${item.severity.toLowerCase()}`}>{item.severity}</span><ChevronDown /></button>{expanded === i && <div className="finding-detail"><div><small>OBSERVED ISSUE</small><p>{item.issue}</p></div><div><small>EVIDENCE</small><p>{item.evidence}</p></div><div className="fix"><small>RECOMMENDED FIX</small><p>{item.fix}</p></div></div>}</div>)}</div><div className="meter-card"><div><SectionLabel>VIBE METER</SectionLabel><h2>Somehow, still shipshape.</h2><p className="muted">Scores are based on observable UI evidence, not vibes we made up.</p></div><div className="meter-score"><strong>64</strong><span>/100</span><div className="meter-line"><i /></div></div></div></div>
}

function Fixes({ copied, copyPrompt, setView }: { copied: boolean; copyPrompt: () => void; setView: (v: 'home' | 'results' | 'fixes' | 'hall') => void }) {
  return <div className="fix-page container"><button className="back-link" onClick={() => setView('results')}>← Back to your roast</button><SectionLabel>FIX MY SHAME</SectionLabel><h1>Turn the roast into a <em>roadmap.</em></h1><p className="muted intro">No hand-wavy advice. Just practical fixes your coding agent can actually ship.</p><div className="fix-tabs"><button className="active">Quick Fix <span>3</span></button><button>Full Rehab</button><button>Agent Prompt</button></div><div className="fix-layout"><div className="fix-cards">{findings.map((f, i) => <div className="fix-card" key={f.title}><div className="fix-check"><Check /></div><div><span>PRIORITY 0{i + 1}</span><h3>{f.title}</h3><p>{f.fix}</p><small>Expected outcome · clearer hierarchy, fewer confused clicks</small></div></div>)}</div><div className="prompt-card"><div className="prompt-head"><Terminal /><span>agent-prompt.md</span><button onClick={copyPrompt}>{copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy prompt'}</button></div><pre>{`# VibeRoast Fix Prompt\n\n## Project context\nquestionable-saas.vercel.app\n\n## Verified problems\n- Primary CTA lacks hierarchy\n- Excessive competing motion\n- Hero layout breaks on mobile\n\n## Implementation tasks\n1. Clarify CTA contrast and spacing.\n2. Reduce animation to one purposeful cue.\n3. Stack hero at 900px breakpoint.\n\n## Acceptance criteria\n- CTA is the clearest action above fold\n- No horizontal overflow at 360px\n- Preserve existing brand voice\n\n## Testing\nCheck keyboard focus, mobile viewport, and\nreduced-motion preferences.`}</pre></div></div></div>
}

function Hall({ setView }: { setView: (v: 'home' | 'results' | 'fixes' | 'hall') => void }) {
  return <div className="hall-page container"><button className="back-link" onClick={() => setView('home')}>← Back home</button><div className="hall-title"><div><SectionLabel>PUBLICLY SUBMITTED</SectionLabel><h1>Hall of <em>Shame.</em></h1><p className="muted">The internet’s most questionable decisions, lovingly documented.</p></div><Mascot small /></div><div className="hall-tabs"><button className="active">Hall of Shame</button><button>Hall of Vibes</button><div className="search-box"><Search /><input placeholder="Search projects" /></div></div><div className="big-leader">{leaderboard.map((item, i) => <article key={item.name}><div className={`hall-thumb ${item.color}`}><span>{item.emoji}</span><div /></div><div className="hall-info"><span>#{i + 1} · ROASTED 42 TIMES</span><h2>{item.name}</h2><p>“{item.verdict}”</p><button onClick={() => setView('results')}>View roast <ArrowRight /></button></div><strong className="big-score">{item.score}<small> vibe</small></strong></article>)}</div><div className="publish-note"><Share2 /><span><b>Got roasted?</b> Publish your result to join the shame.</span><button className="outline-btn">Learn more</button></div></div>
}
