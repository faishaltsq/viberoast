import { describe, expect, it } from 'vitest'
import {
  detectSecrets,
  classifySecret,
  redactSecretText,
  redactUrl,
} from '../lib/security/secrets'
import { collectSensitiveValues } from '../lib/security/redact'
import { SECRET_RULES } from '../lib/security/secrets/patterns'
import { checkSecurity } from '../lib/analysis/checks/security'
import type { AnalysisContext } from '../lib/analysis/types'
import * as fixtures from './fixtures/security'

describe('Secret Detection & Classification Engine', () => {
  function createMockCtx(overrides: Partial<AnalysisContext> = {}): AnalysisContext {
    return {
      owner: 'org',
      repo: 'repo',
      sha: '1111222233334444555566667777888899990000',
      tree: [],
      files: [],
      meta: {
        owner: 'org',
        repo: 'repo',
        defaultBranch: 'main',
        sha: '1111222233334444555566667777888899990000',
      },
      ...overrides,
    }
  }

  // 1. First RED TDD requirement
  describe('TDD initial baseline specification', () => {
    it('detects synthetic GitHub PAT on line 2 as recognized and redactSecretText omits value', () => {
      const syntheticGithub = 'ghp_' + 'Q7n4'.repeat(9)
      const content = `// Header comment\nconst token = "${syntheticGithub}"\nconsole.log("ready")`

      const candidates = detectSecrets(content, 'src/config.ts')
      const target = candidates.find((c) => c.value === syntheticGithub)

      expect(target).toBeDefined()
      expect(target?.classification).toBe('recognized')
      expect(target?.lineStart).toBe(2)
      expect(target?.lineEnd).toBe(2)
      expect(target?.ruleId).toContain('github')
      expect(target?.confidence).toBe('high')

      const redacted = redactSecretText(content)
      expect(redacted).not.toContain(syntheticGithub)
      expect(redacted).toContain('[redacted]')
    })

    it('classifies Stripe publishable key as publishable and never recognized private', () => {
      const stripePk = 'pk_test_' + 'a7Z2'.repeat(6)
      const content = `const publishableKey = "${stripePk}"`

      const candidates = detectSecrets(content, 'src/stripe.ts')
      const target = candidates.find((c) => c.value === stripePk)

      expect(target).toBeDefined()
      expect(target?.classification).toBe('publishable')
      expect(target?.classification).not.toBe('recognized')
    })

    it('classifies YOUR_API_KEY_HERE as placeholder and never recognized private', () => {
      const placeholder = 'YOUR_API_KEY_HERE'
      const content = `const apiKey = "${placeholder}"`

      const candidates = detectSecrets(content, 'src/api.ts')
      for (const candidate of candidates) {
        expect(candidate.classification).not.toBe('recognized')
        expect(candidate.classification).toBe('placeholder')
      }

      const classification = classifySecret(placeholder, content, 'generic-api-key')
      expect(classification).toBe('placeholder')
      expect(classification).not.toBe('recognized')
    })
  })

  // 2. Comprehensive Provider Families
  describe('Provider rule families', () => {
    it('detects GitHub token variations (classic, finegrained, oauth, app user/server, refresh)', () => {
      const content = [
        `classic: ${fixtures.GITHUB_PAT}`,
        `finegrained: ${fixtures.GITHUB_FINE_GRAINED}`,
        `oauth: ${fixtures.GITHUB_OAUTH}`,
        `app_user: ${fixtures.GITHUB_APP_USER}`,
        `app_server: ${fixtures.GITHUB_APP_SERVER}`,
        `refresh: ${fixtures.GITHUB_REFRESH}`,
      ].join('\n')

      const candidates = detectSecrets(content, 'src/github.ts')
      const values = candidates.map((c) => c.value)

      expect(values).toContain(fixtures.GITHUB_PAT)
      expect(values).toContain(fixtures.GITHUB_FINE_GRAINED)
      expect(values).toContain(fixtures.GITHUB_OAUTH)
      expect(values).toContain(fixtures.GITHUB_APP_USER)
      expect(values).toContain(fixtures.GITHUB_APP_SERVER)
      expect(values).toContain(fixtures.GITHUB_REFRESH)

      for (const c of candidates) {
        expect(c.classification).toBe('recognized')
        expect(c.confidence).toBe('high')
      }
    })

    it('detects AWS access keys and associated contextual secrets', () => {
      const content = [
        `aws_access_key_id = "${fixtures.AWS_ACCESS_KEY_ID}"`,
        `aws_secret_access_key = "${fixtures.AWS_SECRET_ACCESS_KEY}"`,
        `bedrock_key = "${fixtures.AWS_BEDROCK_LONG_LIVED}"`,
        `bedrock_short = "${fixtures.AWS_BEDROCK_SHORT_LIVED}"`,
      ].join('\n')

      const candidates = detectSecrets(content, 'src/aws.ts')
      const keyId = candidates.find((c) => c.value === fixtures.AWS_ACCESS_KEY_ID)
      const secret = candidates.find((c) => c.value === fixtures.AWS_SECRET_ACCESS_KEY)

      expect(keyId).toBeDefined()
      expect(secret).toBeDefined()
      expect(secret?.classification).toBe('recognized')

      // AWS example key must be low confidence or placeholder
      const exampleCandidates = detectSecrets(`aws_key = "${fixtures.AWS_EXAMPLE_KEY}"`)
      const exampleKey = exampleCandidates.find((c) => c.value === fixtures.AWS_EXAMPLE_KEY)
      expect(exampleKey?.classification).toBe('placeholder')
      expect(exampleKey?.confidence).toBe('low')
    })

    it('detects Stripe private keys and webhook secrets while separating publishable keys', () => {
      const content = [
        `live: ${fixtures.STRIPE_SK_LIVE}`,
        `test: ${fixtures.STRIPE_SK_TEST}`,
        `restricted: ${fixtures.STRIPE_RK_LIVE}`,
        `webhook: ${fixtures.STRIPE_WHSEC}`,
        `pub_test: ${fixtures.STRIPE_PK_TEST}`,
        `pub_live: ${fixtures.STRIPE_PK_LIVE}`,
      ].join('\n')

      const candidates = detectSecrets(content, 'src/stripe.ts')

      const skLive = candidates.find((c) => c.value === fixtures.STRIPE_SK_LIVE)
      const skTest = candidates.find((c) => c.value === fixtures.STRIPE_SK_TEST)
      const rkLive = candidates.find((c) => c.value === fixtures.STRIPE_RK_LIVE)
      const whsec = candidates.find((c) => c.value === fixtures.STRIPE_WHSEC)
      const pkTest = candidates.find((c) => c.value === fixtures.STRIPE_PK_TEST)
      const pkLive = candidates.find((c) => c.value === fixtures.STRIPE_PK_LIVE)

      expect(skLive?.classification).toBe('recognized')
      expect(skTest?.classification).toBe('recognized')
      expect(rkLive?.classification).toBe('recognized')
      expect(whsec?.classification).toBe('recognized')

      expect(pkTest?.classification).toBe('publishable')
      expect(pkLive?.classification).toBe('publishable')
    })

    it('detects Slack bot, user, app tokens, and webhook URLs', () => {
      const content = [
        `bot: ${fixtures.SLACK_BOT_TOKEN}`,
        `user: ${fixtures.SLACK_USER_TOKEN}`,
        `app: ${fixtures.SLACK_APP_TOKEN}`,
        `hook: ${fixtures.SLACK_WEBHOOK_URL}`,
      ].join('\n')

      const candidates = detectSecrets(content, 'src/slack.ts')
      expect(candidates.find((c) => c.value === fixtures.SLACK_BOT_TOKEN)?.classification).toBe('recognized')
      expect(candidates.find((c) => c.value === fixtures.SLACK_USER_TOKEN)?.classification).toBe('recognized')
      expect(candidates.find((c) => c.value === fixtures.SLACK_APP_TOKEN)?.classification).toBe('recognized')
      expect(candidates.find((c) => c.value === fixtures.SLACK_WEBHOOK_URL)?.classification).toBe('recognized')
    })

    it('detects OpenAI modern project keys ({74}|{58} segments around T3BlbkFJ) and legacy keys', () => {
      const content = [
        `modern_74: ${fixtures.OPENAI_MODERN_PROJECT}`,
        `modern_58: ${fixtures.OPENAI_MODERN_58}`,
        `legacy: ${fixtures.OPENAI_LEGACY}`,
      ].join('\n')

      const candidates = detectSecrets(content, 'src/openai.ts')
      expect(candidates.find((c) => c.value === fixtures.OPENAI_MODERN_PROJECT)?.classification).toBe('recognized')
      expect(candidates.find((c) => c.value === fixtures.OPENAI_MODERN_58)?.classification).toBe('recognized')
      expect(candidates.find((c) => c.value === fixtures.OPENAI_LEGACY)?.classification).toBe('recognized')
    })

    it('detects Anthropic API and Admin keys with exact length requirements', () => {
      const content = [
        `api: ${fixtures.ANTHROPIC_API_KEY}`,
        `admin: ${fixtures.ANTHROPIC_ADMIN_KEY}`,
      ].join('\n')

      const candidates = detectSecrets(content, 'src/anthropic.ts')
      expect(candidates.find((c) => c.value === fixtures.ANTHROPIC_API_KEY)?.classification).toBe('recognized')
      expect(candidates.find((c) => c.value === fixtures.ANTHROPIC_ADMIN_KEY)?.classification).toBe('recognized')
    })

    it('detects Google Service Account JSON with escaped PEM newlines and GCP API keys', () => {
      const candidates = detectSecrets(fixtures.GOOGLE_SERVICE_ACCOUNT_JSON, 'config/sa.json')
      const gcpCandidates = detectSecrets(`const key = "${fixtures.GCP_API_KEY}"`, 'src/gcp.ts')

      expect(candidates.some((c) => c.ruleId.includes('google-service-account') || c.ruleId.includes('private-key'))).toBe(true)
      expect(gcpCandidates.find((c) => c.value === fixtures.GCP_API_KEY)?.classification).toBe('recognized')
    })

    it('distinguishes PEM private keys from public keys and certificates', () => {
      const privCandidates = detectSecrets(fixtures.PEM_PRIVATE_KEY, 'certs/key.pem')
      const pubCandidates = detectSecrets(fixtures.PEM_PUBLIC_KEY, 'certs/pub.pem')
      const certCandidates = detectSecrets(fixtures.PEM_CERTIFICATE, 'certs/cert.pem')

      expect(privCandidates.length).toBeGreaterThan(0)
      expect(privCandidates[0].classification).toMatch(/recognized|suspicious/)

      expect(pubCandidates.every((c) => c.classification === 'publishable')).toBe(true)
      expect(certCandidates.every((c) => c.classification === 'publishable')).toBe(true)
    })

    it('extracts credentials from database connection URLs including percent-encoded passwords', () => {
      const content = `DATABASE_URL="${fixtures.DATABASE_URL_POSTGRES}"`
      const candidates = detectSecrets(content, '.env')

      const dbMatch = candidates.find((c) => c.ruleId.includes('database-url') || c.value.includes('p%40ssw0rd123!'))
      expect(dbMatch).toBeDefined()
      expect(dbMatch?.classification).toMatch(/recognized|suspicious/)
    })

    it('detects JWT signing secrets and inspects Supabase token roles contextually', () => {
      const signingCandidates = detectSecrets(fixtures.JWT_SIGNING_CONFIG, 'src/jwt.ts')
      expect(signingCandidates.length).toBeGreaterThan(0)
      expect(signingCandidates[0].classification).toMatch(/recognized|suspicious/)

      const supabaseAnon = `SUPABASE_ANON_KEY="${fixtures.SUPABASE_ANON_JWT}"`
      const supabaseService = `SUPABASE_SERVICE_ROLE_KEY="${fixtures.SUPABASE_SERVICE_ROLE_JWT}"`

      const anonCandidates = detectSecrets(supabaseAnon, '.env')
      const serviceCandidates = detectSecrets(supabaseService, '.env')

      expect(anonCandidates.find((c) => c.value === fixtures.SUPABASE_ANON_JWT)?.classification).toBe('publishable')
      expect(serviceCandidates.find((c) => c.value === fixtures.SUPABASE_SERVICE_ROLE_JWT)?.classification).toBe('recognized')
    })

    it('detects Supabase prefixes (sb_publishable_, sb_secret_, sbp_)', () => {
      const content = [
        `pub: ${fixtures.SUPABASE_PUBLISHABLE}`,
        `sec: ${fixtures.SUPABASE_SECRET}`,
        `pat: ${fixtures.SUPABASE_PAT}`,
      ].join('\n')

      const candidates = detectSecrets(content, 'src/supabase.ts')
      expect(candidates.find((c) => c.value === fixtures.SUPABASE_PUBLISHABLE)?.classification).toBe('publishable')
      expect(candidates.find((c) => c.value === fixtures.SUPABASE_SECRET)?.classification).toBe('recognized')
      expect(candidates.find((c) => c.value === fixtures.SUPABASE_PAT)?.classification).toBe('recognized')
    })
  })

  // 3. Line numbers, offsets, and comment handling
  describe('Location and metadata guarantees', () => {
    it('accurately records original character offsets and 1-based line numbers', () => {
      const content = `line 1\nline 2 with ${fixtures.GITHUB_PAT}\nline 3`
      const candidates = detectSecrets(content, 'src/app.ts')
      const target = candidates.find((c) => c.value === fixtures.GITHUB_PAT)

      expect(target).toBeDefined()
      expect(target?.lineStart).toBe(2)
      expect(target?.lineEnd).toBe(2)
      expect(content.slice(target!.start, target!.end)).toBe(fixtures.GITHUB_PAT)
    })

    it('detects secrets inside comments without skipping them', () => {
      const content = `// TODO: remove temporary secret: ${fixtures.GITHUB_PAT}`
      const candidates = detectSecrets(content, 'src/index.ts')
      expect(candidates.some((c) => c.value === fixtures.GITHUB_PAT)).toBe(true)
    })

    it('inspects .test and .example files rather than skipping wholesale', () => {
      const testFile = `describe("api", () => { const key = "${fixtures.GITHUB_PAT}" })`
      const exampleFile = `API_KEY=${fixtures.GITHUB_PAT}`

      const testCandidates = detectSecrets(testFile, 'tests/api.test.ts')
      const exampleCandidates = detectSecrets(exampleFile, '.env.example')

      expect(testCandidates.some((c) => c.value === fixtures.GITHUB_PAT)).toBe(true)
      expect(exampleCandidates.some((c) => c.value === fixtures.GITHUB_PAT)).toBe(true)
    })
  })

  // 4. Redaction behavior
  describe('Redaction engine', () => {
    it('redacts detected secrets without leaking values', () => {
      const text = `Connect using ${fixtures.GITHUB_PAT} and ${fixtures.STRIPE_SK_LIVE}`
      const redacted = redactSecretText(text)

      expect(redacted).not.toContain(fixtures.GITHUB_PAT)
      expect(redacted).not.toContain(fixtures.STRIPE_SK_LIVE)
      expect(redacted).toContain('[redacted]')
    })

    it('does not redact publishable keys or placeholders unless explicitly supplied in sensitiveValues', () => {
      const text = `Publishable: ${fixtures.STRIPE_PK_TEST}, Placeholder: ${fixtures.PLACEHOLDER_KEY}`
      const redacted = redactSecretText(text)

      expect(redacted).toContain(fixtures.STRIPE_PK_TEST)
      expect(redacted).toContain(fixtures.PLACEHOLDER_KEY)

      const forcedRedacted = redactSecretText(text, [fixtures.STRIPE_PK_TEST])
      expect(forcedRedacted).not.toContain(fixtures.STRIPE_PK_TEST)
    })

    it('strips ASCII control characters in redacted output', () => {
      const dirty = `clean\u0000text\u0008here`
      const redacted = redactSecretText(dirty)
      expect(redacted).toBe('cleantexthere')
    })

    it('masks uncertain tokens conservatively to prevent leaks', () => {
      const uncertainJwt = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoxMjN9.dummySig1234567890'
      const text = `token is ${uncertainJwt}`
      const redacted = redactSecretText(text)
      expect(redacted).not.toContain(uncertainJwt)
      expect(redacted).toContain('[redacted]')
    })

    it('handles adversarial prefix and boundary masking safely without leaking fragments', () => {
      const prefix = 'A'.repeat(110)
      const token = fixtures.GITHUB_PAT
      const full = `${prefix}${token}`
      const redacted = redactSecretText(full)
      expect(redacted).not.toContain(token)
      expect(redacted.slice(0, 110)).toBe(prefix)
      expect(redacted).toContain('[redacted]')
    })
  })

  // 5. Context, Clean .env, and Deterministic Findings Guarantees
  describe('Deterministic security analysis guarantees', () => {
    it('flags real-shaped secrets in .env.example while skipping harmless placeholder samples', () => {
      const privatePattern = fixtures.GITHUB_PAT
      const ctx = createMockCtx({
        files: [
          {
            path: '.env.example',
            size: 200,
            truncated: false,
            content: `GITHUB_TOKEN=${privatePattern}\nSTRIPE_KEY=YOUR_KEY_HERE\n`,
          },
        ],
      })

      const findings = checkSecurity(ctx)
      const secretFinding = findings.find((f) => f.filePath === '.env.example')

      expect(secretFinding).toBeDefined()
      expect(secretFinding?.severity).toBe('high')
      expect(secretFinding?.evidence[0]).not.toContain(privatePattern)
      expect(secretFinding?.evidence[0]).toContain('[redacted]')

      // Ensure YOUR_KEY_HERE did not create a finding
      const placeholderFinding = findings.find((f) => f.evidence[0].includes('YOUR_KEY_HERE'))
      expect(placeholderFinding).toBeUndefined()
    })

    it('qualifies clean tracked .env as observation (medium severity) and dirty .env as high severity', () => {
      const cleanCtx = createMockCtx({
        tree: [{ path: '.env', type: 'file', size: 100 }],
        files: [
          {
            path: '.env',
            size: 100,
            truncated: false,
            content: 'PORT=3000\nNODE_ENV=development\n',
          },
        ],
      })
      const cleanFindings = checkSecurity(cleanCtx)
      const cleanFinding = cleanFindings.find((f) => f.id === 'sec-committed-env-file')
      expect(cleanFinding).toBeDefined()
      expect(cleanFinding?.severity).toBe('medium')
      expect(cleanFinding?.recommendation).toContain('owner control')

      const dirtyCtx = createMockCtx({
        tree: [{ path: '.env', type: 'file', size: 100 }],
        files: [
          {
            path: '.env',
            size: 100,
            truncated: false,
            content: `STRIPE_SECRET_KEY=${fixtures.STRIPE_SK_LIVE}\n`,
          },
        ],
      })
      const dirtyFindings = checkSecurity(dirtyCtx)
      const dirtyFinding = dirtyFindings.find((f) => f.id === 'sec-committed-env-file')
      expect(dirtyFinding).toBeDefined()
      expect(dirtyFinding?.severity).toBe('high')
    })

    it('does NOT create private findings for publishable keys or certificates', () => {
      const ctx = createMockCtx({
        files: [
          {
            path: 'src/stripe.ts',
            size: 300,
            truncated: false,
            content: `const pk = "${fixtures.STRIPE_PK_LIVE}"\nconst cert = "${fixtures.PEM_CERTIFICATE}"\nconst anon = "${fixtures.SUPABASE_ANON_JWT}"\n`,
          },
        ],
      })

      const findings = checkSecurity(ctx)
      const secretFindings = findings.filter((f) => f.id.includes('hardcoded-secret'))
      expect(secretFindings).toHaveLength(0)
    })

    it('never leaks raw matched secrets in any finding property or JSON serialization', () => {
      const secret = fixtures.GITHUB_PAT
      const ctx = createMockCtx({
        files: [
          {
            path: 'src/leak.ts',
            size: 200,
            truncated: false,
            content: `const myToken = "${secret}"\n`,
          },
        ],
        sensitiveValues: [secret],
      })

      const findings = checkSecurity(ctx)
      expect(findings.length).toBeGreaterThan(0)

      const serialized = JSON.stringify(findings)
      expect(serialized).not.toContain(secret)
      for (const finding of findings) {
        expect(finding.id).not.toContain(secret)
        expect(finding.title).not.toContain(secret)
        expect(finding.description).not.toContain(secret)
        expect(finding.evidence[0]).not.toContain(secret)
        expect(finding.evidence[0]).toContain('[redacted]')
      }
    })
  })

  describe('SPEC Review 9 Accepted Issues & Controller Extras', () => {
    // Finding 1: Per-file .env credential binding
    it('binds .env credential claims strictly per-file without falsely claiming clean .env contains secrets', () => {
      const ctx = createMockCtx({
        tree: [
          { path: '.env', type: 'file', size: 100 },
          { path: '.env.local', type: 'file', size: 200 },
        ],
        files: [
          {
            path: '.env',
            size: 100,
            truncated: false,
            content: 'PORT=3000\nNODE_ENV=production\n',
          },
          {
            path: '.env.local',
            size: 200,
            truncated: false,
            content: `GITHUB_TOKEN=${fixtures.GITHUB_PAT}\n`,
          },
        ],
      })

      const findings = checkSecurity(ctx)
      const cleanEnvFinding = findings.find((f) => f.filePath === '.env' && f.id.startsWith('sec-committed-env-file'))
      const dirtyEnvFinding = findings.find((f) => f.filePath === '.env.local' && f.id.startsWith('sec-committed-env-file'))

      expect(cleanEnvFinding).toBeDefined()
      expect(cleanEnvFinding?.severity).toBe('medium')
      expect(cleanEnvFinding?.description).not.toContain('containing plaintext credentials')

      expect(dirtyEnvFinding).toBeDefined()
      expect(dirtyEnvFinding?.severity).toBe('high')
      expect(dirtyEnvFinding?.description).toContain('containing plaintext credentials')
    })

    // Finding 2: Low diversity strings (<=2 chars) -> uncertain and masked, not placeholder
    it('classifies low-diversity strings as uncertain and masks them, exempting only explicit dummy templates', () => {
      const lowDiversity = fixtures.LOW_DIVERSITY_GITHUB
      const candidates = detectSecrets(`token = "${lowDiversity}"`, 'src/auth.ts')
      const target = candidates.find((c) => c.value === lowDiversity)

      expect(target).toBeDefined()
      expect(target?.classification).toBe('uncertain')

      const redacted = redactSecretText(`token = "${lowDiversity}"`)
      expect(redacted).not.toContain(lowDiversity)
      expect(redacted).toContain('[redacted]')

      // Explicit dummy examples remain placeholder
      expect(classifySecret(fixtures.PLACEHOLDER_KEY, 'API_KEY = ...', 'generic-credential-assignment')).toBe('placeholder')
    })

    // Finding 3: Contextual Supabase JWT role validation requires scoped config identifier
    it('requires scoped Supabase config context for JWT role validation and masks generic/unauthenticated JWTs', () => {
      // 1. Genuine scoped config with valid Supabase issuer -> publishable
      const scopedAnon = `SUPABASE_ANON_KEY="${fixtures.SUPABASE_ANON_JWT}"`
      const scopedCandidates = detectSecrets(scopedAnon, '.env')
      expect(scopedCandidates.find((c) => c.value === fixtures.SUPABASE_ANON_JWT)?.classification).toBe('publishable')
      expect(redactSecretText(scopedAnon)).toContain(fixtures.SUPABASE_ANON_JWT)

      // 2. Fake nearby comment or generic unauthenticated JWT -> uncertain and masked
      const fakeComment = `// supabase database configuration\nconst token = "${fixtures.UNAUTHENTICATED_ANON_JWT}"`
      const fakeCandidates = detectSecrets(fakeComment, 'src/api.ts')
      const fakeTarget = fakeCandidates.find((c) => c.value === fixtures.UNAUTHENTICATED_ANON_JWT)
      expect(fakeTarget?.classification).toBe('uncertain')
      expect(redactSecretText(fakeComment)).not.toContain(fixtures.UNAUTHENTICATED_ANON_JWT)

      // 3. Unauthenticated service role outside scoped config -> uncertain and masked
      const unauthService = `const sKey = "${fixtures.UNAUTHENTICATED_SERVICE_ROLE_JWT}"`
      const unauthCandidates = detectSecrets(unauthService, 'src/server.ts')
      expect(unauthCandidates.find((c) => c.value === fixtures.UNAUTHENTICATED_SERVICE_ROLE_JWT)?.classification).toBe('uncertain')
      expect(redactSecretText(unauthService)).not.toContain(fixtures.UNAUTHENTICATED_SERVICE_ROLE_JWT)

      // 4. Explicit sb_publishable prefix format -> publishable
      const pubCandidates = detectSecrets(`key = "${fixtures.SUPABASE_PUBLISHABLE}"`, 'src/supabase.ts')
      expect(pubCandidates.find((c) => c.value === fixtures.SUPABASE_PUBLISHABLE)?.classification).toBe('publishable')
    })

    // Finding 4: AWS identifier alone is qualified observation (low/medium), paired secret is high
    it('treats AWS key ID alone as qualified observation without claiming active compromise; paired secret is high', () => {
      // 1. ID alone in .env
      const idOnlyCtx = createMockCtx({
        tree: [{ path: '.env', type: 'file', size: 100 }],
        files: [
          {
            path: '.env',
            size: 100,
            truncated: false,
            content: `AWS_ACCESS_KEY_ID=${fixtures.AWS_ACCESS_KEY_ID}\n`,
          },
        ],
      })
      const idOnlyFindings = checkSecurity(idOnlyCtx)
      const envFinding = idOnlyFindings.find((f) => f.filePath === '.env' && f.id.startsWith('sec-committed-env-file'))
      expect(envFinding?.severity).toBe('medium')
      expect(envFinding?.description).not.toContain('containing plaintext credentials')

      const secretFinding = idOnlyFindings.find((f) => f.id.includes('aws-access-key-id') || f.id.includes('hardcoded-secret'))
      expect(secretFinding).toBeDefined()
      expect(secretFinding?.severity).toBe('medium')
      expect(secretFinding?.description).toContain('recognized credential format observed; validity not tested')
      expect(secretFinding?.recommendation).not.toContain('compromised')

      // 2. ID + Secret pair
      const pairedCtx = createMockCtx({
        tree: [{ path: '.env', type: 'file', size: 200 }],
        files: [
          {
            path: '.env',
            size: 200,
            truncated: false,
            content: `AWS_ACCESS_KEY_ID=${fixtures.AWS_ACCESS_KEY_ID}\nAWS_SECRET_ACCESS_KEY=${fixtures.AWS_SECRET_ACCESS_KEY}\n`,
          },
        ],
      })
      const pairedFindings = checkSecurity(pairedCtx)
      const pairedEnvFinding = pairedFindings.find((f) => f.filePath === '.env' && f.id.startsWith('sec-committed-env-file'))
      expect(pairedEnvFinding?.severity).toBe('high')
      const pairedSecretFinding = pairedFindings.find((f) => f.id.includes('aws-secret-access-key') || (f.id.includes('hardcoded-secret') && f.severity === 'high'))
      expect(pairedSecretFinding).toBeDefined()
    })

    // Finding 5: Malformed URL percent encoding does not throw URIError, masks as uncertain
    it('safely handles malformed percent encoding in URLs without throwing URIError and masks credential', () => {
      const malformed = fixtures.MALFORMED_URL_CREDENTIAL
      expect(() => detectSecrets(malformed, '.env')).not.toThrow()
      const candidates = detectSecrets(malformed, '.env')
      const target = candidates.find((c) => c.ruleId === 'database-url-credentials')
      expect(target).toBeDefined()
      expect(target?.classification).toBe('uncertain')

      expect(() => redactSecretText(malformed)).not.toThrow()
      const redacted = redactSecretText(malformed)
      expect(redacted).not.toContain('p%ZZword')

      expect(() => redactUrl(malformed)).not.toThrow()
      expect(() => collectSensitiveValues([malformed])).not.toThrow()
    })

    // Finding 6: Overlap resolution preserves full union span for redaction
    it('preserves full union spans for redaction when signing secret encloses another token pattern', () => {
      const text = fixtures.OVERLAPPING_JWT_SIGNING
      const redacted = redactSecretText(text)
      expect(redacted).not.toContain('myprefix_')
      expect(redacted).not.toContain('_mysuffix')
      expect(redacted).not.toContain(fixtures.GITHUB_PAT)
      expect(redacted).toContain('[redacted]')
    })

    // Finding 7: Bedrock short-lived token captures full enclosing artifact including suffix
    it('captures full Bedrock short-lived token artifact including suffix and leaves no fragment exposed', () => {
      const token = fixtures.BEDROCK_SHORT_LIVED_WITH_SUFFIX
      const candidates = detectSecrets(`KEY=${token}`, 'src/bedrock.ts')
      const target = candidates.find((c) => c.ruleId === 'aws-bedrock-api-key-short-lived')
      expect(target).toBeDefined()
      expect(target?.value).toBe(token)

      const redacted = redactSecretText(`KEY=${token}`)
      expect(redacted).not.toContain('s1gN4tur3')
      expect(redacted).not.toContain('.eyJleHAiOjE3MDAwMDAwMDB9')
      expect(redacted).not.toContain('YmVkcm9jay5hbWF6b25hd3MuY29t')
    })

    it('captures and masks trailing dots in short-lived Bedrock artifacts', () => {
      const token = 'bedrock-api-key-YmVkcm9jay5hbWF6b25hd3MuY29t' + '.'.repeat(20)
      const content = `Bearer ${token}!`
      const target = detectSecrets(content).find((c) => c.ruleId === 'aws-bedrock-api-key-short-lived')

      expect(target?.value).toBe(token)
      expect(target?.start).toBe(7)
      expect(target?.end).toBe(7 + token.length)
      expect(redactSecretText(content)).toBe('[authorization redacted]')
    })

    it('safely detects and redacts short-lived Bedrock artifacts with 10000 trailing dots', () => {
      const rule = SECRET_RULES.find((r) => r.id === 'aws-bedrock-api-key-short-lived')
      expect(rule?.pattern.source).toBe(String.raw`\bbedrock-api-key-YmVkcm9jay5hbWF6b25hd3MuY29t[A-Za-z0-9_.~+-]*`)

      const token = 'bedrock-api-key-YmVkcm9jay5hbWF6b25hd3MuY29t' + '.'.repeat(10000)
      const content = `Bearer ${token}!`
      const target = detectSecrets(content).find((c) => c.ruleId === 'aws-bedrock-api-key-short-lived')

      expect(target?.value).toBe(token)
      expect(target?.start).toBe(7)
      expect(target?.end).toBe(7 + token.length)
      expect(redactSecretText(content)).toBe('[authorization redacted]')
    })

    // Finding 8: Generic credential assignment captures punctuation and escaped quotes
    it('captures punctuation and quotes in generic credential assignments without missing tokens', () => {
      const assignment = fixtures.GENERIC_SECRET_ASSIGNMENT
      const candidates = detectSecrets(assignment, 'src/config.py')
      const target = candidates.find((c) => c.ruleId === 'generic-credential-assignment')
      expect(target).toBeDefined()
      expect(target?.value).toBe('dK8#mP2$vL9*xQ5&zR1!tY7^wE3~sB0+')

      const redacted = redactSecretText(assignment)
      expect(redacted).not.toContain('dK8#mP2$vL9*xQ5&zR1!tY7^wE3~sB0+')

      // Escaped quotes in JSON / JS
      const escaped = 'password = "pass\\"word#1234567890"'
      const escCandidates = detectSecrets(escaped, 'src/config.ts')
      expect(escCandidates.length).toBeGreaterThan(0)

      // API_KEY name alone is uncertain (not private confirmed)
      const apiKeyOnly = 'API_KEY = "moderate-entropy-key-here-12345"'
      const apiKeyCandidates = detectSecrets(apiKeyOnly, 'src/config.ts')
      expect(apiKeyCandidates.find((c) => c.ruleId === 'generic-credential-assignment')?.classification).toBe('uncertain')
    })

    // Finding 9: Fallback in redactSecretText for bare short JWTs and opaque sk-
    it('restores broad fallbacks in redactSecretText for bare short JWTs and opaque sk- without masking publishable tokens', () => {
      const bareJwt = `auth = "${fixtures.BARE_SHORT_JWT}"`
      const redactedJwt = redactSecretText(bareJwt)
      expect(redactedJwt).not.toContain(fixtures.BARE_SHORT_JWT)

      const opaqueSk = `clientKey = "${fixtures.GENERIC_OPAQUE_SK}"`
      const redactedSk = redactSecretText(opaqueSk)
      expect(redactedSk).not.toContain(fixtures.GENERIC_OPAQUE_SK)

      // Publishable tokens remain unmasked
      const pubContent = `pk = "${fixtures.STRIPE_PK_LIVE}"\nsb = "${fixtures.SUPABASE_PUBLISHABLE}"`
      const redactedPub = redactSecretText(pubContent)
      expect(redactedPub).toContain(fixtures.STRIPE_PK_LIVE)
      expect(redactedPub).toContain(fixtures.SUPABASE_PUBLISHABLE)
    })

    // Controller Extras: Line ends, distinct same-line findings, stable IDs, qualified phrasing
    it('satisfies controller extras: candidate.lineEnd, distinct same-line findings, stable IDs, and qualified wording', () => {
      const multilinePem = `const k = \`${fixtures.PEM_PRIVATE_KEY}\``
      const multilineCtx = createMockCtx({
        files: [{ path: 'src/key.ts', size: 500, truncated: false, content: multilinePem }],
      })
      const pemFindings = checkSecurity(multilineCtx)
      const pemFinding = pemFindings.find((f) => f.filePath === 'src/key.ts')
      expect(pemFinding).toBeDefined()
      expect(pemFinding!.lineEnd!).toBeGreaterThan(pemFinding!.lineStart!)

      // Distinct findings on same line
      const sameLineContent = `const gh = "${fixtures.GITHUB_PAT}"; const sk = "${fixtures.STRIPE_SK_LIVE}";`
      const sameLineCtx = createMockCtx({
        files: [{ path: 'src/tokens.ts', size: 300, truncated: false, content: sameLineContent }],
      })
      const sameLineFindings = checkSecurity(sameLineCtx)
      expect(sameLineFindings.length).toBe(2)
      expect(sameLineFindings[0].id).not.toBe(sameLineFindings[1].id)
      expect(sameLineFindings[0].id).toContain('github-pat')
      expect(sameLineFindings[1].id).toContain('stripe-secret-key')

      // Qualified phrasing
      expect(sameLineFindings[0].description).toContain('recognized credential format observed; validity not tested')
    })

    // Blocker 1: Long path ID collision avoidance & preservation of rule+offset suffix
    it('bounds/hashes long file paths (>=80 chars) preserving rule and offset suffix in finding IDs <= 100 chars', () => {
      const longPath = 'src/components/deeply/nested/directory/structure/very/long/pathname/module/submodule/handlers/authentication.ts'
      expect(longPath.length).toBeGreaterThan(80)

      const line = `const gh = "${fixtures.GITHUB_PAT}"; const sk = "${fixtures.STRIPE_SK_LIVE}";`
      const ctx = createMockCtx({
        files: [{ path: longPath, size: 400, truncated: false, content: line }],
      })
      const findings = checkSecurity(ctx)
      expect(findings.length).toBe(2)

      const id0 = findings[0].id
      const id1 = findings[1].id
      expect(id0.length).toBeLessThanOrEqual(100)
      expect(id1.length).toBeLessThanOrEqual(100)
      expect(id0).not.toBe(id1)
      expect(id0).toContain('github-pat')
      expect(id1).toContain('stripe-secret-key')
      // Rule and offset suffix must be preserved
      expect(id0).toMatch(/github-pat-\d+-\d+$/)
      expect(id1).toMatch(/stripe-secret-key-\d+-\d+$/)

      // Paths with different punctuation produce distinct IDs
      const pathA = 'src/sub_dir/item-file.ts'
      const pathB = 'src/sub-dir/item_file.ts'
      const ctxA = createMockCtx({ files: [{ path: pathA, size: 200, truncated: false, content: line }] })
      const ctxB = createMockCtx({ files: [{ path: pathB, size: 200, truncated: false, content: line }] })
      const fA = checkSecurity(ctxA)[0]
      const fB = checkSecurity(ctxB)[0]
      expect(fA.id).not.toBe(fB.id)

      // Stable repeated run
      const fA_repeat = checkSecurity(ctxA)[0]
      expect(fA_repeat.id).toBe(fA.id)
    })

    // Blocker 2: Lexical binding of Supabase JWT exemption to actual assignment
    it('binds Supabase JWT role exemption strictly to candidate actual lexical assignment, not nearby context names', () => {
      // 1. Empty SUPABASE_ANON_KEY config followed by unrelated JWT claiming anon -> uncertain and masked
      const emptyNearby = `SUPABASE_ANON_KEY = ''\nconst unrelatedBearer = "${fixtures.SUPABASE_ANON_JWT}"`
      const emptyCandidates = detectSecrets(emptyNearby, 'src/api.ts')
      const targetUnrelated = emptyCandidates.find((c) => c.value === fixtures.SUPABASE_ANON_JWT)
      expect(targetUnrelated?.classification).toBe('uncertain')
      const redactedEmpty = redactSecretText(emptyNearby)
      expect(redactedEmpty).not.toContain(fixtures.SUPABASE_ANON_JWT)
      expect(redactedEmpty).toContain('[redacted]')

      // 2. Misleading comment followed by token -> uncertain and masked
      const commentNearby = `// SUPABASE_ANON_KEY configuration\nconst token = "${fixtures.SUPABASE_ANON_JWT}"`
      const commentCandidates = detectSecrets(commentNearby, 'src/api.ts')
      expect(commentCandidates.find((c) => c.value === fixtures.SUPABASE_ANON_JWT)?.classification).toBe('uncertain')
      expect(redactSecretText(commentNearby)).not.toContain(fixtures.SUPABASE_ANON_JWT)

      // 3. Genuine lexical assignment -> publishable
      const genuine = `export const SUPABASE_ANON_KEY = "${fixtures.SUPABASE_ANON_JWT}"`
      const genuineCandidates = detectSecrets(genuine, 'src/supabase.ts')
      expect(genuineCandidates.find((c) => c.value === fixtures.SUPABASE_ANON_JWT)?.classification).toBe('publishable')
      expect(redactSecretText(genuine)).toContain(fixtures.SUPABASE_ANON_JWT)

      // 4. Genuine service role lexical assignment -> recognized
      const genuineService = `const SUPABASE_SERVICE_ROLE_KEY = "${fixtures.SUPABASE_SERVICE_ROLE_JWT}"`
      const serviceCandidates = detectSecrets(genuineService, 'src/admin.ts')
      expect(serviceCandidates.find((c) => c.value === fixtures.SUPABASE_SERVICE_ROLE_JWT)?.classification).toBe('recognized')
    })

    // Blocker 3: Broad fallback masking for bare 24-char GitHub tokens and legacy Slack tokens
    it('restores broad conservative fallback masking for bare 24-char GitHub tokens and legacy Slack variants as uncertain', () => {
      const bareGh = `token: ${fixtures.GHP_24}`
      const barePat = `pat: ${fixtures.GITHUB_PAT_24}`
      const bareSlack = `slack: ${fixtures.SLACK_LEGACY_UNKNOWN}`

      // Redaction masks them
      expect(redactSecretText(bareGh)).not.toContain(fixtures.GHP_24)
      expect(redactSecretText(bareGh)).toContain('[redacted]')

      expect(redactSecretText(barePat)).not.toContain(fixtures.GITHUB_PAT_24)
      expect(redactSecretText(barePat)).toContain('[redacted]')

      expect(redactSecretText(bareSlack)).not.toContain(fixtures.SLACK_LEGACY_UNKNOWN)
      expect(redactSecretText(bareSlack)).toContain('[redacted]')

      // Detector classifies loose shapes as uncertain (NOT high severity recognized)
      const ghCandidates = detectSecrets(bareGh, 'src/config.ts')
      const targetGh = ghCandidates.find((c) => c.value === fixtures.GHP_24)
      if (targetGh) {
        expect(targetGh.classification).toBe('uncertain')
      }

      // Publishable tokens remain unmasked
      const pubContent = `pk = "${fixtures.STRIPE_PK_LIVE}"\nsb = "${fixtures.SUPABASE_PUBLISHABLE}"`
      const redactedPub = redactSecretText(pubContent)
      expect(redactedPub).toContain(fixtures.STRIPE_PK_LIVE)
      expect(redactedPub).toContain(fixtures.SUPABASE_PUBLISHABLE)
    })
  })
})
