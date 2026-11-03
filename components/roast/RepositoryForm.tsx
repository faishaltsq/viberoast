'use client'

import { useState } from 'react'
import { ArrowRight, GitBranch, RotateCcw, Terminal } from 'lucide-react'
import type { Language } from '@/lib/types/report'
import { parseGitHubUrl } from '@/lib/github/parse-url'

interface RepositoryFormProps {
  language: Language
  isAnalyzing: boolean
  error: string
  setError: (err: string) => void
  onRoast: (repoUrl: string) => Promise<void>
  onFocusChange?: (focused: boolean) => void
}

export function RepositoryForm({
  language,
  isAnalyzing,
  error,
  setError,
  onRoast,
  onFocusChange,
}: RepositoryFormProps) {
  const [repoInput, setRepoInput] = useState('')
  const id = language === 'id'
  const t = (en: string, indo: string) => (id ? indo : en)

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (isAnalyzing) return

    const trimmed = repoInput.trim()
    if (!trimmed) {
      setError(
        t(
          'Enter a GitHub repository URL first (e.g. github.com/owner/repo).',
          'Masukkan URL repositori GitHub dulu (misal github.com/owner/repo).'
        )
      )
      return
    }

    const parsed = parseGitHubUrl(trimmed)
    if (!parsed) {
      setError(
        t(
          'Enter a valid public GitHub repository URL (e.g. github.com/owner/repo or owner/repo).',
          'Masukkan URL repositori GitHub publik yang valid (misal github.com/owner/repo atau owner/repo).'
        )
      )
      return
    }

    setError('')
    void onRoast(trimmed)
  }

  return (
    <form
      className="input-card"
      aria-busy={isAnalyzing}
      data-invalid={Boolean(error)}
      onSubmit={handleSubmit}
      data-testid="repository-form"
    >
      <div className="input-top">
        <span className="mono">$ judge --repo</span>
        <span className="input-hint">
          {isAnalyzing
            ? t('fetching tree & inspecting source…', 'mengambil file & memeriksa kode…')
            : t('public GitHub repository', 'repositori GitHub publik')}
        </span>
      </div>
      <div className="input-row">
        <GitBranch aria-hidden="true" />
        <input
          value={repoInput}
          onChange={(e) => {
            setRepoInput(e.target.value)
            setError('')
          }}
          onFocus={() => onFocusChange?.(true)}
          onBlur={() => onFocusChange?.(false)}
          placeholder="github.com/owner/repository"
          aria-label={t('GitHub repository URL', 'URL repositori GitHub')}
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'repo-privacy repo-error' : 'repo-privacy'}
          disabled={isAnalyzing}
          data-testid="repo-url-input"
        />
        <button type="submit" className="roast-btn" disabled={isAnalyzing} data-testid="repo-submit-btn">
          {isAnalyzing ? (
            <>
              {t('Judging Repo…', 'Menilai Repo…')}
              <RotateCcw className="rotate" />
            </>
          ) : (
            <>
              {t('Judge My Repo', 'Nilai Repoku')}
              <ArrowRight />
            </>
          )}
        </button>
      </div>
    </form>
  )
}
