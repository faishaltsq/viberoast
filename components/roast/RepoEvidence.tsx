'use client'

import { useState } from 'react'
import { ChevronDown, FileCode, HardDrive, AlertTriangle } from 'lucide-react'
import type { Language, RepoScanResult } from '@/lib/types/report'

interface RepoEvidenceProps {
  scan: RepoScanResult
  language: Language
}

export function RepoEvidence({ scan, language }: RepoEvidenceProps) {
  const [open, setOpen] = useState(false)
  const id = language === 'id'
  const t = (en: string, indo: string) => (id ? indo : en)

  const { coverage, selectedFiles, owner, repo, sha } = scan
  const inspectedKb = (coverage.bytesInspected / 1024).toFixed(1)

  return (
    <div className="repo-evidence-panel" data-testid="repo-evidence-panel">
      <div className="terminal-preview" style={{ background: '#20201e', color: '#f5f1e8', padding: '16px 20px', borderRadius: '4px', border: '2px solid var(--ink)', boxShadow: '4px 4px 0 var(--ink)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #444', paddingBottom: '10px', marginBottom: '12px' }}>
          <span className="mono" style={{ color: '#4ade80', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <HardDrive size={14} /> $ git inspect --tree --budget=256k
          </span>
          <span className="mono" style={{ fontSize: '11px', color: '#aaa' }}>
            {coverage.filesInspected}/{coverage.filesDiscovered} {t('files', 'berkas')} ({inspectedKb} KiB)
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', fontSize: '12px', marginBottom: '12px' }}>
          <div>
            <span style={{ color: '#888' }}>{t('Target SHA', 'SHA Target')}:</span>{' '}
            <code style={{ color: '#f59e0b', background: '#333', padding: '2px 5px', borderRadius: '3px' }}>{sha.slice(0, 7)}</code>
          </div>
          <div>
            <span style={{ color: '#888' }}>{t('Default Branch', 'Branch Utama')}:</span> <span>{scan.defaultBranch}</span>
          </div>
          <div>
            <span style={{ color: '#888' }}>{t('Primary Language', 'Bahasa Utama')}:</span> <span>{scan.language ?? t('Unknown', 'Tidak diketahui')}</span>
          </div>
          <div>
            <span style={{ color: '#888' }}>{t('Tree Budget', 'Batas Pohon')}:</span>{' '}
            <span>{coverage.treeTruncated ? t('2,000 max (truncated)', 'Maks 2.000 (terpotong)') : t('Full tree scanned', 'Pohon file penuh')}</span>
          </div>
        </div>

        {(coverage.treeTruncated || coverage.contentTruncated) && (
          <div style={{ background: '#3a2e12', border: '1px solid #facc15', color: '#fef08a', padding: '8px 12px', borderRadius: '4px', marginBottom: '12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={15} color="#facc15" />
            <span>
              {coverage.treeTruncated && t('Repository exceeds 2,000 files; analysis scoped to highest-relevance files. ', 'Repositori lebih dari 2.000 berkas; analisis dibatasi ke berkas prioritas. ')}
              {coverage.contentTruncated && t('Total inspected bytes reached 256 KiB budget limit.', 'Total kode yang diperiksa mencapai batas anggaran 256 KiB.')}
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="outline-btn"
          style={{ width: '100%', justifyContent: 'space-between', background: 'none', color: '#f5f1e8', border: '1px solid #555', padding: '8px 12px', fontSize: '12px' }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileCode size={14} />
            {open ? t('Hide inspected files list', 'Sembunyikan daftar berkas yang diperiksa') : t(`View ${selectedFiles.length} inspected source files`, `Lihat ${selectedFiles.length} berkas sumber yang diperiksa`)}
          </span>
          <ChevronDown style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} size={14} />
        </button>

        {open && (
          <div style={{ marginTop: '12px', maxHeight: '240px', overflowY: 'auto', background: '#181816', padding: '10px 14px', borderRadius: '4px', border: '1px solid #333', fontSize: '11px', fontFamily: 'monospace' }}>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {selectedFiles.map((file, i) => {
                const permaLink = `https://github.com/${owner}/${repo}/blob/${sha}/${file.path}`
                return (
                  <li key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #282826' }}>
                    <a
                      href={permaLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#60a5fa', textDecoration: 'none' }}
                      title={t('Open file on GitHub at inspected commit', 'Buka berkas di GitHub pada commit yang diperiksa')}
                    >
                      {file.path}
                    </a>
                    <span style={{ color: '#888' }}>
                      {(file.size / 1024).toFixed(1)} KiB {file.truncated ? t('(truncated)', '(terpotong)') : ''}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
