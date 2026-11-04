'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import type { HallCase, HallLanguage } from '@/lib/hall/types'
import { Mascot } from '@/components/bro-code/mascot'
import { SectionLabel } from '@/components/shared/primitives'
import { HallCaseFileModal } from './HallCaseFileModal'
import styles from './hall.module.css'

export function Hall({
  cases,
  language,
  initialCollection = 'shame',
  initialCase,
  onLanguageChange,
}: {
  cases: HallCase[]
  language: HallLanguage
  initialCollection?: 'shame' | 'vibes'
  initialCase?: string
  onLanguageChange?: (lang: HallLanguage) => void
}) {
  const isId = language === 'id'

  const [collection, setCollection] = useState<'shame' | 'vibes'>(initialCollection)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<'heat-desc' | 'heat-asc' | 'title-asc'>('heat-desc')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [targetKindFilter, setTargetKindFilter] = useState<'all' | 'website' | 'repository'>('all')

  const [activeCase, setActiveCase] = useState<HallCase | null>(() => {
    if (!initialCase) return null
    return (
      cases.find(c => c.slug === initialCase || c.id === initialCase) ?? null
    )
  })

  // Stable category list: store key as category.en to preserve selection across EN/ID language switches
  const availableCategories = useMemo(() => {
    const map = new Map<string, { en: string; localized: string }>()
    for (const c of cases) {
      if (c.category?.en) {
        map.set(c.category.en, {
          en: c.category.en,
          localized: c.category[language] || c.category.en,
        })
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.localized.localeCompare(b.localized)
    )
  }, [cases, language])

  // Filtered and sorted case list
  const filteredCases = useMemo(() => {
    const query = search.trim().toLowerCase()

    return cases
      .filter(item => {
        // Tab / collection filter
        if (item.collection !== collection) return false

        // Target kind filter
        if (targetKindFilter !== 'all' && item.targetKind !== targetKindFilter) {
          return false
        }

        // Category filter using stable category.en key
        if (categoryFilter !== 'all' && item.category.en !== categoryFilter) {
          return false
        }

        // Search query: match across all authored locales so modal language toggles preserve matching cards
        if (query) {
          const haystack = [
            item.title.en,
            item.title.id,
            item.publicAlias.en,
            item.publicAlias.id,
            item.category.en,
            item.category.id,
            item.verdictHeadline.en,
            item.verdictHeadline.id,
            item.verdictSummary.en,
            item.verdictSummary.id,
            item.broCodeReaction.en,
            item.broCodeReaction.id,
            ...item.findings.flatMap(f => [
              f.title.en,
              f.title.id,
              f.explanation.en,
              f.explanation.id,
              f.roast.en,
              f.roast.id,
            ]),
          ]
            .join(' ')
            .toLowerCase()

          if (!haystack.includes(query)) return false
        }

        return true
      })
      .sort((a, b) => {
        if (sort === 'heat-desc') return b.comedyHeat - a.comedyHeat
        if (sort === 'heat-asc') return a.comedyHeat - b.comedyHeat
        return a.title[language].localeCompare(b.title[language])
      })
  }, [cases, collection, targetKindFilter, categoryFilter, search, language, sort])

  const shameCount = cases.filter(c => c.collection === 'shame').length
  const vibesCount = cases.filter(c => c.collection === 'vibes').length

  const resetFilters = () => {
    setSearch('')
    setSort('heat-desc')
    setCategoryFilter('all')
    setTargetKindFilter('all')
  }

  const getLocalizedTarget = (targetKind: 'website' | 'repository') => {
    return targetKind === 'website'
      ? isId
        ? 'Situs web'
        : 'Website'
      : isId
        ? 'Repositori'
        : 'Repository'
  }

  return (
    <div className={`container ${styles.hallContainer}`}>
      <Link href={`/?lang=${language}`} className={styles.backLink}>
        {isId ? '← Kembali ke Beranda' : '← Back to Home'}
      </Link>

      <div className={styles.hallHeader}>
        <div className={styles.headerText}>
          <SectionLabel>
            {isId ? 'BELAJAR DARI CONTOH FIKTIF' : 'LESSONS FROM FICTIONAL CASES'}
          </SectionLabel>
          <h1>
            Hall of <em>{collection === 'shame' ? 'Shame.' : 'Vibes.'}</em>
          </h1>
          <p>
            {isId
              ? 'Bedah kesalahan coding dan praktik yang patut ditiru lewat kasus fiktif. Tidak ada kiriman pengguna atau hasil pemindaian privat di sini.'
              : 'Fictional case studies dissecting architectural mistakes and engineering wins. No real submissions or private scans.'}
          </p>
        </div>
        <Mascot
          small
          language={language}
          state={collection === 'shame' ? 'disappointed' : 'impressed'}
        />
      </div>

      {/* Shame / Vibes collection buttons using role="group" and aria-pressed */}
      <div
        className={styles.hallTabs}
        role="group"
        aria-label={isId ? 'Koleksi berkas kasus' : 'Case file collections'}
      >
        <button
          type="button"
          aria-pressed={collection === 'shame'}
          aria-controls="hall-case-grid"
          className={`${styles.tabBtn} ${collection === 'shame' ? styles.tabBtnActive : ''}`}
          onClick={() => setCollection('shame')}
        >
          <span>Hall of Shame</span>
          <span className={styles.tabCount}>{shameCount}</span>
        </button>
        <button
          type="button"
          aria-pressed={collection === 'vibes'}
          aria-controls="hall-case-grid"
          className={`${styles.tabBtn} ${collection === 'vibes' ? styles.tabBtnActive : ''}`}
          onClick={() => setCollection('vibes')}
        >
          <span>Hall of Vibes</span>
          <span className={styles.tabCount}>{vibesCount}</span>
        </button>
      </div>

      {/* Controls: Search, Filters, Sort */}
      <div className={styles.toolsContainer}>
        <div className={styles.toolsRow}>
          <div className={styles.searchBox}>
            <Search aria-hidden="true" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={isId ? 'Cari kasus atau temuan...' : 'Search cases or findings...'}
              aria-label={isId ? 'Cari berkas kasus' : 'Search case files'}
              className={styles.searchInput}
            />
          </div>

          <div className={styles.filterGroup}>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              aria-label={isId ? 'Filter berdasarkan kategori' : 'Filter by category'}
              className={styles.filterSelect}
            >
              <option value="all">{isId ? 'Semua Kategori' : 'All Categories'}</option>
              {availableCategories.map(cat => (
                <option key={cat.en} value={cat.en}>
                  {cat.localized}
                </option>
              ))}
            </select>

            <select
              value={targetKindFilter}
              onChange={e =>
                setTargetKindFilter(e.target.value as 'all' | 'website' | 'repository')
              }
              aria-label={isId ? 'Filter berdasarkan jenis target' : 'Filter by target kind'}
              className={styles.filterSelect}
            >
              <option value="all">{isId ? 'Semua Target' : 'All Targets'}</option>
              <option value="website">{isId ? 'Situs web' : 'Website'}</option>
              <option value="repository">{isId ? 'Repositori' : 'Repository'}</option>
            </select>

            <select
              value={sort}
              onChange={e =>
                setSort(e.target.value as 'heat-desc' | 'heat-asc' | 'title-asc')
              }
              aria-label={isId ? 'Urutkan berkas kasus' : 'Sort case files'}
              className={styles.filterSelect}
            >
              <option value="heat-desc">
                {isId ? 'Panas Komedi: Tertinggi' : 'Roast Heat: Highest'}
              </option>
              <option value="heat-asc">
                {isId ? 'Panas Komedi: Terendah' : 'Roast Heat: Lowest'}
              </option>
              <option value="title-asc">
                {isId ? 'Judul Kasus (A–Z)' : 'Case Title (A–Z)'}
              </option>
            </select>
          </div>
        </div>

        <div className={styles.statusRow}>
          <p className={styles.statusText} role="status">
            {isId
              ? `${filteredCases.length} kasus ditampilkan`
              : `${filteredCases.length} case${filteredCases.length === 1 ? '' : 's'} displayed`}
            {search.trim() && <> · “{search.trim()}”</>}
          </p>
          {(search.trim() || categoryFilter !== 'all' || targetKindFilter !== 'all') && (
            <button
              type="button"
              onClick={resetFilters}
              className={styles.clearBtn}
            >
              {isId ? 'Atur Ulang Filter' : 'Reset Filters'}
            </button>
          )}
        </div>
      </div>

      {/* Case Grid */}
      {filteredCases.length > 0 ? (
        <div className={styles.caseGrid} id="hall-case-grid">
          {filteredCases.map((item, index) => (
            <article key={item.id} className={styles.caseCard}>
              <button
                type="button"
                className={styles.cardTrigger}
                onClick={() => setActiveCase(item)}
                aria-haspopup="dialog"
              >
                <div className={styles.cardTopRow}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className={styles.targetKindBadge}>
                      {getLocalizedTarget(item.targetKind)} · #{String(index + 1).padStart(2, '0')}
                    </span>
                    <span className={styles.cardCategoryBadge}>
                      {item.category[language]}
                    </span>
                  </div>
                  <span className={styles.fictionalBadge}>
                    {isId ? 'CONTOH FIKTIF' : 'FICTIONAL EXAMPLE'}
                  </span>
                </div>

                <h2 className={styles.cardTitle}>{item.title[language]}</h2>
                <span className={styles.cardAlias}>{item.publicAlias[language]}</span>

                <blockquote className={styles.cardHeadline}>
                  “{item.verdictHeadline[language]}”
                </blockquote>

                <p className={styles.cardSummary}>{item.verdictSummary[language]}</p>

                <div className={styles.cardBottomRow}>
                  <div
                    className={styles.heatBadge}
                    data-collection={item.collection}
                  >
                    {item.comedyHeat}
                    <small>{isId ? 'panas' : 'heat'}</small>
                  </div>
                  <span className={styles.cardAction}>
                    {isId ? 'Buka Berkas Kasus →' : 'Inspect Case File →'}
                  </span>
                </div>
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.emptyNotice} role="region" aria-label={isId ? 'Tidak ada hasil' : 'No results'}>
          <h2>{isId ? 'Tidak ada kasus yang cocok.' : 'No case files match.'}</h2>
          <p>
            {isId
              ? 'Coba atur ulang kata kunci pencarian atau sesuaikan filter kategori dan jenis target.'
              : 'Try clearing your search query or adjusting the category and target filters.'}
          </p>
          <button
            type="button"
            className={styles.clearBtn}
            onClick={resetFilters}
          >
            {isId ? 'Atur Ulang Filter' : 'Reset Filters'}
          </button>
        </div>
      )}

      {/* Disclaimers & Privacy Note */}
      <div className={styles.disclaimerBand}>
        <div className={styles.disclaimerCard}>
          <strong>{isId ? 'Disklaimer Hiburan & Edukasi' : 'Entertainment & Educational Disclaimer'}</strong>
          <p>
            {isId
              ? 'Panas komedi adalah indeks hiburan edukatif, bukan sertifikasi keamanan atau evaluasi teknis formal. Semua spesimen adalah fiktif dan dibuat untuk keperluan pembelajaran.'
              : 'Comedy heat is an illustrative educational index, not an audit certification or formal security assessment. All specimens are entirely fictional and authored for learning.'}
          </p>
        </div>
        <div className={styles.disclaimerCard}>
            <strong>{isId ? 'Pemindaian Bukan Publikasi' : 'Scanning Is Not Publishing'}</strong>
          <p>
            {isId
              ? 'Hasil pemindaian Website Judge dan Repository Judge tetap privat dan tidak pernah dipublikasikan menjadi catatan Hall. Pemindai tetap dapat digunakan tanpa autentikasi.'
              : 'Website Judge and Repository Judge scans remain private and are never published as Hall records. Scanners remain freely available without authentication.'}
          </p>
        </div>
      </div>

      {/* Case File Modal */}
      {activeCase && (
        <HallCaseFileModal
          caseItem={activeCase}
          language={language}
          onClose={() => setActiveCase(null)}
          onLanguageChange={onLanguageChange}
        />
      )}
    </div>
  )
}
