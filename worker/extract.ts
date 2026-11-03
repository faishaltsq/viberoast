import type { Page } from 'playwright'
import type { Finding } from '../lib/types/report'
import { redactSecrets, redactUrl, SENSITIVE_TEXT_PATTERN } from '../lib/security/redact'

export interface PageEvidence {
  title: string
  description: string
  language: string
  viewportMeta: string
  viewport: { width: number; height: number; documentWidth: number }
  headings: { level: number; text: string }[]
  links: { text: string; href: string }[]
  buttons: { text: string; label: string }[]
  forms: { method: string; fields: number }[]
  images: { alt: string | null; loaded: boolean }[]
  inputs: { type: string; labeled: boolean }[]
  styles: { fontSize: string; color: string; background: string }[]
  text: string
  truncated: boolean
  sensitive?: boolean
}

// Kept self-contained: Playwright serializes this function into the untrusted page.
export function extractDocument(sensitivePattern: string): PageEvidence {
  const headings: PageEvidence['headings'] = [], links: PageEvidence['links'] = [], buttons: PageEvidence['buttons'] = []
  const forms: PageEvidence['forms'] = [], images: PageEvidence['images'] = [], inputs: PageEvidence['inputs'] = [], styles: PageEvidence['styles'] = []
  const walker = document.createTreeWalker(document.body ?? document.documentElement, NodeFilter.SHOW_ELEMENT)
  let node = walker.currentNode as Element | null, count = 0
  let text = ''
  while (node && count < 5_000) {
    count++
    const tag = node.tagName.toLowerCase()
    const label = (node.getAttribute('aria-label') ?? '').slice(0, 200)
    if (/^h[1-6]$/.test(tag) && headings.length < 50) headings.push({ level: Number(tag[1]), text: (node.textContent ?? '').slice(0, 200) })
    if (tag === 'a' && links.length < 100) links.push({ text: (node.textContent ?? '').slice(0, 160), href: (node as HTMLAnchorElement).href.slice(0, 2048) })
    if ((tag === 'button' || node.getAttribute('role') === 'button') && buttons.length < 100) buttons.push({ text: (node.textContent ?? '').slice(0, 160), label })
    if (tag === 'form' && forms.length < 30) forms.push({ method: (node as HTMLFormElement).method, fields: Math.min((node as HTMLFormElement).elements.length, 1000) })
    if (tag === 'img' && images.length < 200) images.push({ alt: node.getAttribute('alt')?.slice(0, 160) ?? null, loaded: (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0 })
    if (['input', 'textarea', 'select'].includes(tag) && inputs.length < 100) {
      const input = node as HTMLInputElement
      if (!['hidden', 'submit', 'button', 'reset', 'image'].includes(input.type)) inputs.push({ type: input.type || tag, labeled: Boolean(label.trim() || node.getAttribute('title')?.trim() || Array.from(input.labels ?? []).some((item) => item.textContent?.trim()) || (node.getAttribute('aria-labelledby') ?? '').split(/\s+/).some((id) => document.getElementById(id)?.textContent?.trim())) })
    }
    if (['p', 'h1', 'h2', 'h3', 'a', 'button', 'label'].includes(tag)) {
      if (text.length < 6_000) text += ` ${(node.textContent ?? '').slice(0, 300)}`
      if (styles.length < 30) { const style = getComputedStyle(node); styles.push({ fontSize: style.fontSize, color: style.color, background: style.backgroundColor }) }
    }
    node = walker.nextNode() as Element | null
  }
  return {
    title: document.title.slice(0, 300), description: (document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '').slice(0, 1000),
    language: document.documentElement.lang.slice(0, 30), viewportMeta: (document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '').slice(0, 300),
    viewport: { width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth },
    headings, links, buttons, forms, images, inputs, styles, text: text.slice(0, 6_000), truncated: Boolean(node),
    sensitive: new RegExp(sensitivePattern, 'i').test(`${document.title} ${document.querySelector('meta[name="description"]')?.getAttribute('content') ?? ''} ${text}`),
  }
}

export async function extractPage(page: Page): Promise<PageEvidence> {
  const evidence = await page.evaluate(extractDocument, SENSITIVE_TEXT_PATTERN.source)
  evidence.title = redactSecrets(evidence.title)
  evidence.description = redactSecrets(evidence.description)
  evidence.language = redactSecrets(evidence.language)
  evidence.viewportMeta = redactSecrets(evidence.viewportMeta)
  evidence.text = redactSecrets(evidence.text)
  evidence.headings = evidence.headings.map((item) => ({ ...item, text: redactSecrets(item.text) }))
  evidence.links = evidence.links.map((item) => ({ text: redactSecrets(item.text), href: redactUrl(item.href) }))
  evidence.buttons = evidence.buttons.map((item) => ({ text: redactSecrets(item.text), label: redactSecrets(item.label) }))
  evidence.images = evidence.images.map((item) => ({ ...item, alt: item.alt === null ? null : redactSecrets(item.alt) }))
  return evidence
}

export function isChallengePage(evidence: PageEvidence): boolean {
  return /\b(?:just a moment|checking your browser|verify (?:that )?you are (?:a )?human|attention required|security verification|access denied)\b/i.test(evidence.title)
    || /\b(?:checking your browser before|verify (?:that )?you are (?:a )?human|enable javascript and cookies to continue|performing security verification)\b/i.test(evidence.text.slice(0, 1500))
}

export function buildFindings(desktop: PageEvidence | null, mobile: PageEvidence | null): Finding[] {
  const findings: Finding[] = []
  const add = (id: string, category: Finding['category'], title: string, evidence: string, recommendation: string, severity: Finding['severity'] = 'medium', source: Finding['source'] = 'dom') => {
    findings.push({ id, category, title, description: evidence, severity, confidence: 'high', evidence: [evidence], location: id.startsWith('mobile') ? 'Mobile viewport (390 × 844)' : 'Rendered page DOM', recommendation, source, verification: 'verified' })
  }
  if (desktop) {
    if (!desktop.title.trim()) add('meta-title-missing', 'SEO', 'Page title is missing', 'The rendered document title is empty.', 'Add a unique, descriptive page title.', 'medium', 'metadata')
    if (!desktop.description.trim()) add('meta-description-missing', 'SEO', 'Meta description is missing', 'No non-empty description meta tag was found.', 'Write a concise description of this page.', 'low', 'metadata')
    if (!desktop.language.trim()) add('document-language-missing', 'Accessibility', 'Document language is missing', 'The root html element has no language value.', 'Set an appropriate lang attribute on the html element.')
    if (!desktop.headings.some(({ level }) => level === 1)) add('heading-primary-missing', 'SEO', 'No primary heading was found in the sampled DOM', 'No h1 appeared among the inspected elements (up to 5,000).', 'Give the page a descriptive primary heading.', 'low')
    const missingAlt = desktop.images.filter(({ alt }) => alt === null).length
    if (missingAlt) add('images-alt-missing', 'Accessibility', 'Images have no alt attribute', `${missingAlt} of ${desktop.images.length} sampled image elements lack an alt attribute. Empty alt attributes are treated as intentional decoration.`, 'Supply meaningful alt text for informative images and an empty alt attribute for decorative images.')
    const unlabeled = desktop.inputs.filter(({ labeled }) => !labeled).length
    if (unlabeled) add('form-labels-missing', 'Accessibility', 'Form fields lack explicit accessible labels', `${unlabeled} of ${desktop.inputs.length} sampled form controls have no associated label, aria label, referenced label, or title. Placeholder text is not counted as a label.`, 'Associate each field with a visible label and verify its accessible name.')
    const emptyButtons = desktop.buttons.filter(({ text, label }) => !text.trim() && !label.trim()).length
    if (emptyButtons) findings.push({ id: 'buttons-name-review', category: 'Accessibility', title: 'Some buttons need an accessible-name review', description: `${emptyButtons} sampled buttons have neither text nor aria-label; an icon alternative or aria-labelledby may still supply a name.`, severity: 'medium', confidence: 'medium', evidence: [`${emptyButtons} of ${desktop.buttons.length} sampled buttons have empty text and aria-label.`], location: 'Rendered page buttons', recommendation: 'Inspect the accessibility tree and provide an accessible name where absent.', source: 'dom', verification: 'heuristic' })
  }
  if (mobile) {
    if (!mobile.viewportMeta.trim()) add('mobile-viewport-missing', 'UX', 'Mobile viewport metadata is missing', 'No non-empty viewport meta tag was found.', 'Set width=device-width and an appropriate initial scale.', 'medium', 'metadata')
    if (mobile.viewport.documentWidth > mobile.viewport.width + 2) add('mobile-horizontal-overflow', 'UI', 'The mobile page overflows horizontally', `Document width ${mobile.viewport.documentWidth}px exceeds the measured viewport width ${mobile.viewport.width}px.`, 'Find the overflowing elements and constrain widths at narrow breakpoints.')
  }
  return findings
}
