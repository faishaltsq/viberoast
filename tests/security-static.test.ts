import { describe, expect, it, vi } from 'vitest'
import { analyzeStaticSecurity, scanStaticSecurity, MAX_AST_DEPTH, MAX_AST_NODES } from '../lib/security/static'
import * as staticModule from '../lib/security/static'
import type { AnalysisContext } from '../lib/analysis/types'
import { toPublicRepositoryReport } from '../lib/security/public-report'
import { makeRepoReport } from './fixtures/report'
import { checkSecurity } from '../lib/analysis/checks/security'
import { deduplicateFindings } from '../lib/analysis/deduplicate'
import { analyzeRepository } from '../lib/analysis/repository'

function createMockContext(overrides: Partial<AnalysisContext> = {}): AnalysisContext {
  return {
    owner: 'acme',
    repo: 'app',
    sha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    tree: [],
    files: [],
    meta: {
      owner: 'acme',
      repo: 'app',
      sha: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
      defaultBranch: 'main',
    },
    ...overrides,
  }
}

describe('Static Security AST Analysis Engine', () => {
  // 1. Initial RED requirement from plan
  it('records attacker-influenced eval as a qualified observation', () => {
    const content = 'export function GET(request) { return eval(request.url) }'
    const findings = analyzeStaticSecurity(createMockContext({
      tree: [{ path: 'app/api/run/route.ts', type: 'file', size: content.length }],
      files: [{ path: 'app/api/run/route.ts', size: content.length, content, truncated: false }],
    }))
    expect(findings.some((f) => f.security?.ruleId === 'js.dynamic-execution')).toBe(true)
    expect(findings.every((f) => f.verification === 'heuristic' || f.security?.observation)).toBe(true)
    expect(JSON.stringify(findings)).not.toMatch(/verified vulnerability|CVE-\d/)
    const f = findings.find((f) => f.security?.ruleId === 'js.dynamic-execution')
    expect(f?.security?.commitSha).toBe('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2')
    expect(f?.security?.lineStart).toBe(1)
    expect(f?.security?.lineEnd).toBe(1)
    expect(f?.security?.ruleVersion).toBe('1.0.0')
  })

  // Defect 1: checks/security.ts metadata possibleImpact qualified
  describe('Defect 1: Qualified possibleImpact in security metadata', () => {
    it('uses qualified language without claiming active credential validity in filename findings', () => {
      const ctx = createMockContext({
        tree: [{ path: '.env', type: 'file', size: 100 }],
        files: [{ path: '.env', size: 100, content: 'SOME_CONFIG=true\n', truncated: false }],
      })
      const findings = checkSecurity(ctx)
      const envFinding = findings.find((f) => f.id === 'sec-committed-env-file')
      expect(envFinding).toBeDefined()
      expect(envFinding?.security?.possibleImpact).not.toMatch(/Critical credential compromise/)
      expect(envFinding?.security?.possibleImpact).toMatch(/unknown|potential/i)
      expect(envFinding?.security?.lineStart).toBeUndefined()
      expect(envFinding?.security?.lineEnd).toBeUndefined()
    })
  })

  // Defect 2: Offset-based ID to avoid same-line collisions
  describe('Defect 2: Stable offset in finding IDs for same-line statements', () => {
    it('emits distinct IDs and preserves both findings for same-line eval calls', () => {
      const content = 'eval(a); eval(b);'
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/dual-eval.ts', size: content.length, content, truncated: false }],
      }))
      const evalFindings = findings.filter((f) => f.security?.ruleId === 'js.dynamic-execution')
      expect(evalFindings.length).toBe(2)
      expect(evalFindings[0].id).not.toBe(evalFindings[1].id)
      expect(evalFindings[0].id.length).toBeLessThanOrEqual(100)
      expect(evalFindings[1].id.length).toBeLessThanOrEqual(100)

      const deduped = deduplicateFindings(findings)
      const dedupedEvals = deduped.filter((f) => f.security?.ruleId === 'js.dynamic-execution')
      expect(dedupedEvals.length).toBe(2)
    })
  })

  // Defect 3: Parse diagnostics and staticCoverage tracking
  describe('Defect 3: Syntax parsing diagnostics and static coverage', () => {
    it('detects syntax errors, marks file partial, and populates staticCoverage', () => {
      const syntaxErrorContent = 'export function broken( { return eval(x)'
      const validContent = 'export const x = 42;'
      const jsonContent = '{"name": "test"}'

      const ctx = createMockContext({
        files: [
          { path: 'src/broken.ts', size: syntaxErrorContent.length, content: syntaxErrorContent, truncated: false },
          { path: 'src/valid.ts', size: validContent.length, content: validContent, truncated: false },
          { path: 'package.json', size: jsonContent.length, content: jsonContent, truncated: false },
        ],
      })

      const scanResult = scanStaticSecurity(ctx)
      expect(scanResult.coverage).toBeDefined()
      expect(scanResult.coverage.filesAttempted).toBe(3)
      expect(scanResult.coverage.filesParsed).toBe(1)
      expect(scanResult.coverage.filesPartial).toBe(1)
      expect(scanResult.coverage.filesUnsupported).toBe(1)

      const brokenStatus = scanResult.coverage.fileStatuses.find((s) => s.path === 'src/broken.ts')
      expect(brokenStatus?.status).toBe('partial')
      expect(brokenStatus?.parseDiagnosticsCount).toBeGreaterThan(0)

      const jsonStatus = scanResult.coverage.fileStatuses.find((s) => s.path === 'package.json')
      expect(jsonStatus?.status).toBe('unsupported')
      expect(jsonStatus?.reason).toBeDefined()

      expect(scanResult.coverage.scopeWarnings?.length).toBeGreaterThan(0)
    })
  })

  // Defect 4: Handler-by-handler auth inspection in sensitive routes
  describe('Defect 4: Handler-by-handler route authorization', () => {
    it('flags unprotected POST handler while passing protected GET handler in same route', () => {
      const mixedRoute = `import { auth } from '@/lib/auth'
export async function GET(request) {
  const session = await auth()
  if (!session) return new Response('Unauthorized', { status: 401 })
  return Response.json({ items: [] })
}

export async function POST(request) {
  const body = await request.json()
  await db.users.delete({ where: { id: body.id } })
  return Response.json({ deleted: true })
}`

      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'app/api/admin/users/route.ts', size: mixedRoute.length, content: mixedRoute, truncated: false }],
      }))

      const routeFindings = findings.filter((f) => f.security?.ruleId === 'route.missing-auth')
      expect(routeFindings.length).toBe(1)
      expect(routeFindings[0].title).toContain('POST')
      expect(routeFindings[0].security?.lineStart).toBe(8)
    })

    it('does not suppress unprotected handler due to unrelated auth string or import', () => {
      const unrelatedRoute = `// helper authentication string
import { verifyAuthHelper } from '@/lib/helpers'
export async function DELETE(request) {
  await db.users.deleteMany()
  return Response.json({ success: true })
}`

      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'app/api/admin/route.ts', size: unrelatedRoute.length, content: unrelatedRoute, truncated: false }],
      }))

      const routeFindings = findings.filter((f) => f.security?.ruleId === 'route.missing-auth')
      expect(routeFindings.length).toBe(1)
      expect(routeFindings[0].title).toContain('DELETE')
    })
  })

  // Defect 5: Receiver & alias resolution for command and SQL sinks
  describe('Defect 5: Receiver and alias resolution for cmd and SQL execution', () => {
    it('never flags RegExp.exec as command execution', () => {
      const content = `export function parse(input) {\n  const re = /pattern/\n  return re.exec(input)\n}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/parser.ts', size: content.length, content, truncated: false }],
      }))
      const cmdFindings = findings.filter((f) => f.security?.ruleId === 'cmd.unsafe-execution')
      expect(cmdFindings).toHaveLength(0)
    })

    it('does not flag constant variable passed to child_process exec', () => {
      const content = `import { exec } from 'child_process'\nexport function run() {\n  const fixed = 'ls -la'\n  exec(fixed)\n}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/exec.ts', size: content.length, content, truncated: false }],
      }))
      const cmdFindings = findings.filter((f) => f.security?.ruleId === 'cmd.unsafe-execution')
      expect(cmdFindings).toHaveLength(0)
    })

    it('flags child_process exec when receiving request-derived input', () => {
      const content = `import { exec } from 'child_process'\nexport async function POST(req) {\n  const { branch } = await req.json()\n  exec('git checkout ' + branch)\n}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/checkout.ts', size: content.length, content, truncated: false }],
      }))
      const cmdFindings = findings.filter((f) => f.security?.ruleId === 'cmd.unsafe-execution')
      expect(cmdFindings.length).toBe(1)
      expect(cmdFindings[0].severity).toBe('high')
    })

    it('does not flag unknown custom.query as confirmed SQL injection', () => {
      const content = `export function getCustom(custom, id) {\n  return custom.query('item ' + id)\n}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/custom.ts', size: content.length, content, truncated: false }],
      }))
      const sqlFindings = findings.filter((f) => f.security?.ruleId === 'sql.injection-sink')
      expect(sqlFindings).toHaveLength(0)
    })

    it('does not flag prisma.$queryRaw tagged template literals', () => {
      const content = `import { prisma } from '@/lib/db'\nexport async function getUser(id) {\n  return await prisma.$queryRaw\`SELECT * FROM users WHERE id = \${id}\`\n}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/prisma.ts', size: content.length, content, truncated: false }],
      }))
      const sqlFindings = findings.filter((f) => f.security?.ruleId === 'sql.injection-sink')
      expect(sqlFindings).toHaveLength(0)
    })

    it('flags dynamic SQL query on confirmed DB receiver or unsafe API', () => {
      const content = `import { prisma } from '@/lib/db'\nexport async function getUser(req) {\n  const { id } = await req.json()\n  return await prisma.$queryRawUnsafe('SELECT * FROM users WHERE id = ' + id)\n}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/prisma.ts', size: content.length, content, truncated: false }],
      }))
      const sqlFindings = findings.filter((f) => f.security?.ruleId === 'sql.injection-sink')
      expect(sqlFindings.length).toBe(1)
      expect(sqlFindings[0].severity).toBe('high')
    })

    it('flags dynamic query on imported database connection', () => {
      const content = `import { Pool } from 'pg'\nconst pool = new Pool()\nexport async function getUser(id) {\n  return await pool.query('SELECT * FROM users WHERE id = ' + id)\n}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/db.ts', size: content.length, content, truncated: false }],
      }))
      const sqlFindings = findings.filter((f) => f.security?.ruleId === 'sql.injection-sink')
      expect(sqlFindings.length).toBe(1)
      expect(sqlFindings[0].severity).toBe('high')
    })
  })

  // Defect 6: Identity destructuring requires authorization decision context
  describe('Defect 6: Identity destructuring requires privilege boundary check', () => {
    it('does not flag neutral input validation or logging of userId', () => {
      const content = `export async function POST(req) {\n  const { userId } = await req.json()\n  validateTarget(userId)\n  return Response.json({ ok: true })\n}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/action.ts', size: content.length, content, truncated: false }],
      }))
      const trustFindings = findings.filter((f) => f.security?.ruleId === 'auth.client-identity-trust')
      expect(trustFindings).toHaveLength(0)
    })

    it('flags client-provided role gating privileged branch', () => {
      const content = `export async function POST(req) {\n  const { role } = await req.json()\n  if (role === 'admin') {\n    performAdminAction()\n  }\n}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/action.ts', size: content.length, content, truncated: false }],
      }))
      const trustFindings = findings.filter((f) => f.security?.ruleId === 'auth.client-identity-trust')
      expect(trustFindings.length).toBe(1)
      expect(trustFindings[0].severity).toBe('high')
    })

    it('flags client-provided isAdmin gating privileged branch', () => {
      const content = `export async function POST(req) {\n  const { isAdmin } = await req.json()\n  if (isAdmin) {\n    performAdminAction()\n  }\n}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/action.ts', size: content.length, content, truncated: false }],
      }))
      const trustFindings = findings.filter((f) => f.security?.ruleId === 'auth.client-identity-trust')
      expect(trustFindings.length).toBe(1)
      expect(trustFindings[0].severity).toBe('high')
    })

    it('does not flag server-derived session role check', () => {
      const content = `import { auth } from '@/lib/auth'\nexport async function POST(req) {\n  const session = await auth()\n  if (session?.user?.role === 'admin') {\n    performAdminAction()\n  }\n}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/action.ts', size: content.length, content, truncated: false }],
      }))
      const trustFindings = findings.filter((f) => f.security?.ruleId === 'auth.client-identity-trust')
      expect(trustFindings).toHaveLength(0)
    })

    it.each([
      'getSession()',
      'getSession(/* req.json */)',
      'getSession("request.body")',
    ])('does not treat server session initializer %s as client payload', (initializer) => {
      const content = `export async function POST(req) {\n  const { role } = ${initializer}\n  if (role === 'admin') performAdminAction()\n}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/action.ts', size: content.length, content, truncated: false }],
      }))
      expect(findings.filter((f) => f.security?.ruleId === 'auth.client-identity-trust')).toHaveLength(0)
    })

    it.each([
      '(await (request.json()))',
      'req.body',
      '(request.body)',
      'payload',
    ])('flags client payload initializer %s at privilege boundary', (initializer) => {
      const content = `export async function POST(req, request) {\n  const payload = await req.json()\n  const { role } = ${initializer}\n  if (role === 'admin') performAdminAction()\n}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/action.ts', size: content.length, content, truncated: false }],
      }))
      expect(findings.filter((f) => f.security?.ruleId === 'auth.client-identity-trust')).toHaveLength(1)
    })

    it('flags renamed role destructuring gating privileged branch', () => {
      const content = `export async function POST(req) {\n  const { role: userRole } = await req.json()\n  if (userRole === 'admin') {\n    performAdminAction()\n  }\n}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/action.ts', size: content.length, content, truncated: false }],
      }))
      const trustFindings = findings.filter((f) => f.security?.ruleId === 'auth.client-identity-trust')
      expect(trustFindings.length).toBe(1)
      expect(trustFindings[0].severity).toBe('high')
    })
  })

  // Defect 7: Client bundle secret leak requires credential context
  describe('Defect 7: Client bundle secret leak requires secret naming context', () => {
    it('does not flag benign API_URL or NEXT_PUBLIC publishable keys in client components', () => {
      const content = `'use client'\nexport function Component() {\n  const apiUrl = process.env.API_URL\n  const pubKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY\n  return <div>{apiUrl}</div>\n}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'components/Comp.tsx', size: content.length, content, truncated: false }],
      }))
      const leakFindings = findings.filter((f) => f.security?.ruleId === 'next.client-secret-leak')
      expect(leakFindings).toHaveLength(0)
    })

    it('flags actual server secret referenced in use client component as heuristic hotspot', () => {
      const content = `'use client'\nexport function Component() {\n  const secret = process.env.DATABASE_URL\n  return <div>{secret}</div>\n}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'components/Comp.tsx', size: content.length, content, truncated: false }],
      }))
      const leakFindings = findings.filter((f) => f.security?.ruleId === 'next.client-secret-leak')
      expect(leakFindings.length).toBe(1)
      expect(leakFindings[0].verification).toBe('heuristic')
      expect(leakFindings[0].security?.observation).toContain('source environment reference observed')
    })

    it('flags NEXT_PUBLIC exposure of private/secret keys', () => {
      const content = `export const secret = process.env.NEXT_PUBLIC_ADMIN_SECRET_KEY;`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'lib/config.ts', size: content.length, content, truncated: false }],
      }))
      const leakFindings = findings.filter((f) => f.security?.ruleId === 'next.client-secret-leak')
      expect(leakFindings.length).toBe(1)
    })

    it('does not flag generic NEXT_PUBLIC_API_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY', () => {
      const content = `export const apiKey = process.env.NEXT_PUBLIC_API_KEY\nexport const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'lib/env.ts', size: content.length, content, truncated: false }],
      }))
      const leakFindings = findings.filter((f) => f.security?.ruleId === 'next.client-secret-leak')
      expect(leakFindings).toHaveLength(0)
    })
  })

  // Defect 8: CORS wildcard alone vs paired with credentials
  describe('Defect 8: CORS configuration accuracy', () => {
    it('does not flag wildcard origin alone for public APIs', () => {
      const content = `import cors from 'cors'\nconst middleware = cors({ origin: '*' })\n`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/cors.ts', size: content.length, content, truncated: false }],
      }))
      const corsFindings = findings.filter((f) => f.security?.ruleId === 'cors.wildcard-credentials')
      expect(corsFindings).toHaveLength(0)
    })

    it('flags wildcard paired with credentials as invalid browser configuration', () => {
      const content = `import cors from 'cors'\nconst middleware = cors({ origin: '*', credentials: true })\n`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/cors.ts', size: content.length, content, truncated: false }],
      }))
      const corsFindings = findings.filter((f) => f.security?.ruleId === 'cors.wildcard-credentials')
      expect(corsFindings.length).toBe(1)
      expect(corsFindings[0].severity).toBe('medium')
      expect(corsFindings[0].security?.observation).toContain('browser rejection')
    })

    it('flags dynamically reflected origin header paired with credentials', () => {
      const content = `export function middleware(req, res) {\n  res.setHeader('Access-Control-Allow-Origin', req.headers.origin)\n  res.setHeader('Access-Control-Allow-Credentials', 'true')\n}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/cors.ts', size: content.length, content, truncated: false }],
      }))
      const corsFindings = findings.filter((f) => f.security?.ruleId === 'cors.wildcard-credentials')
      expect(corsFindings.length).toBe(1)
      expect(corsFindings[0].severity).toBe('high')
    })

    it('does not flag explicit trusted origin allowlist paired with credentials', () => {
      const content = `export function middleware(req, res) {\n  res.setHeader('Access-Control-Allow-Origin', 'https://trusted.app.com')\n  res.setHeader('Access-Control-Allow-Credentials', 'true')\n}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/cors.ts', size: content.length, content, truncated: false }],
      }))
      const corsFindings = findings.filter((f) => f.security?.ruleId === 'cors.wildcard-credentials')
      expect(corsFindings).toHaveLength(0)
    })

    it('does not pair credentials and wildcard origin across unrelated calls or objects', () => {
      const content = `import cors from 'cors'\nconst publicApi = cors({ origin: '*' })\nconst privateApi = cors({ credentials: true })`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/cors.ts', size: content.length, content, truncated: false }],
      }))
      const corsFindings = findings.filter((f) => f.security?.ruleId === 'cors.wildcard-credentials')
      expect(corsFindings).toHaveLength(0)
    })
  })

  // Defect 9: Production dev switch AST analysis (no regex false positives on log strings)
  describe('Defect 9: Production dev switch AST validation', () => {
    it('does not flag log statements containing bypassAuth = true text', () => {
      const content = `export function init() {\n  console.log("bypassAuth = true should never be used")\n}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/init.ts', size: content.length, content, truncated: false }],
      }))
      const devFindings = findings.filter((f) => f.security?.ruleId === 'env.dev-switch-production')
      expect(devFindings).toHaveLength(0)
    })

    it('does not flag dev switch protected by nested development check', () => {
      const content = `export function setup() {
  if (process.env.NODE_ENV === 'production') {
    if (process.env.DEBUG_ALLOWED === 'true') {
      enableDebug = true
    }
  }
}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/setup.ts', size: content.length, content, truncated: false }],
      }))
      const devFindings = findings.filter((f) => f.security?.ruleId === 'env.dev-switch-production')
      expect(devFindings).toHaveLength(0)
    })

    it('does not flag bypass assignment guarded for development-only branch', () => {
      const content = `export function setup() {\n  if (process.env.NODE_ENV !== 'production') {\n    bypassAuth = true\n  }\n}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/setup.ts', size: content.length, content, truncated: false }],
      }))
      const devFindings = findings.filter((f) => f.security?.ruleId === 'env.dev-switch-production')
      expect(devFindings).toHaveLength(0)
    })

    it('flags actual assignment enabling bypassAuth under production condition', () => {
      const content = `export function setup() {
  if (process.env.NODE_ENV === 'production') {
    bypassAuth = true
  }
}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/setup.ts', size: content.length, content, truncated: false }],
      }))
      const devFindings = findings.filter((f) => f.security?.ruleId === 'env.dev-switch-production')
      expect(devFindings.length).toBe(1)
      expect(devFindings[0].severity).toBe('high')
    })
  })

  // Dynamic execution literal vs dynamic
  describe('Rule: Dynamic execution (js.dynamic-execution)', () => {
    it('distinguishes dynamic eval from literal eval with qualified confidence and severity', () => {
      const dynamicContent = `// line 1\nexport function handler(req) {\n  const res = eval(req.url)\n  return res\n}`
      const literalContent = `// line 1\nexport function handler() {\n  const res = eval("1 + 1")\n  return res\n}`

      const dynamicFindings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/dynamic.ts', size: dynamicContent.length, content: dynamicContent, truncated: false }],
      }))
      const literalFindings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/literal.ts', size: literalContent.length, content: literalContent, truncated: false }],
      }))

      const dyn = dynamicFindings.find((f) => f.security?.ruleId === 'js.dynamic-execution')
      expect(dyn).toBeDefined()
      expect(dyn?.severity).toBe('high')
      expect(dyn?.confidence).toBe('high')
      expect(dyn?.security?.lineStart).toBe(3)
      expect(dyn?.security?.lineEnd).toBe(3)
      expect(dyn?.security?.observation).toContain('dynamic argument')

      const lit = literalFindings.find((f) => f.security?.ruleId === 'js.dynamic-execution')
      expect(lit).toBeDefined()
      expect(lit?.severity).toBe('medium')
      expect(lit?.confidence).toBe('medium')
      expect(lit?.security?.lineStart).toBe(3)
      expect(lit?.security?.observation).toContain('literal argument')
    })

    it('detects new Function constructor call and ignores comments and strings', () => {
      const badContent = `export function create(code) {\n  return new Function('a', 'return ' + code)\n}`
      const benignContent = `// new Function('a', 'return a')\nconst comment = "Do not use new Function() in code"\n`

      const badFindings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/bad-func.ts', size: badContent.length, content: badContent, truncated: false }],
      }))
      const benignFindings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/benign-func.ts', size: benignContent.length, content: benignContent, truncated: false }],
      }))

      const bad = badFindings.find((f) => f.security?.ruleId === 'js.dynamic-execution')
      expect(bad).toBeDefined()
      expect(bad?.security?.lineStart).toBe(2)

      const benign = benignFindings.filter((f) => f.security?.ruleId === 'js.dynamic-execution')
      expect(benign).toHaveLength(0)
    })
  })

  // HTML injection
  describe('Rule: Unsafe HTML injection (xss.unsafe-html)', () => {
    it('flags dynamic dangerouslySetInnerHTML and innerHTML while allowing static templates', () => {
      const badContent = `export function View({ userHtml, dynamicBody }) {\n  document.getElementById('app').innerHTML = dynamicBody\n  return <div dangerouslySetInnerHTML={{ __html: userHtml }} />\n}`
      const safeContent = `export function View() {\n  document.getElementById('app').innerHTML = '<p>Static header</p>'\n  return <div dangerouslySetInnerHTML={{ __html: '<p>Fixed disclaimer</p>' }} />\n}`

      const badFindings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/view.tsx', size: badContent.length, content: badContent, truncated: false }],
      }))
      const safeFindings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/safe-view.tsx', size: safeContent.length, content: safeContent, truncated: false }],
      }))

      const xssFindings = badFindings.filter((f) => f.security?.ruleId === 'xss.unsafe-html')
      expect(xssFindings.length).toBeGreaterThanOrEqual(1)
      expect(xssFindings[0].severity).toBe('high')

      const safeXss = safeFindings.filter((f) => f.security?.ruleId === 'xss.unsafe-html')
      expect(safeXss).toHaveLength(0)
    })
  })

  // CI Workflow checks
  describe('Rule: CI untrusted GitHub event expression (ci.untrusted-event-interpolation)', () => {
    it('flags untrusted event expressions in run scripts and allows env indirection', () => {
      const badWorkflow = `name: PR Check\non: [issues, pull_request_target]\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo "Title: \${{ github.event.issue.title }}"\n`
      const safeWorkflow = `name: PR Check\non: [issues]\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - env:\n          ISSUE_TITLE: \${{ github.event.issue.title }}\n        run: echo "Title: $ISSUE_TITLE"\n`

      const badFindings = analyzeStaticSecurity(createMockContext({
        files: [{ path: '.github/workflows/check.yml', size: badWorkflow.length, content: badWorkflow, truncated: false }],
      }))
      const safeFindings = analyzeStaticSecurity(createMockContext({
        files: [{ path: '.github/workflows/safe-check.yml', size: safeWorkflow.length, content: safeWorkflow, truncated: false }],
      }))

      const ciHits = badFindings.filter((f) => f.security?.ruleId === 'ci.untrusted-event-interpolation')
      expect(ciHits.length).toBeGreaterThanOrEqual(1)
      expect(ciHits[0].severity).toBe('high')
      expect(ciHits[0].verification).toBe('heuristic')
      expect(ciHits[0].security?.lineStart).toBe(7)

      const safeCiHits = safeFindings.filter((f) => f.security?.ruleId === 'ci.untrusted-event-interpolation')
      expect(safeCiHits).toHaveLength(0)
    })
  })

  describe('Rule: CI overly broad permissions (ci.broad-permissions)', () => {
    it('flags permissions: write-all in workflows and allows granular read permissions', () => {
      const badWorkflow = `name: Build\non: push\npermissions: write-all\njobs:\n  build:\n    runs-on: ubuntu-latest\n`
      const safeWorkflow = `name: Build\non: push\npermissions:\n  contents: read\njobs:\n  build:\n    runs-on: ubuntu-latest\n`

      const badFindings = analyzeStaticSecurity(createMockContext({
        files: [{ path: '.github/workflows/build.yml', size: badWorkflow.length, content: badWorkflow, truncated: false }],
      }))
      const safeFindings = analyzeStaticSecurity(createMockContext({
        files: [{ path: '.github/workflows/safe-build.yml', size: safeWorkflow.length, content: safeWorkflow, truncated: false }],
      }))

      const permHits = badFindings.filter((f) => f.security?.ruleId === 'ci.broad-permissions')
      expect(permHits.length).toBe(1)
      expect(permHits[0].severity).toBe('medium')
      expect(permHits[0].security?.lineStart).toBe(3)

      const safePermHits = safeFindings.filter((f) => f.security?.ruleId === 'ci.broad-permissions')
      expect(safePermHits).toHaveLength(0)
    })
  })

  // Public Projection & Metadata preservation
  describe('Public projection schema roundtrip and metadata preservation', () => {
    it('preserves finding.security metadata through public report projection', () => {
      const content = 'export function GET(request) { return eval(request.url) }'
      const findings = analyzeStaticSecurity(createMockContext({
        tree: [{ path: 'app/api/run/route.ts', type: 'file', size: content.length }],
        files: [{ path: 'app/api/run/route.ts', size: content.length, content, truncated: false }],
      }))
      expect(findings.length).toBeGreaterThan(0)
      const baseReport = makeRepoReport()
      const unsafe = {
        ...baseReport,
        repoScan: {
          ...baseReport.repoScan,
          securityFindings: findings,
        },
      }
      const safe = toPublicRepositoryReport(unsafe)
      expect(safe.repoScan.securityFindings[0].security).toBeDefined()
      expect(safe.repoScan.securityFindings[0].security?.ruleId).toBe('js.dynamic-execution')
      expect(safe.repoScan.securityFindings[0].security?.ruleVersion).toBe('1.0.0')
      expect(safe.repoScan.securityFindings[0].security?.commitSha).toBe('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2')
      expect(safe.repoScan.securityFindings[0].security?.lineStart).toBe(1)
      expect(safe.repoScan.securityFindings[0].security?.lineEnd).toBe(1)
      expect(safe.repoScan.securityFindings[0].security?.observation).toBeDefined()
      expect(safe.repoScan.securityFindings[0].security?.coverageLimitations).toBeDefined()
    })

    it('never contains raw source lines or values in finding evidence', () => {
      const opaque = 'opaque-attacker-input-never-copy'
      const content = `eval(${opaque})`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/runtime.ts', size: content.length, content, truncated: false }],
      }))
      expect(findings.length).toBeGreaterThan(0)
      expect(JSON.stringify(findings)).not.toContain(opaque)
      for (const f of findings) {
        for (const ev of f.evidence) {
          expect(ev).not.toContain(opaque)
        }
      }
    })
  })

  // Delta Counterexamples 1-6
  describe('Delta Counterexample 1: Lexical scope resolution for constants vs dynamic parameter shadow', () => {
    it('flags dynamic parameter shadow when an unrelated function declares a constant with the same name', () => {
      const content = `import { exec } from 'child_process'
function unrelated() { const cmd = 'date' }
function run(cmd) { exec(cmd) }`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/runner.ts', size: content.length, content, truncated: false }],
      }))
      const cmdHits = findings.filter((f) => f.security?.ruleId === 'cmd.unsafe-execution')
      expect(cmdHits).toHaveLength(1)
      expect(cmdHits[0].severity).toBe('high')
    })

    it('does not flag valid same-scope constant passed to exec', () => {
      const content = `import { exec } from 'child_process'
function run() {
  const cmd = 'date'
  exec(cmd)
}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/runner.ts', size: content.length, content, truncated: false }],
      }))
      const cmdHits = findings.filter((f) => f.security?.ruleId === 'cmd.unsafe-execution')
      expect(cmdHits).toHaveLength(0)
    })

    it('flags parameter shadowing an outer-scope constant', () => {
      const content = `import { exec } from 'child_process'
const cmd = 'date'
function run(cmd) {
  exec(cmd)
}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/runner.ts', size: content.length, content, truncated: false }],
      }))
      const cmdHits = findings.filter((f) => f.security?.ruleId === 'cmd.unsafe-execution')
      expect(cmdHits).toHaveLength(1)
      expect(cmdHits[0].severity).toBe('high')
    })
  })

  describe('Delta Counterexample 2: CORS headers across different receivers in same function', () => {
    it('does not falsely pair CORS headers set on different response receivers in the same function', () => {
      const content = `export function handler(publicRes, privateRes) {
  publicRes.setHeader('Access-Control-Allow-Origin', '*')
  privateRes.setHeader('Access-Control-Allow-Credentials', 'true')
}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/cors.ts', size: content.length, content, truncated: false }],
      }))
      const corsHits = findings.filter((f) => f.security?.ruleId === 'cors.wildcard-credentials')
      expect(corsHits).toHaveLength(0)
    })

    it('flags CORS wildcard with credentials when set on the same receiver', () => {
      const content = `export function handler(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/cors.ts', size: content.length, content, truncated: false }],
      }))
      const corsHits = findings.filter((f) => f.security?.ruleId === 'cors.wildcard-credentials')
      expect(corsHits).toHaveLength(1)
      expect(corsHits[0].severity).toBe('medium')
    })

    it('flags reflected origin with credentials on the same receiver as high severity', () => {
      const content = `export function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin)
  res.setHeader('Access-Control-Allow-Credentials', 'true')
}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/cors.ts', size: content.length, content, truncated: false }],
      }))
      const corsHits = findings.filter((f) => f.security?.ruleId === 'cors.wildcard-credentials')
      expect(corsHits).toHaveLength(1)
      expect(corsHits[0].severity).toBe('high')
    })
  })

  describe('Delta Counterexample 3: Parameterized SQL config objects vs dynamic interpolation', () => {
    it('recognizes safe pg pool.query parameterized config objects', () => {
      const content = `import { Pool } from 'pg'
const pool = new Pool()
export async function getUser(id) {
  return await pool.query({ text: 'SELECT * FROM users WHERE id = $1', values: [id] })
}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/db.ts', size: content.length, content, truncated: false }],
      }))
      const sqlHits = findings.filter((f) => f.security?.ruleId === 'sql.injection-sink')
      expect(sqlHits).toHaveLength(0)
    })

    it('recognizes constant variable referencing parameterized query config object', () => {
      const content = `import { Pool } from 'pg'
const pool = new Pool()
export async function getUser(id) {
  const queryConfig = { text: 'SELECT * FROM users WHERE id = $1', values: [id] }
  return await pool.query(queryConfig)
}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/db.ts', size: content.length, content, truncated: false }],
      }))
      const sqlHits = findings.filter((f) => f.security?.ruleId === 'sql.injection-sink')
      expect(sqlHits).toHaveLength(0)
    })

    it('does not make confident interpolation claim on unknown custom arguments', () => {
      const content = `import { Pool } from 'pg'
const pool = new Pool()
export async function getUser(customArgs) {
  return await pool.query(customArgs)
}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/db.ts', size: content.length, content, truncated: false }],
      }))
      const sqlHits = findings.filter((f) => f.security?.ruleId === 'sql.injection-sink')
      expect(sqlHits).toHaveLength(0)
    })

    it('flags real interpolated SQL at query sink', () => {
      const content = `import { Pool } from 'pg'
const pool = new Pool()
export async function getUser(id) {
  return await pool.query('SELECT * FROM users WHERE id = ' + id)
}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/db.ts', size: content.length, content, truncated: false }],
      }))
      const sqlHits = findings.filter((f) => f.security?.ruleId === 'sql.injection-sink')
      expect(sqlHits).toHaveLength(1)
      expect(sqlHits[0].severity).toBe('high')
    })

    it('flags dynamic string concatenation inside query config object', () => {
      const content = `import { Pool } from 'pg'
const pool = new Pool()
export async function getUser(table, id) {
  return await pool.query({ text: 'SELECT * FROM ' + table + ' WHERE id = $1', values: [id] })
}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/db.ts', size: content.length, content, truncated: false }],
      }))
      const sqlHits = findings.filter((f) => f.security?.ruleId === 'sql.injection-sink')
      expect(sqlHits).toHaveLength(1)
      expect(sqlHits[0].severity).toBe('high')
    })
  })

  describe('Delta Counterexample 4: Client identity trust gate without string literal / property false positives', () => {
    it('does not flag string literal matching role name in non-identity check', () => {
      const content = `export async function POST(req) {
  const { role } = await req.json()
  if (label === 'role') {
    log(label)
  }
}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/action.ts', size: content.length, content, truncated: false }],
      }))
      const trustHits = findings.filter((f) => f.security?.ruleId === 'auth.client-identity-trust')
      expect(trustHits).toHaveLength(0)
    })

    it('does not flag property name on other object matching role name', () => {
      const content = `export async function POST(req) {
  const { role } = await req.json()
  if (user.role === 'admin') {
    performAction()
  }
}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/action.ts', size: content.length, content, truncated: false }],
      }))
      const trustHits = findings.filter((f) => f.security?.ruleId === 'auth.client-identity-trust')
      expect(trustHits).toHaveLength(0)
    })

    it('flags actual client role binding checked in gate', () => {
      const content = `export async function POST(req) {
  const { role } = await req.json()
  if (role === 'admin') {
    performAction()
  }
}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/action.ts', size: content.length, content, truncated: false }],
      }))
      const trustHits = findings.filter((f) => f.security?.ruleId === 'auth.client-identity-trust')
      expect(trustHits).toHaveLength(1)
      expect(trustHits[0].severity).toBe('high')
    })

    it('flags renamed client role binding checked in gate', () => {
      const content = `export async function POST(req) {
  const { role: userRole } = await req.json()
  if (userRole === 'admin') {
    performAction()
  }
}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/action.ts', size: content.length, content, truncated: false }],
      }))
      const trustHits = findings.filter((f) => f.security?.ruleId === 'auth.client-identity-trust')
      expect(trustHits).toHaveLength(1)
      expect(trustHits[0].severity).toBe('high')
    })
  })

  describe('Delta Counterexample 5: cors({ origin: true, credentials: true }) reflects origin', () => {
    it('flags cors({ origin: true, credentials: true }) as reflected origin with qualified impact and high severity', () => {
      const content = `import cors from 'cors'
const middleware = cors({ origin: true, credentials: true })`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/cors.ts', size: content.length, content, truncated: false }],
      }))
      const corsHits = findings.filter((f) => f.security?.ruleId === 'cors.wildcard-credentials')
      expect(corsHits).toHaveLength(1)
      expect(corsHits[0].severity).toBe('high')
      expect(corsHits[0].security?.observation).toContain('reflecting request origin')
      expect(corsHits[0].security?.observation).not.toMatch(/browser rejection/i)
      expect(corsHits[0].description).not.toMatch(/browsers reject/i)
    })

    it('keeps cors({ origin: "*", credentials: true }) as medium invalid browser config', () => {
      const content = `import cors from 'cors'
const middleware = cors({ origin: '*', credentials: true })`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/cors.ts', size: content.length, content, truncated: false }],
      }))
      const corsHits = findings.filter((f) => f.security?.ruleId === 'cors.wildcard-credentials')
      expect(corsHits).toHaveLength(1)
      expect(corsHits[0].severity).toBe('medium')
      expect(corsHits[0].security?.observation).toContain('browser rejection')
    })

    it('does not flag 3 safe/unknown cors configurations', () => {
      const content1 = `import cors from 'cors'\nconst m1 = cors({ origin: '*' })`
      const content2 = `import cors from 'cors'\nconst m2 = cors({ origin: 'https://trusted.com', credentials: true })`
      const content3 = `import cors from 'cors'\nconst m3 = cors({ credentials: true })`

      for (const content of [content1, content2, content3]) {
        const findings = analyzeStaticSecurity(createMockContext({
          files: [{ path: 'src/cors.ts', size: content.length, content, truncated: false }],
        }))
        const corsHits = findings.filter((f) => f.security?.ruleId === 'cors.wildcard-credentials')
        expect(corsHits).toHaveLength(0)
      }
    })
  })

  describe('Delta Counterexample 6: Production dev switch AST inspection on directly returned object configs', () => {
    it('flags direct returned bypassAuth config under NODE_ENV === "production"', () => {
      const content = `export function getConfig() {
  if (NODE_ENV === 'production') {
    return { bypassAuth: true }
  }
}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/config.ts', size: content.length, content, truncated: false }],
      }))
      const devHits = findings.filter((f) => f.security?.ruleId === 'env.dev-switch-production')
      expect(devHits).toHaveLength(1)
      expect(devHits[0].severity).toBe('high')
    })

    it('flags direct returned debugMode config under process.env.NODE_ENV === "production"', () => {
      const content = `export function getConfig() {
  if (process.env.NODE_ENV === 'production') {
    return { debugMode: true }
  }
}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/config.ts', size: content.length, content, truncated: false }],
      }))
      const devHits = findings.filter((f) => f.security?.ruleId === 'env.dev-switch-production')
      expect(devHits).toHaveLength(1)
      expect(devHits[0].severity).toBe('high')
    })

    it('does not flag logging string mentioning bypassAuth', () => {
      const content = `export function getConfig() {
  if (process.env.NODE_ENV === 'production') {
    console.log("bypassAuth: true is disabled")
  }
}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/config.ts', size: content.length, content, truncated: false }],
      }))
      const devHits = findings.filter((f) => f.security?.ruleId === 'env.dev-switch-production')
      expect(devHits).toHaveLength(0)
    })

    it('does not flag return on development guard (dead guard for production)', () => {
      const content = `export function getConfig() {
  if (NODE_ENV !== 'production') {
    return { bypassAuth: true }
  }
}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/config.ts', size: content.length, content, truncated: false }],
      }))
      const devHits = findings.filter((f) => f.security?.ruleId === 'env.dev-switch-production')
      expect(devHits).toHaveLength(0)
    })

    it('does not flag nested development guard inside production check', () => {
      const content = `export function getConfig() {
  if (NODE_ENV === 'production') {
    if (process.env.DEV_OVERRIDE === 'true') {
      return { bypassAuth: true }
    }
  }
}`
      const findings = analyzeStaticSecurity(createMockContext({
        files: [{ path: 'src/config.ts', size: content.length, content, truncated: false }],
      }))
      const devHits = findings.filter((f) => f.security?.ruleId === 'env.dev-switch-production')
      expect(devHits).toHaveLength(0)
    })
  })

  // Quality Delta 1: Single static scan reuse per context
  describe('Quality Delta 1: Single static scan reuse per context', () => {
    it('checkSecurity retains standalone compatibility when staticFindings omitted', () => {
      const content = 'export function GET(req) { return eval(req.url) }'
      const ctx = createMockContext({
        files: [{ path: 'app/api/route.ts', size: content.length, content, truncated: false }],
      })
      const findings = checkSecurity(ctx)
      const evalHits = findings.filter((f) => f.security?.ruleId === 'js.dynamic-execution')
      expect(evalHits).toHaveLength(1)
    })

    it('checkSecurity reuses provided static findings without re-scanning', () => {
      const spy = vi.spyOn(staticModule, 'analyzeStaticSecurity')
      const ctx = createMockContext()
      const dummyFindings = [
        {
          id: 'dummy-eval',
          category: 'Security' as const,
          title: 'dummy',
          description: 'dummy',
          severity: 'high' as const,
          confidence: 'high' as const,
          evidence: ['test'],
          location: 'a.ts:1',
          recommendation: 'test',
          source: 'repository' as const,
          verification: 'heuristic' as const,
          security: {
            category: 'Security' as const,
            ruleId: 'js.dynamic-execution',
            ruleVersion: '1.0.0',
            commitSha: 'sha',
            filePath: 'a.ts',
            lineStart: 1,
            lineEnd: 1,
            observation: 'test',
            possibleImpact: 'test',
            coverageLimitations: 'test',
          },
        },
      ]

      const findings = checkSecurity(ctx, dummyFindings)
      expect(spy).not.toHaveBeenCalled()
      expect(findings.some((f) => f.id === 'dummy-eval')).toBe(true)
      spy.mockRestore()
    })

    it('analyzeRepository invokes static AST scan exactly once per context invocation', () => {
      const spy = vi.spyOn(staticModule, 'analyzeStaticSecurity')
      const content = 'export function GET(req) { return eval(req.url) }'
      const ctx = createMockContext({
        files: [{ path: 'app/api/route.ts', size: content.length, content, truncated: false }],
      })
      const res = analyzeRepository(ctx)
      expect(spy).toHaveBeenCalledTimes(1)
      expect(res.findings.some((f) => f.security?.ruleId === 'js.dynamic-execution')).toBe(true)
      spy.mockRestore()
    })
  })

  // Quality Delta 2: Attacker AST depth & work bound preflight and failure isolation
  describe('Quality Delta 2: AST depth and work bound preflight with failure isolation', () => {
    it('marks deeply nested AST (>128 levels) as partial without throwing, and preserves second clean file findings', () => {
      expect(MAX_AST_DEPTH).toBe(128)
      expect(MAX_AST_NODES).toBe(50_000)

      // Construct an expression with 140 nested unary operators within < 128 KiB
      const deepContent = 'export const deep = ' + '!'.repeat(140) + 'true;\n'
      const cleanContent = 'export function GET(req) { return eval(req.url) }'

      const ctx = createMockContext({
        files: [
          { path: 'src/deep.ts', size: deepContent.length, content: deepContent, truncated: false },
          { path: 'src/clean.ts', size: cleanContent.length, content: cleanContent, truncated: false },
        ],
      })

      const scanResult = scanStaticSecurity(ctx)
      expect(scanResult.coverage.filesAttempted).toBe(2)
      expect(scanResult.coverage.filesPartial).toBe(1)
      expect(scanResult.coverage.filesParsed).toBe(1)

      const deepStatus = scanResult.coverage.fileStatuses.find((s) => s.path === 'src/deep.ts')
      expect(deepStatus?.status).toBe('partial')
      expect(deepStatus?.reason).toMatch(/depth/i)

      const cleanStatus = scanResult.coverage.fileStatuses.find((s) => s.path === 'src/clean.ts')
      expect(cleanStatus?.status).toBe('parsed')

      // Clean file's security findings MUST be present
      const evalHits = scanResult.findings.filter((f) => f.security?.ruleId === 'js.dynamic-execution')
      expect(evalHits).toHaveLength(1)
      expect(evalHits[0].filePath).toBe('src/clean.ts')

      // Scope warnings truthfully indicate partial status
      expect(scanResult.coverage.scopeWarnings?.some((w) => /partial|limit/i.test(w))).toBe(true)
    })

    it('marks file exceeding node work budget as partial without crashing analysis', () => {
      // 18,000 variable statements = > 50,000 AST nodes
      const lines: string[] = []
      for (let i = 0; i < 18000; i++) {
        lines.push(`const v${i} = ${i};`)
      }
      const massiveContent = lines.join('\n')

      const ctx = createMockContext({
        files: [
          { path: 'src/massive.ts', size: massiveContent.length, content: massiveContent, truncated: false },
        ],
      })

      const scanResult = scanStaticSecurity(ctx)
      expect(scanResult.coverage.filesPartial).toBe(1)
      const status = scanResult.coverage.fileStatuses.find((s) => s.path === 'src/massive.ts')
      expect(status?.status).toBe('partial')
      expect(status?.reason).toMatch(/node|budget|limit/i)
    })

    it('bounds recursive alias chain resolution without stack overflowing', () => {
      // 100 alias declarations chained
      const chainLines: string[] = ["import { exec } from 'child_process'", "const a0 = 'date'"]
      for (let i = 1; i <= 100; i++) {
        chainLines.push(`const a${i} = a${i - 1}`)
      }
      chainLines.push('exec(a100)')
      const chainContent = chainLines.join('\n')

      const ctx = createMockContext({
        files: [
          { path: 'src/chain.ts', size: chainContent.length, content: chainContent, truncated: false },
        ],
      })

      // Must complete without RangeError: Maximum call stack size exceeded
      expect(() => analyzeStaticSecurity(ctx)).not.toThrow()
    })
  })
})
