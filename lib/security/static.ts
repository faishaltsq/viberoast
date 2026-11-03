import ts from 'typescript'
import type { AnalysisContext, AnalysisFinding } from '../analysis/types'
import type { StaticCoverage, StaticFileStatus } from '../types/report'
import { redactUrl } from './redact'

export const MAX_AST_DEPTH = 128
export const MAX_AST_NODES = 50_000
export const MAX_ALIAS_DEPTH = 64

interface AstPreflightResult {
  exceeded: boolean
  reason?: string
  depth: number
  nodeCount: number
}

function preflightAst(sourceFile: ts.SourceFile): AstPreflightResult {
  let maxDepth = 0
  let nodeCount = 0

  const stack: { node: ts.Node; depth: number }[] = [{ node: sourceFile, depth: 1 }]

  while (stack.length > 0) {
    const entry = stack.pop()!
    nodeCount++
    if (entry.depth > maxDepth) {
      maxDepth = entry.depth
    }

    if (entry.depth > MAX_AST_DEPTH) {
      return {
        exceeded: true,
        reason: `AST nesting depth exceeded safety limit (${MAX_AST_DEPTH})`,
        depth: maxDepth,
        nodeCount,
      }
    }

    if (nodeCount > MAX_AST_NODES) {
      return {
        exceeded: true,
        reason: `AST node count exceeded safety limit (${MAX_AST_NODES})`,
        depth: maxDepth,
        nodeCount,
      }
    }

    ts.forEachChild(entry.node, (child) => {
      stack.push({ node: child, depth: entry.depth + 1 })
    })
  }

  return { exceeded: false, depth: maxDepth, nodeCount }
}

function fnv1a32(str: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function buildFindingId(
  prefix: string,
  filePath: string,
  lineStart?: number,
  offset?: number
): string {
  const cleanPath = filePath.replace(/[^A-Za-z0-9]/g, '-')
  const pathHash = fnv1a32(filePath)
  const lineSuffix = lineStart !== undefined ? `-${lineStart}` : ''
  const offsetSuffix = offset !== undefined ? `-${offset}` : ''
  const suffix = `-${pathHash}${lineSuffix}${offsetSuffix}`
  const maxSlugLen = Math.max(0, 100 - prefix.length - suffix.length - 1)
  const slug = cleanPath.slice(0, maxSlugLen).replace(/-+$/, '')
  return slug ? `${prefix}-${slug}${suffix}` : `${prefix}${suffix}`
}

function getScriptKind(filePath: string): ts.ScriptKind {
  const ext = filePath.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'ts':
      return ts.ScriptKind.TS
    case 'tsx':
      return ts.ScriptKind.TSX
    case 'jsx':
      return ts.ScriptKind.JSX
    case 'js':
    case 'mjs':
    case 'cjs':
      return ts.ScriptKind.JS
    default:
      return ts.ScriptKind.Unknown
  }
}

function getSyntaxKindName(kind: ts.ScriptKind): string {
  switch (kind) {
    case ts.ScriptKind.TS:
      return 'ts'
    case ts.ScriptKind.TSX:
      return 'tsx'
    case ts.ScriptKind.JSX:
      return 'jsx'
    case ts.ScriptKind.JS:
      return 'js'
    default:
      return 'unknown'
  }
}

export interface StaticScanResult {
  findings: AnalysisFinding[]
  coverage: StaticCoverage
}

export function scanStaticSecurity(ctx: AnalysisContext): StaticScanResult {
  const findings: AnalysisFinding[] = []
  const { files } = ctx

  const fileStatuses: StaticFileStatus[] = []
  let filesParsed = 0
  let filesPartial = 0
  let filesUnsupported = 0

  for (const file of files) {
    const isWorkflow =
      file.path.startsWith('.github/workflows/') &&
      (file.path.endsWith('.yml') || file.path.endsWith('.yaml'))

    if (isWorkflow) {
      checkWorkflowFile(file, ctx, findings)
      fileStatuses.push({
        path: file.path,
        status: 'supported',
        syntaxKind: 'workflow-yaml',
        reason: 'Workflow structural line inspection (not AST)',
      })
      filesParsed++
      continue
    }

    const scriptKind = getScriptKind(file.path)
    if (scriptKind === ts.ScriptKind.Unknown) {
      fileStatuses.push({
        path: file.path,
        status: 'unsupported',
        reason: 'Unsupported file extension for TypeScript AST',
      })
      filesUnsupported++
      continue
    }

    let sourceFile: ts.SourceFile
    try {
      sourceFile = ts.createSourceFile(
        file.path,
        file.content,
        ts.ScriptTarget.Latest,
        true,
        scriptKind
      )
    } catch {
      fileStatuses.push({
        path: file.path,
        status: 'partial',
        syntaxKind: getSyntaxKindName(scriptKind),
        reason: 'Parser threw exception on source text',
      })
      filesPartial++
      continue
    }

    const preflight = preflightAst(sourceFile)
    if (preflight.exceeded) {
      fileStatuses.push({
        path: file.path,
        status: 'partial',
        syntaxKind: getSyntaxKindName(scriptKind),
        reason: preflight.reason ?? 'AST limit exceeded',
      })
      filesPartial++
      continue
    }

    const parseDiagnostics = (sourceFile as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics ?? []
    if (parseDiagnostics.length > 0) {
      fileStatuses.push({
        path: file.path,
        status: 'partial',
        syntaxKind: getSyntaxKindName(scriptKind),
        parseDiagnosticsCount: parseDiagnostics.length,
        reason: 'Syntax errors encountered during parsing; analysis may be partial',
      })
      filesPartial++
    } else {
      fileStatuses.push({
        path: file.path,
        status: 'parsed',
        syntaxKind: getSyntaxKindName(scriptKind),
      })
      filesParsed++
    }

    const findingIndexBefore = findings.length
    try {
      checkAstFile(sourceFile, file, ctx, findings)
    } catch {
      findings.splice(findingIndexBefore)
      const currentStatus = fileStatuses[fileStatuses.length - 1]
      if (currentStatus) {
        if (currentStatus.status === 'parsed') {
          filesParsed--
          filesPartial++
        }
        currentStatus.status = 'partial'
        currentStatus.reason = 'AST analysis exceeded execution limit'
      }
    }
  }

  const scopeWarnings: string[] = []
  if (filesPartial > 0) {
    scopeWarnings.push(
      `${filesPartial} file(s) had syntax errors or exceeded execution limits and were only partially analyzed.`
    )
  }
  if (filesUnsupported > 0) {
    scopeWarnings.push(`${filesUnsupported} file(s) have unsupported extensions for AST analysis.`)
  }

  const coverage: StaticCoverage = {
    filesAttempted: files.length,
    filesParsed,
    filesPartial,
    filesUnsupported,
    fileStatuses,
    ...(scopeWarnings.length > 0 ? { scopeWarnings } : {}),
  }

  return { findings, coverage }
}

export function analyzeStaticSecurity(ctx: AnalysisContext): AnalysisFinding[] {
  return scanStaticSecurity(ctx).findings
}

function checkWorkflowFile(
  file: { path: string; content: string; truncated?: boolean },
  ctx: AnalysisContext,
  findings: AnalysisFinding[]
): void {
  const lines = file.content.split('\n')
  const { owner, repo, sha, sensitiveValues } = ctx

  let inRunBlock = false

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx]
    const trimmed = line.trim()
    const lineNum = idx + 1

    if (trimmed.startsWith('#')) continue

    // Track multi-line run: blocks vs env: blocks
    if (/^\s*(?:-\s*)?run:\s*(\|.*|>.*)?$/.test(line) || /^\s*(?:-\s*)?run:\s+.+$/.test(line)) {
      inRunBlock = true
    } else if (/^\s*(?:-\s*)?(steps|name|uses|with|env|id|if):/.test(line)) {
      inRunBlock = false
    }

    // Rule: ci.broad-permissions
    if (/^\s*permissions:\s*write-all\b/i.test(trimmed)) {
      findings.push({
        id: buildFindingId('sec-ci-broad-permissions', file.path, lineNum),
        category: 'Security',
        title: `GitHub Actions workflow with broad write permissions in ${file.path}:${lineNum}`,
        description:
          'Workflow specifies broad write-all permissions. This violates the principle of least privilege.',
        severity: 'medium',
        confidence: 'high',
        evidence: [
          file.truncated
            ? '[source evidence omitted: file content truncated]'
            : `Workflow grants write-all permissions at line ${lineNum}.`,
        ],
        location: `${file.path}:${lineNum}`,
        recommendation:
          'Adopt the principle of least privilege by specifying granular read-only permissions where possible.',
        source: 'repository',
        verification: 'heuristic',
        filePath: file.path,
        lineStart: lineNum,
        lineEnd: lineNum,
        githubPermaUrl: redactUrl(
          `https://github.com/${owner}/${repo}/blob/${sha}/${file.path}#L${lineNum}`,
          sensitiveValues
        ),
        security: {
          category: 'Security',
          ruleId: 'ci.broad-permissions',
          ruleVersion: '1.0.0',
          commitSha: sha,
          filePath: file.path,
          lineStart: lineNum,
          lineEnd: lineNum,
          observation: 'GitHub Actions workflow specifies broad permissions (permissions: write-all).',
          possibleImpact:
            'Compromised actions or build steps gain write access to repository contents, packages, and releases.',
          coverageLimitations:
            'YAML structural line inspection; GitHub organization-level default workflow permissions not evaluated.',
        },
      })
    }

    // Rule: ci.untrusted-event-interpolation
    const hasUntrustedInterpolation =
      /\$\{\{\s*github\.event\.(?:issue|pull_request|comment|head_commit|review|discussion)\.(?:title|body|message)\b/i.test(
        line
      ) || /\$\{\{\s*github\.head_ref\b/i.test(line)

    const isInlineRun = /^\s*(?:-\s*)?run:\s*.*?\$\{\{/i.test(line)
    const isInsideRun = inRunBlock && hasUntrustedInterpolation && !/^\s*(?:-\s*)?env:/i.test(line)

    if (hasUntrustedInterpolation && (isInlineRun || isInsideRun)) {
      findings.push({
        id: buildFindingId('sec-ci-untrusted-event', file.path, lineNum),
        category: 'Security',
        title: `Untrusted GitHub event data interpolated in workflow run script in ${file.path}:${lineNum}`,
        description:
          'Untrusted GitHub event expressions are interpolated directly into a shell run script, risking command injection.',
        severity: 'high',
        confidence: 'high',
        evidence: [
          file.truncated
            ? '[source evidence omitted: file content truncated]'
            : `Untrusted GitHub event expression interpolated into shell execution at line ${lineNum}.`,
        ],
        location: `${file.path}:${lineNum}`,
        recommendation:
          'Pass GitHub event data to run steps via intermediate environment variables rather than inline expressions.',
        source: 'repository',
        verification: 'heuristic',
        filePath: file.path,
        lineStart: lineNum,
        lineEnd: lineNum,
        githubPermaUrl: redactUrl(
          `https://github.com/${owner}/${repo}/blob/${sha}/${file.path}#L${lineNum}`,
          sensitiveValues
        ),
        security: {
          category: 'Security',
          ruleId: 'ci.untrusted-event-interpolation',
          ruleVersion: '1.0.0',
          commitSha: sha,
          filePath: file.path,
          lineStart: lineNum,
          lineEnd: lineNum,
          observation:
            'Workflow run command interpolates untrusted GitHub event expression directly into shell script instead of using environment variable indirection.',
          possibleImpact:
            'Command injection in CI runner via specially crafted issue, PR, or commit titles.',
          coverageLimitations:
            'Textual line inspection of workflow files; third-party composite actions not inspected.',
        },
      })
    }
  }
}

function checkAstFile(
  sourceFile: ts.SourceFile,
  file: { path: string; content: string; truncated?: boolean },
  ctx: AnalysisContext,
  findings: AnalysisFinding[]
): void {
  const { owner, repo, sha, sensitiveValues } = ctx

  // 1. Check if file has 'use client' directive
  let isUseClient = false
  for (const stmt of sourceFile.statements) {
    if (ts.isExpressionStatement(stmt) && ts.isStringLiteral(stmt.expression)) {
      if (stmt.expression.text === 'use client') {
        isUseClient = true
        break
      }
    }
  }

  // Gather imports and require receivers
  const childProcessExecAliases = new Set<string>()
  const childProcessModules = new Set<string>()
  const dbReceivers = new Set<string>()
  let hasDbImport = false

  for (const stmt of sourceFile.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const mod = stmt.moduleSpecifier.text
      if (mod === 'child_process' || mod === 'node:child_process') {
        if (stmt.importClause?.name) {
          childProcessModules.add(stmt.importClause.name.text)
        }
        const namedBindings = stmt.importClause?.namedBindings
        if (namedBindings) {
          if (ts.isNamespaceImport(namedBindings)) {
            childProcessModules.add(namedBindings.name.text)
          } else if (ts.isNamedImports(namedBindings)) {
            for (const el of namedBindings.elements) {
              const orig = el.propertyName?.text ?? el.name.text
              if (orig === 'exec' || orig === 'execSync') {
                childProcessExecAliases.add(el.name.text)
              }
            }
          }
        }
      }
      if (
        /(?:^|\/)(?:pg|mysql|mysql2|@prisma\/client|sqlite3|better-sqlite3)$/i.test(mod) ||
        /(?:^|\/|\b)(?:db|database|prisma|postgres)\b/i.test(mod)
      ) {
        hasDbImport = true
        if (stmt.importClause?.name) {
          dbReceivers.add(stmt.importClause.name.text)
        }
        const namedBindings = stmt.importClause?.namedBindings
        if (namedBindings) {
          if (ts.isNamespaceImport(namedBindings)) {
            dbReceivers.add(namedBindings.name.text)
          } else if (ts.isNamedImports(namedBindings)) {
            for (const el of namedBindings.elements) {
              dbReceivers.add(el.name.text)
            }
          }
        }
      }
    }
  }

  function preScan(node: ts.Node) {
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.initializer) {
          if (
            ts.isCallExpression(decl.initializer) &&
            ts.isIdentifier(decl.initializer.expression) &&
            decl.initializer.expression.text === 'require' &&
            decl.initializer.arguments.length > 0 &&
            ts.isStringLiteral(decl.initializer.arguments[0])
          ) {
            const reqMod = decl.initializer.arguments[0].text
            if (reqMod === 'child_process' || reqMod === 'node:child_process') {
              childProcessModules.add(decl.name.text)
            }
            if (
              /(?:^|\/)(?:pg|mysql|mysql2|@prisma\/client|sqlite3|better-sqlite3)$/i.test(reqMod) ||
              /(?:^|\/|\b)(?:db|database|prisma|postgres)\b/i.test(reqMod)
            ) {
              hasDbImport = true
              dbReceivers.add(decl.name.text)
            }
          }
        } else if (ts.isObjectBindingPattern(decl.name) && decl.initializer) {
          if (
            ts.isCallExpression(decl.initializer) &&
            ts.isIdentifier(decl.initializer.expression) &&
            decl.initializer.expression.text === 'require' &&
            decl.initializer.arguments.length > 0 &&
            ts.isStringLiteral(decl.initializer.arguments[0])
          ) {
            const reqMod = decl.initializer.arguments[0].text
            if (reqMod === 'child_process' || reqMod === 'node:child_process') {
              for (const el of decl.name.elements) {
                if (ts.isIdentifier(el.name)) {
                  const orig =
                    el.propertyName && ts.isIdentifier(el.propertyName)
                      ? el.propertyName.text
                      : el.name.text
                  if (orig === 'exec' || orig === 'execSync') {
                    childProcessExecAliases.add(el.name.text)
                  }
                }
              }
            }
          }
        }
      }
    }
    ts.forEachChild(node, preScan)
  }
  preScan(sourceFile)

  function bindsName(pattern: ts.Node, name: string): boolean {
    if (ts.isIdentifier(pattern)) {
      return pattern.text === name
    }
    if (ts.isObjectBindingPattern(pattern) || ts.isArrayBindingPattern(pattern)) {
      for (const el of pattern.elements) {
        if (ts.isBindingElement(el)) {
          if (bindsName(el.name, name)) {
            return true
          }
        }
      }
    }
    return false
  }

  function resolveBinding(
    ident: ts.Identifier,
    visited = new Set<ts.Node>(),
    aliasDepth = 0
  ): { kind: 'const-literal' | 'const-object' | 'dynamic' | 'unknown'; node?: ts.Node } {
    if (aliasDepth > MAX_ALIAS_DEPTH) return { kind: 'unknown' }
    if (visited.has(ident)) return { kind: 'unknown' }
    visited.add(ident)

    let curr: ts.Node | undefined = ident.parent

    while (curr) {
      if (
        ts.isFunctionDeclaration(curr) ||
        ts.isFunctionExpression(curr) ||
        ts.isArrowFunction(curr) ||
        ts.isMethodDeclaration(curr) ||
        ts.isConstructorDeclaration(curr)
      ) {
        for (const param of curr.parameters) {
          if (bindsName(param.name, ident.text)) {
            return { kind: 'dynamic' }
          }
        }
      }

      if (ts.isCatchClause(curr)) {
        if (curr.variableDeclaration && bindsName(curr.variableDeclaration.name, ident.text)) {
          return { kind: 'dynamic' }
        }
      }

      if (
        ts.isBlock(curr) ||
        ts.isSourceFile(curr) ||
        ts.isModuleBlock(curr) ||
        ts.isCaseClause(curr) ||
        ts.isDefaultClause(curr)
      ) {
        const statements: readonly ts.Statement[] =
          (curr as unknown as { statements?: ts.Statement[] }).statements ?? []
        for (const stmt of statements) {
          if (ts.isVariableStatement(stmt)) {
            const isConst = (stmt.declarationList.flags & ts.NodeFlags.Const) !== 0
            for (const decl of stmt.declarationList.declarations) {
              if (ts.isIdentifier(decl.name) && decl.name.text === ident.text) {
                if (isConst && decl.initializer) {
                  if (isConstantValue(decl.initializer, visited, aliasDepth + 1)) {
                    return { kind: 'const-literal', node: decl.initializer }
                  }
                  if (ts.isObjectLiteralExpression(decl.initializer)) {
                    return { kind: 'const-object', node: decl.initializer }
                  }
                }
                return { kind: 'dynamic', node: decl.initializer }
              } else if (bindsName(decl.name, ident.text)) {
                return { kind: 'dynamic', node: decl.initializer }
              }
            }
          }
        }
      }

      if (
        (ts.isForStatement(curr) || ts.isForInStatement(curr) || ts.isForOfStatement(curr)) &&
        curr.initializer &&
        ts.isVariableDeclarationList(curr.initializer)
      ) {
        for (const decl of curr.initializer.declarations) {
          if (bindsName(decl.name, ident.text)) {
            return { kind: 'dynamic', node: decl.initializer }
          }
        }
      }

      curr = curr.parent
    }

    return { kind: 'unknown' }
  }

  function isConstantValue(
    expr: ts.Node,
    visited = new Set<ts.Node>(),
    aliasDepth = 0
  ): boolean {
    if (aliasDepth > MAX_ALIAS_DEPTH) return false
    if (
      ts.isStringLiteral(expr) ||
      ts.isNumericLiteral(expr) ||
      ts.isNoSubstitutionTemplateLiteral(expr)
    ) {
      return true
    }
    if (ts.isIdentifier(expr)) {
      const binding = resolveBinding(expr, visited, aliasDepth + 1)
      return binding.kind === 'const-literal'
    }
    if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      return (
        isConstantValue(expr.left, visited, aliasDepth + 1) &&
        isConstantValue(expr.right, visited, aliasDepth + 1)
      )
    }
    return false
  }

  // 2. Sensitive Route Check (Next.js / API routes)
  const isSensitiveRoute =
    /(?:^|\/)(?:app|pages)\/api\/(?:admin|internal|manage|billing|payments?|users?)\b/i.test(
      file.path
    ) || /(?:^|\/)(?:admin|internal|manage|billing|payments?|users?)\/route\.[a-z]+$/i.test(file.path)

  if (isSensitiveRoute) {
    function inspectHandlerBody(body: ts.Node): boolean {
      let hasGuard = false
      function checkNode(n: ts.Node) {
        if (hasGuard) return

        if (ts.isCallExpression(n)) {
          const callText = n.expression.getText(sourceFile)
          if (
            /^(auth|getSession|getServerSession|requireAuth|requireUser|requireAdmin|currentUser|checkAuth|verifyToken|checkAdminAuth|verifySession|validateSession|clerkClient)$/i.test(
              callText
            ) ||
            /\b(?:auth|session|supabase\.auth)\b/i.test(callText)
          ) {
            hasGuard = true
            return
          }
          if (ts.isIdentifier(n.expression) && /^(unauthorized|forbidden)$/i.test(n.expression.text)) {
            hasGuard = true
            return
          }
        }

        if (ts.isPropertyAssignment(n) && ts.isIdentifier(n.name) && n.name.text === 'status') {
          if (ts.isNumericLiteral(n.initializer) && (n.initializer.text === '401' || n.initializer.text === '403')) {
            hasGuard = true
            return
          }
        }

        ts.forEachChild(n, checkNode)
      }
      checkNode(body)
      return hasGuard
    }

    function checkHandler(methodName: string, lineStart: number, offset: number, body?: ts.Node) {
      const hasAuth = body ? inspectHandlerBody(body) : false
      if (!hasAuth) {
        findings.push({
          id: buildFindingId(`sec-route-missing-auth-${methodName.toLowerCase()}`, file.path, lineStart, offset),
          category: 'Security',
          title: `Sensitive route handler ${methodName} missing apparent authorization in ${file.path}:${lineStart}`,
          description:
            `Route handler ${methodName} on sensitive path has no apparent authorization check or session validation.`,
          severity: 'medium',
          confidence: 'medium',
          evidence: [
            file.truncated
              ? '[source evidence omitted: file content truncated]'
              : `Sensitive route handler ${methodName} has no apparent session or authorization check at line ${lineStart}.`,
          ],
          location: `${file.path}:${lineStart}`,
          recommendation:
            'Implement authentication and role-based access checks at the route entry point.',
          source: 'repository',
          verification: 'heuristic',
          filePath: file.path,
          lineStart,
          lineEnd: lineStart,
          githubPermaUrl: redactUrl(
            `https://github.com/${owner}/${repo}/blob/${sha}/${file.path}#L${lineStart}`,
            sensitiveValues
          ),
          security: {
            category: 'Security',
            ruleId: 'route.missing-auth',
            ruleVersion: '1.0.0',
            commitSha: sha,
            filePath: file.path,
            lineStart,
            lineEnd: lineStart,
            observation:
              `Route handler ${methodName} on sensitive path has no apparent authorization check or session validation.`,
            possibleImpact:
              'Unauthenticated or unauthorized access to sensitive endpoints or administrative actions.',
            coverageLimitations:
              'Heuristic check based on known auth patterns; custom middleware, external gateways, or custom auth helpers may provide authorization.',
          },
        })
      }
    }

    for (const stmt of sourceFile.statements) {
      if (
        ts.isFunctionDeclaration(stmt) &&
        stmt.name &&
        /^(GET|POST|PUT|DELETE|PATCH)$/i.test(stmt.name.text) &&
        stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        const methodName = stmt.name.text.toUpperCase()
        const start = sourceFile.getLineAndCharacterOfPosition(stmt.getStart(sourceFile))
        const lineStart = start.line + 1
        const offset = stmt.getStart(sourceFile)
        checkHandler(methodName, lineStart, offset, stmt.body)
      }

      if (
        ts.isVariableStatement(stmt) &&
        stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        for (const decl of stmt.declarationList.declarations) {
          if (
            ts.isIdentifier(decl.name) &&
            /^(GET|POST|PUT|DELETE|PATCH)$/i.test(decl.name.text)
          ) {
            const methodName = decl.name.text.toUpperCase()
            const start = sourceFile.getLineAndCharacterOfPosition(decl.getStart(sourceFile))
            const lineStart = start.line + 1
            const offset = decl.getStart(sourceFile)
            let body: ts.Node | undefined
            if (decl.initializer) {
              if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
                body = decl.initializer.body
              }
            }
            checkHandler(methodName, lineStart, offset, body)
          }
        }
      }
    }
  }

  // 3. Recursive AST traversal for calls, assignments, and expressions
  let currentScope: ts.Node = sourceFile

  function checkScopeCorsHeaders(scopeNode: ts.Node) {
    interface CorsReceiverState {
      hasCredentialsHeader: boolean
      isReflectedOrigin: boolean
      isWildcardOrigin: boolean
      corsLineStart: number
      corsOffset: number
    }
    const receivers = new Map<string, CorsReceiverState>()

    function getReceiver(key: string): CorsReceiverState {
      let state = receivers.get(key)
      if (!state) {
        state = {
          hasCredentialsHeader: false,
          isReflectedOrigin: false,
          isWildcardOrigin: false,
          corsLineStart: 1,
          corsOffset: 0,
        }
        receivers.set(key, state)
      }
      return state
    }

    function scanNode(n: ts.Node) {
      if (
        n !== scopeNode &&
        (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n))
      ) {
        return
      }

      if (ts.isCallExpression(n)) {
        let headerName = ''
        let headerVal: ts.Node | undefined

        if (
          ts.isPropertyAccessExpression(n.expression) &&
          (n.expression.name.text === 'setHeader' ||
            n.expression.name.text === 'set' ||
            n.expression.name.text === 'header') &&
          n.arguments.length >= 2
        ) {
          const receiverKey = n.expression.expression.getText(sourceFile).trim()
          const state = getReceiver(receiverKey)

          if (ts.isStringLiteral(n.arguments[0])) {
            headerName = n.arguments[0].text.toLowerCase()
            headerVal = n.arguments[1]
          }

          if (headerName === 'access-control-allow-credentials') {
            if (
              (headerVal && ts.isStringLiteral(headerVal) && headerVal.text.toLowerCase() === 'true') ||
              (headerVal && headerVal.kind === ts.SyntaxKind.TrueKeyword)
            ) {
              state.hasCredentialsHeader = true
            }
          }

          if (headerName === 'access-control-allow-origin' && headerVal) {
            const start = sourceFile.getLineAndCharacterOfPosition(n.getStart(sourceFile))
            state.corsLineStart = start.line + 1
            state.corsOffset = n.getStart(sourceFile)
            if (ts.isStringLiteral(headerVal) && headerVal.text === '*') {
              state.isWildcardOrigin = true
            } else {
              const valText = headerVal.getText(sourceFile)
              if (
                /(?:req|request)\.headers(?:\.origin|\[['"]origin['"]\])|\.get\(['"]origin['"]\)/i.test(
                  valText
                )
              ) {
                state.isReflectedOrigin = true
              }
            }
          }
        }
      }

      ts.forEachChild(n, scanNode)
    }

    scanNode(scopeNode)

    for (const [, state] of receivers) {
      if (state.hasCredentialsHeader && (state.isReflectedOrigin || state.isWildcardOrigin)) {
        const isWildcard = state.isWildcardOrigin && !state.isReflectedOrigin
        findings.push({
          id: buildFindingId('sec-cors-wildcard', file.path, state.corsLineStart, state.corsOffset),
          category: 'Security',
          title: isWildcard
            ? `Insecure CORS wildcard with credentials header in ${file.path}:${state.corsLineStart}`
            : `Dynamic origin reflection with credentials in ${file.path}:${state.corsLineStart}`,
          description: isWildcard
            ? 'CORS response pairs wildcard origin ("*") with credentials enabled, which browsers reject.'
            : 'CORS response dynamically reflects request origin header paired with credentials enabled.',
          severity: isWildcard ? 'medium' : 'high',
          confidence: 'high',
          evidence: [
            file.truncated
              ? '[source evidence omitted: file content truncated]'
              : isWildcard
              ? `Wildcard CORS origin header paired with credentials enabled observed at line ${state.corsLineStart}.`
              : `Dynamically reflected CORS origin paired with credentials observed at line ${state.corsLineStart}.`,
          ],
          location: `${file.path}:${state.corsLineStart}`,
          recommendation:
            'Validate incoming origin against an explicit trusted allowlist before reflecting in Access-Control-Allow-Origin.',
          source: 'repository',
          verification: 'heuristic',
          filePath: file.path,
          lineStart: state.corsLineStart,
          lineEnd: state.corsLineStart,
          githubPermaUrl: redactUrl(
            `https://github.com/${owner}/${repo}/blob/${sha}/${file.path}#L${state.corsLineStart}`,
            sensitiveValues
          ),
          security: {
            category: 'Security',
            ruleId: 'cors.wildcard-credentials',
            ruleVersion: '1.0.0',
            commitSha: sha,
            filePath: file.path,
            lineStart: state.corsLineStart,
            lineEnd: state.corsLineStart,
            observation: isWildcard
              ? 'Setting Access-Control-Allow-Origin to "*" paired with credentials; browser rejection under CORS specifications.'
              : 'Dynamically reflected Origin header in Access-Control-Allow-Origin paired with credentials enabled.',
            possibleImpact: isWildcard
              ? 'Browser rejection of cross-origin response due to invalid CORS specification.'
              : 'Cross-origin data leakage and unauthorized authenticated cross-origin requests.',
            coverageLimitations:
              'Local AST analysis; upstream proxy or gateway CORS enforcement not evaluated.',
          },
        })
      }
    }
  }

  function visit(node: ts.Node) {
    const isNewScope =
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node)

    const prevScope = currentScope
    if (isNewScope) {
      currentScope = node
      checkScopeCorsHeaders(node)
    }

    const startLoc = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
    const endLoc = sourceFile.getLineAndCharacterOfPosition(node.getEnd())
    const lineStart = startLoc.line + 1
    const lineEnd = endLoc.line + 1
    const offset = node.getStart(sourceFile)

    // A. Dynamic Code Execution: eval(...) and new Function(...)
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === 'eval') {
        const arg = node.arguments[0]
        const isLiteral =
          arg &&
          (ts.isStringLiteral(arg) ||
            ts.isNumericLiteral(arg) ||
            ts.isNoSubstitutionTemplateLiteral(arg))

        const severity: 'high' | 'medium' = isLiteral ? 'medium' : 'high'
        const confidence: 'high' | 'medium' = isLiteral ? 'medium' : 'high'
        const obsDetail = isLiteral
          ? 'eval() with literal argument observed'
          : 'eval() with dynamic argument observed'

        findings.push({
          id: buildFindingId('sec-dynamic-eval', file.path, lineStart, offset),
          category: 'Security',
          title: `Dynamic code evaluation in ${file.path}:${lineStart}`,
          description:
            'Use of eval() executes dynamic code strings and introduces injection vulnerabilities.',
          severity,
          confidence,
          evidence: [
            file.truncated
              ? '[source evidence omitted: file content truncated]'
              : `Dynamic evaluation syntax observed at line ${lineStart}; source arguments withheld.`,
          ],
          location: `${file.path}:${lineStart}`,
          recommendation:
            'Refactor dynamic execution to use safe parsers or structured lookup dictionaries.',
          source: 'repository',
          verification: 'verified',
          filePath: file.path,
          lineStart,
          lineEnd,
          githubPermaUrl: redactUrl(
            `https://github.com/${owner}/${repo}/blob/${sha}/${file.path}#L${lineStart}`,
            sensitiveValues
          ),
          security: {
            category: 'Security',
            ruleId: 'js.dynamic-execution',
            ruleVersion: '1.0.0',
            commitSha: sha,
            filePath: file.path,
            lineStart,
            lineEnd,
            observation: `Dynamic code execution via ${obsDetail}.`,
            possibleImpact: isLiteral
              ? 'Unnecessary dynamic code evaluation; lower risk when argument is static literal.'
              : 'Arbitrary code execution or script injection if dynamic argument contains untrusted data.',
            coverageLimitations:
              'Local AST syntax check; static call graph or runtime execution path not evaluated.',
          },
        })
      }
    }

    if (ts.isNewExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === 'Function') {
        findings.push({
          id: buildFindingId('sec-dynamic-eval', file.path, lineStart, offset),
          category: 'Security',
          title: `Dynamic code evaluation via Function constructor in ${file.path}:${lineStart}`,
          description:
            'Use of new Function() compiles and executes dynamic code strings, introducing injection risks.',
          severity: 'high',
          confidence: 'high',
          evidence: [
            file.truncated
              ? '[source evidence omitted: file content truncated]'
              : `Dynamic evaluation syntax observed at line ${lineStart}; source arguments withheld.`,
          ],
          location: `${file.path}:${lineStart}`,
          recommendation:
            'Refactor dynamic execution to use safe parsers or structured lookup dictionaries.',
          source: 'repository',
          verification: 'verified',
          filePath: file.path,
          lineStart,
          lineEnd,
          githubPermaUrl: redactUrl(
            `https://github.com/${owner}/${repo}/blob/${sha}/${file.path}#L${lineStart}`,
            sensitiveValues
          ),
          security: {
            category: 'Security',
            ruleId: 'js.dynamic-execution',
            ruleVersion: '1.0.0',
            commitSha: sha,
            filePath: file.path,
            lineStart,
            lineEnd,
            observation: 'Dynamic code execution via new Function() constructor observed.',
            possibleImpact:
              'Arbitrary code execution or script injection if dynamic arguments derive from untrusted input.',
            coverageLimitations:
              'Local AST syntax check; static call graph or runtime execution path not evaluated.',
          },
        })
      }
    }

    // B. Command Execution: exec, execSync
    if (ts.isCallExpression(node)) {
      let isCommandSink = false
      if (ts.isIdentifier(node.expression)) {
        if (childProcessExecAliases.has(node.expression.text)) {
          isCommandSink = true
        }
      } else if (ts.isPropertyAccessExpression(node.expression)) {
        const methodName = node.expression.name.text
        if (methodName === 'exec' || methodName === 'execSync') {
          const receiver = node.expression.expression
          if (ts.isIdentifier(receiver) && childProcessModules.has(receiver.text)) {
            isCommandSink = true
          } else if (
            ts.isCallExpression(receiver) &&
            ts.isIdentifier(receiver.expression) &&
            receiver.expression.text === 'require' &&
            receiver.arguments.length > 0 &&
            ts.isStringLiteral(receiver.arguments[0]) &&
            (receiver.arguments[0].text === 'child_process' ||
              receiver.arguments[0].text === 'node:child_process')
          ) {
            isCommandSink = true
          }
        }
      }

      if (isCommandSink && node.arguments.length > 0) {
        const firstArg = node.arguments[0]
        if (!isConstantValue(firstArg)) {
          findings.push({
            id: buildFindingId('sec-cmd-unsafe-exec', file.path, lineStart, offset),
            category: 'Security',
            title: `Unsafe command execution in ${file.path}:${lineStart}`,
            description:
              'Command string constructed dynamically using string concatenation or template expression at execution sink.',
            severity: 'high',
            confidence: 'high',
            evidence: [
              file.truncated
                ? '[source evidence omitted: file content truncated]'
                : `Dynamic command string construction observed at line ${lineStart}; command arguments withheld.`,
            ],
            location: `${file.path}:${lineStart}`,
            recommendation:
              'Use execFile or spawn with argument arrays rather than shell string interpolation.',
            source: 'repository',
            verification: 'heuristic',
            filePath: file.path,
            lineStart,
            lineEnd,
            githubPermaUrl: redactUrl(
              `https://github.com/${owner}/${repo}/blob/${sha}/${file.path}#L${lineStart}`,
              sensitiveValues
            ),
            security: {
              category: 'Security',
              ruleId: 'cmd.unsafe-execution',
              ruleVersion: '1.0.0',
              commitSha: sha,
              filePath: file.path,
              lineStart,
              lineEnd,
              observation:
                'Command string constructed dynamically using string concatenation or template expression at shell execution sink.',
              possibleImpact:
                'Command injection if dynamic command elements include unescaped untrusted input.',
              coverageLimitations:
                'Local syntax tracking; input sanitization or parameter validation prior to execution not tracked.',
            },
          })
        }
      }
    }

    // C. SQL Injection Sink: db.query, client.query, pool.query, prisma.$queryRawUnsafe
    if (ts.isCallExpression(node)) {
      let isSqlSink = false
      if (ts.isPropertyAccessExpression(node.expression)) {
        const methodName = node.expression.name.text
        const receiver = node.expression.expression
        const receiverName = ts.isIdentifier(receiver) ? receiver.text : ''

        if (methodName === '$queryRawUnsafe') {
          isSqlSink = true
        } else if (methodName === 'query' || methodName === 'execute') {
          if (
            dbReceivers.has(receiverName) ||
            (hasDbImport && /^(prisma|db|pool|client|connection|knex)$/i.test(receiverName))
          ) {
            isSqlSink = true
          }
        }
      }

      if (isSqlSink && node.arguments.length > 0) {
        const firstArg = node.arguments[0]

        if (!isConstantValue(firstArg)) {
          let targetObj: ts.ObjectLiteralExpression | undefined
          if (ts.isObjectLiteralExpression(firstArg)) {
            targetObj = firstArg
          } else if (ts.isIdentifier(firstArg)) {
            const binding = resolveBinding(firstArg)
            if (
              binding.kind === 'const-object' &&
              binding.node &&
              ts.isObjectLiteralExpression(binding.node)
            ) {
              targetObj = binding.node
            }
          }

          let isDynamicSql = false

          if (targetObj) {
            for (const prop of targetObj.properties) {
              if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
                if (prop.name.text === 'text' || prop.name.text === 'sql') {
                  if (
                    ts.isTemplateExpression(prop.initializer) ||
                    (ts.isBinaryExpression(prop.initializer) &&
                      prop.initializer.operatorToken.kind === ts.SyntaxKind.PlusToken)
                  ) {
                    isDynamicSql = true
                  }
                }
              }
            }
          } else {
            if (
              ts.isTemplateExpression(firstArg) ||
              (ts.isBinaryExpression(firstArg) &&
                firstArg.operatorToken.kind === ts.SyntaxKind.PlusToken)
            ) {
              isDynamicSql = true
            } else if (ts.isIdentifier(firstArg)) {
              const binding = resolveBinding(firstArg)
              if (
                binding.node &&
                (ts.isTemplateExpression(binding.node) ||
                  (ts.isBinaryExpression(binding.node) &&
                    binding.node.operatorToken.kind === ts.SyntaxKind.PlusToken))
              ) {
                isDynamicSql = true
              }
            }
          }

          if (isDynamicSql) {
            findings.push({
              id: buildFindingId('sec-sql-injection', file.path, lineStart, offset),
              category: 'Security',
              title: `Potential SQL injection sink in ${file.path}:${lineStart}`,
              description:
                'SQL query constructed via dynamic string concatenation or template interpolation at database query sink.',
              severity: 'high',
              confidence: 'high',
            evidence: [
              file.truncated
                ? '[source evidence omitted: file content truncated]'
                : `Dynamic SQL query string construction observed at line ${lineStart}; query text withheld.`,
            ],
            location: `${file.path}:${lineStart}`,
            recommendation:
              'Use parameterized queries or prepared statements ($1, ? placeholders) instead of string interpolation.',
            source: 'repository',
            verification: 'heuristic',
            filePath: file.path,
            lineStart,
            lineEnd,
            githubPermaUrl: redactUrl(
              `https://github.com/${owner}/${repo}/blob/${sha}/${file.path}#L${lineStart}`,
              sensitiveValues
            ),
            security: {
              category: 'Security',
              ruleId: 'sql.injection-sink',
              ruleVersion: '1.0.0',
              commitSha: sha,
              filePath: file.path,
              lineStart,
              lineEnd,
              observation:
                'SQL query constructed via dynamic string concatenation or template interpolation at database query sink without parameterization.',
              possibleImpact:
                'SQL injection vulnerability if interpolated values derive from untrusted input.',
              coverageLimitations:
                'Local AST inspection; database abstraction layers or upstream schema validations not evaluated.',
            },
          })
        }
      }
    }
  }

    // D. Unsafe HTML Injection: dangerouslySetInnerHTML and innerHTML / outerHTML
    if (ts.isJsxAttribute(node)) {
      if (
        ts.isIdentifier(node.name) &&
        node.name.text === 'dangerouslySetInnerHTML' &&
        node.initializer
      ) {
        let isStaticHtml = false
        if (
          ts.isJsxExpression(node.initializer) &&
          node.initializer.expression &&
          ts.isObjectLiteralExpression(node.initializer.expression)
        ) {
          for (const prop of node.initializer.expression.properties) {
            if (
              ts.isPropertyAssignment(prop) &&
              ts.isIdentifier(prop.name) &&
              prop.name.text === '__html'
            ) {
              if (
                ts.isStringLiteral(prop.initializer) ||
                ts.isNoSubstitutionTemplateLiteral(prop.initializer)
              ) {
                isStaticHtml = true
              }
            }
          }
        }

        if (!isStaticHtml) {
          findings.push({
            id: buildFindingId('sec-xss-unsafe-html', file.path, lineStart, offset),
            category: 'Security',
            title: `Unsafe HTML insertion in ${file.path}:${lineStart}`,
            description:
              'Dynamic HTML insertion sink populated with variable or untrusted data without apparent sanitization.',
            severity: 'high',
            confidence: 'medium',
            evidence: [
              file.truncated
                ? '[source evidence omitted: file content truncated]'
                : `Dynamic HTML sink assignment observed at line ${lineStart}; source payload withheld.`,
            ],
            location: `${file.path}:${lineStart}`,
            recommendation:
              'Sanitize input using a library like DOMPurify or avoid raw HTML insertion.',
            source: 'repository',
            verification: 'heuristic',
            filePath: file.path,
            lineStart,
            lineEnd,
            githubPermaUrl: redactUrl(
              `https://github.com/${owner}/${repo}/blob/${sha}/${file.path}#L${lineStart}`,
              sensitiveValues
            ),
            security: {
              category: 'Security',
              ruleId: 'xss.unsafe-html',
              ruleVersion: '1.0.0',
              commitSha: sha,
              filePath: file.path,
              lineStart,
              lineEnd,
              observation:
                'Dynamic HTML insertion sink populated with variable or untrusted data without apparent sanitization.',
              possibleImpact:
                'Cross-site scripting (XSS) if untrusted data is rendered without sanitization.',
              coverageLimitations:
                'Local AST analysis; external sanitizers or upstream HTML encoding cannot be definitively tracked.',
            },
          })
        }
      }
    }

    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      if (ts.isPropertyAccessExpression(node.left)) {
        const propName = node.left.name.text
        if (propName === 'innerHTML' || propName === 'outerHTML') {
          const isStatic =
            ts.isStringLiteral(node.right) || ts.isNoSubstitutionTemplateLiteral(node.right)
          if (!isStatic) {
            findings.push({
              id: buildFindingId('sec-xss-unsafe-html', file.path, lineStart, offset),
              category: 'Security',
              title: `Unsafe HTML insertion in ${file.path}:${lineStart}`,
              description:
                'Assignment to innerHTML or outerHTML using dynamic variable without apparent sanitization.',
              severity: 'high',
              confidence: 'medium',
              evidence: [
                file.truncated
                  ? '[source evidence omitted: file content truncated]'
                  : `Dynamic HTML sink assignment observed at line ${lineStart}; source payload withheld.`,
              ],
              location: `${file.path}:${lineStart}`,
              recommendation:
                'Sanitize input using a library like DOMPurify or use textContent instead of innerHTML.',
              source: 'repository',
              verification: 'heuristic',
              filePath: file.path,
              lineStart,
              lineEnd,
              githubPermaUrl: redactUrl(
                `https://github.com/${owner}/${repo}/blob/${sha}/${file.path}#L${lineStart}`,
                sensitiveValues
              ),
              security: {
                category: 'Security',
                ruleId: 'xss.unsafe-html',
                ruleVersion: '1.0.0',
                commitSha: sha,
                filePath: file.path,
                lineStart,
                lineEnd,
                observation:
                  'Assignment to innerHTML or outerHTML using dynamic variable without apparent sanitization.',
                possibleImpact:
                  'Cross-site scripting (XSS) if untrusted data is rendered without sanitization.',
                coverageLimitations:
                  'Local AST analysis; external sanitizers or upstream HTML encoding cannot be definitively tracked.',
              },
            })
          }
        }
      }
    }

    // E. Client identity trust: const { role, userId } = await req.json(); if (role === 'admin')
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isObjectBindingPattern(decl.name) && decl.initializer) {
          let initializer: ts.Node | undefined = decl.initializer
          const visited = new Set<ts.Node>()
          let aliasCount = 0
          while (initializer && !visited.has(initializer) && aliasCount < MAX_ALIAS_DEPTH) {
            aliasCount++
            visited.add(initializer)
            if (ts.isAwaitExpression(initializer) || ts.isParenthesizedExpression(initializer)) {
              initializer = initializer.expression
            } else if (ts.isIdentifier(initializer)) {
              initializer = resolveBinding(initializer, undefined, aliasCount).node
            } else {
              break
            }
          }
          const payloadAccess = initializer && ts.isCallExpression(initializer)
            ? initializer.expression
            : initializer
          const isClientSource = !!(
            payloadAccess &&
            ts.isPropertyAccessExpression(payloadAccess) &&
            ts.isIdentifier(payloadAccess.expression) &&
            /^(req|request)$/.test(payloadAccess.expression.text) &&
            payloadAccess.name.text === (initializer && ts.isCallExpression(initializer) ? 'json' : 'body')
          )

          if (isClientSource) {
            const privNames = new Set<string>()
            for (const el of decl.name.elements) {
              if (ts.isIdentifier(el.name)) {
                const prop =
                  el.propertyName && ts.isIdentifier(el.propertyName)
                    ? el.propertyName.text
                    : el.name.text
                const local = el.name.text
                if (
                  /^(role|isAdmin|admin|group|permission|scope|privilege)$/i.test(prop) ||
                  /^(role|isAdmin|admin|group|permission|scope|privilege)$/i.test(local)
                ) {
                  privNames.add(local)
                }
              }
            }

            if (privNames.size > 0) {
              function isIdentifierReference(node: ts.Node, names: Set<string>): boolean {
                let found = false
                function walk(n: ts.Node) {
                  if (found) return
                  if (ts.isIdentifier(n) && names.has(n.text)) {
                    const parent = n.parent
                    if (parent) {
                      if (ts.isPropertyAccessExpression(parent) && parent.name === n) {
                        return
                      }
                      if (ts.isPropertyAssignment(parent) && parent.name === n) {
                        return
                      }
                      if (
                        (ts.isMethodDeclaration(parent) ||
                          ts.isPropertyDeclaration(parent) ||
                          ts.isGetAccessorDeclaration(parent) ||
                          ts.isSetAccessorDeclaration(parent)) &&
                        parent.name === n
                      ) {
                        return
                      }
                    }
                    found = true
                    return
                  }
                  if (
                    ts.isStringLiteral(n) ||
                    ts.isNumericLiteral(n) ||
                    ts.isNoSubstitutionTemplateLiteral(n)
                  ) {
                    return
                  }
                  ts.forEachChild(n, walk)
                }
                walk(node)
                return found
              }

              let hasPrivilegeGate = false
              function checkGate(n: ts.Node) {
                if (hasPrivilegeGate) return
                if (ts.isIfStatement(n)) {
                  if (isIdentifierReference(n.expression, privNames)) {
                    hasPrivilegeGate = true
                    return
                  }
                }
                if (ts.isConditionalExpression(n)) {
                  if (isIdentifierReference(n.condition, privNames)) {
                    hasPrivilegeGate = true
                    return
                  }
                }
                if (ts.isSwitchStatement(n)) {
                  if (isIdentifierReference(n.expression, privNames)) {
                    hasPrivilegeGate = true
                    return
                  }
                }
                if (ts.isBinaryExpression(n)) {
                  if (
                    n.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken ||
                    n.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
                    n.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken ||
                    n.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken
                  ) {
                    if (
                      isIdentifierReference(n.left, privNames) ||
                      isIdentifierReference(n.right, privNames)
                    ) {
                      hasPrivilegeGate = true
                      return
                    }
                  }
                }
                ts.forEachChild(n, checkGate)
              }
              checkGate(currentScope)

              if (hasPrivilegeGate) {
                findings.push({
                  id: buildFindingId('sec-auth-client-identity', file.path, lineStart, offset),
                  category: 'Security',
                  title: `Client-controlled identity or role trust in ${file.path}:${lineStart}`,
                  description:
                    'Authorization decision or identity assignment relies directly on client-supplied request payload.',
                  severity: 'high',
                  confidence: 'high',
                  evidence: [
                    file.truncated
                      ? '[source evidence omitted: file content truncated]'
                      : `Client-provided role or privilege field evaluated in authorization decision at line ${lineStart}.`,
                  ],
                  location: `${file.path}:${lineStart}`,
                  recommendation:
                    'Derive user identity and permissions exclusively from validated server-side sessions or verified JWTs.',
                  source: 'repository',
                  verification: 'heuristic',
                  filePath: file.path,
                  lineStart,
                  lineEnd,
                  githubPermaUrl: redactUrl(
                    `https://github.com/${owner}/${repo}/blob/${sha}/${file.path}#L${lineStart}`,
                    sensitiveValues
                  ),
                  security: {
                    category: 'Security',
                    ruleId: 'auth.client-identity-trust',
                    ruleVersion: '1.0.0',
                    commitSha: sha,
                    filePath: file.path,
                    lineStart,
                    lineEnd,
                    observation:
                      'Client-provided role or privilege field evaluated in authorization decision.',
                    possibleImpact:
                      'Privilege escalation or unauthorized identity impersonation if user modifies request payload.',
                    coverageLimitations:
                      'Local AST analysis; upstream middleware or schema validation cannot be verified globally.',
                  },
                })
              }
            }
          }
        }
      }
    }

    // F. Client Bundle Server Secret Leak: 'use client' + process.env.SECRET or NEXT_PUBLIC_*_SECRET
    if (ts.isPropertyAccessExpression(node)) {
      const exprText = node.expression.getText(sourceFile)
      const propName = node.name.text

      if (exprText === 'process.env') {
        const isNextPublic = propName.startsWith('NEXT_PUBLIC_')
        const suffix = isNextPublic ? propName.slice('NEXT_PUBLIC_'.length) : propName
        const isSecretNamed =
          /(?:SECRET|PRIVATE|SERVICE_ROLE|DATABASE_URL|PASSWORD)/i.test(suffix) ||
          (/(?:^|_)KEY\b/i.test(suffix) && /(?:SECRET|PRIVATE|ADMIN)/i.test(suffix))

        // 1. Inside 'use client' file: non-NEXT_PUBLIC variable accessed with secret naming
        if (isUseClient && !isNextPublic && propName !== 'NODE_ENV' && isSecretNamed) {
          findings.push({
            id: buildFindingId('sec-next-client-secret', file.path, lineStart, offset),
            category: 'Security',
            title: `Server secret referenced in client bundle in ${file.path}:${lineStart}`,
            description:
              'Server-only environment variable referenced in a "use client" component bundle.',
            severity: 'high',
            confidence: 'medium',
            evidence: [
              file.truncated
                ? '[source evidence omitted: file content truncated]'
                : `Server-only environment variable reference observed at line ${lineStart}; source environment reference observed.`,
            ],
            location: `${file.path}:${lineStart}`,
            recommendation:
              'Keep server credentials in server components, route handlers, or server actions without NEXT_PUBLIC prefix.',
            source: 'repository',
            verification: 'heuristic',
            filePath: file.path,
            lineStart,
            lineEnd,
            githubPermaUrl: redactUrl(
              `https://github.com/${owner}/${repo}/blob/${sha}/${file.path}#L${lineStart}`,
              sensitiveValues
            ),
            security: {
              category: 'Security',
              ruleId: 'next.client-secret-leak',
              ruleVersion: '1.0.0',
              commitSha: sha,
              filePath: file.path,
              lineStart,
              lineEnd,
              observation:
                'Server-only environment variable referenced in client component; source environment reference observed (bundler may replace with undefined at build time).',
              possibleImpact:
                'Client bundle exposure of server secrets or private credentials to browser users if bundled.',
              coverageLimitations:
                'Local AST inspection; bundler dead-code elimination or build-time transforms not evaluated.',
            },
          })
        }

        // 2. Any file: NEXT_PUBLIC_* variable containing secret pattern (excluding publishable keys)
        if (
          isNextPublic &&
          isSecretNamed &&
          !/(?:PUBLISHABLE|ANON)/i.test(suffix)
        ) {
          findings.push({
            id: buildFindingId('sec-next-client-secret', file.path, lineStart, offset),
            category: 'Security',
            title: `Server secret exposed via NEXT_PUBLIC in ${file.path}:${lineStart}`,
            description:
              'Environment variable with sensitive naming is exposed via NEXT_PUBLIC prefix to browser bundles.',
            severity: 'high',
            confidence: 'high',
            evidence: [
              file.truncated
                ? '[source evidence omitted: file content truncated]'
                : `Sensitive environment variable exposed via NEXT_PUBLIC observed at line ${lineStart}; source environment reference observed.`,
            ],
            location: `${file.path}:${lineStart}`,
            recommendation:
              'Remove NEXT_PUBLIC prefix from secret credentials and access them exclusively on the server.',
            source: 'repository',
            verification: 'heuristic',
            filePath: file.path,
            lineStart,
            lineEnd,
            githubPermaUrl: redactUrl(
              `https://github.com/${owner}/${repo}/blob/${sha}/${file.path}#L${lineStart}`,
              sensitiveValues
            ),
            security: {
              category: 'Security',
              ruleId: 'next.client-secret-leak',
              ruleVersion: '1.0.0',
              commitSha: sha,
              filePath: file.path,
              lineStart,
              lineEnd,
              observation:
                'Environment variable with sensitive naming exposed via NEXT_PUBLIC; source environment reference observed.',
              possibleImpact:
                'Exposure of sensitive API secrets or tokens to frontend client bundles.',
              coverageLimitations:
                'Local AST inspection; bundler dead-code elimination or build-time transforms not evaluated.',
            },
          })
        }
      }
    }

    // G. CORS Wildcard with Credentials
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === 'cors') {
        const arg = node.arguments[0]
        if (arg && ts.isObjectLiteralExpression(arg)) {
          let originKind: 'none' | 'wildcard' | 'reflect' = 'none'
          let hasCredentials = false
          for (const prop of arg.properties) {
            if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
              if (prop.name.text === 'origin') {
                if (ts.isStringLiteral(prop.initializer) && prop.initializer.text === '*') {
                  originKind = 'wildcard'
                } else if (prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
                  originKind = 'reflect'
                }
              }
              if (prop.name.text === 'credentials') {
                if (prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
                  hasCredentials = true
                }
              }
            }
          }

          if (hasCredentials && originKind !== 'none') {
            const isWildcard = originKind === 'wildcard'
            findings.push({
              id: buildFindingId('sec-cors-wildcard', file.path, lineStart, offset),
              category: 'Security',
              title: isWildcard
                ? `Insecure CORS wildcard with credentials enabled in ${file.path}:${lineStart}`
                : `Dynamic origin reflection with credentials in ${file.path}:${lineStart}`,
              description: isWildcard
                ? 'CORS configuration combines wildcard origin ("*") with credentials enabled, which browsers reject.'
                : 'CORS configuration dynamically reflects request origin paired with credentials enabled; credentialed cross-origin reads may succeed.',
              severity: isWildcard ? 'medium' : 'high',
              confidence: 'high',
              evidence: [
                file.truncated
                  ? '[source evidence omitted: file content truncated]'
                  : isWildcard
                  ? `Wildcard CORS origin paired with credentials enabled observed at line ${lineStart}.`
                  : `Dynamically reflected CORS origin (origin: true) paired with credentials observed at line ${lineStart}.`,
              ],
              location: `${file.path}:${lineStart}`,
              recommendation: isWildcard
                ? 'Specify explicit trusted origins instead of wildcard ("*") when credentials are supported.'
                : 'Specify explicit trusted origins instead of reflecting request origin when credentials are supported.',
              source: 'repository',
              verification: 'heuristic',
              filePath: file.path,
              lineStart,
              lineEnd,
              githubPermaUrl: redactUrl(
                `https://github.com/${owner}/${repo}/blob/${sha}/${file.path}#L${lineStart}`,
                sensitiveValues
              ),
              security: {
                category: 'Security',
                ruleId: 'cors.wildcard-credentials',
                ruleVersion: '1.0.0',
                commitSha: sha,
                filePath: file.path,
                lineStart,
                lineEnd,
                observation: isWildcard
                  ? 'CORS configuration combines wildcard origin ("*") with credentials enabled; invalid browser configuration resulting in browser rejection.'
                  : 'CORS configuration sets origin: true with credentials: true, reflecting request origin; credentialed reads may succeed.',
                possibleImpact: isWildcard
                  ? 'Browser rejection of cross-origin requests; configuration error under browser CORS specifications.'
                  : 'Credentialed cross-origin reads from arbitrary origins may succeed if requests include credentials.',
                coverageLimitations:
                  'Server configuration checked within admitted files; reverse proxy CORS policies not evaluated.',
              },
            })
          }
        }
      }
    }

    // H. Production Dev Switch / Bypass
    if (ts.isIfStatement(node)) {
      function isProdCondition(expr: ts.Node): boolean {
        if (ts.isBinaryExpression(expr)) {
          const left = expr.left.getText(sourceFile).trim()
          const right = expr.right.getText(sourceFile).trim()
          const isEq =
            expr.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken ||
            expr.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
          const isNeq =
            expr.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken ||
            expr.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken

          const isNodeEnv = (s: string) => s === 'process.env.NODE_ENV' || s === 'NODE_ENV'

          if (
            isEq &&
            ((isNodeEnv(left) && /^['"]production['"]$/.test(right)) ||
              (isNodeEnv(right) && /^['"]production['"]$/.test(left)))
          ) {
            return true
          }
          if (
            isNeq &&
            ((isNodeEnv(left) && /^['"]development['"]$/.test(right)) ||
              (isNodeEnv(right) && /^['"]development['"]$/.test(left)))
          ) {
            return true
          }
        }
        return false
      }

      if (isProdCondition(node.expression)) {
        const directStatements: ts.Statement[] = []
        if (ts.isBlock(node.thenStatement)) {
          directStatements.push(...node.thenStatement.statements)
        } else {
          directStatements.push(node.thenStatement)
        }

        let hasDirectBypass = false
        for (const stmt of directStatements) {
          if (ts.isIfStatement(stmt)) {
            // Nested guard: guarded execution, do not flag as unconditional production bypass
            continue
          }

          if (ts.isExpressionStatement(stmt)) {
            if (
              ts.isBinaryExpression(stmt.expression) &&
              stmt.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
            ) {
              const leftText = stmt.expression.left.getText(sourceFile).trim()
              const right = stmt.expression.right

              if (
                /^(bypassAuth|devBypass|mockAuth|skipAuth|enableDebug|debugMode)$/i.test(leftText) &&
                right.kind === ts.SyntaxKind.TrueKeyword
              ) {
                hasDirectBypass = true
                break
              }
              if (
                /^(authEnabled|requireAuth)$/i.test(leftText) &&
                right.kind === ts.SyntaxKind.FalseKeyword
              ) {
                hasDirectBypass = true
                break
              }
            }
          }

          if (ts.isVariableStatement(stmt)) {
            for (const decl of stmt.declarationList.declarations) {
              if (decl.initializer && ts.isObjectLiteralExpression(decl.initializer)) {
                for (const prop of decl.initializer.properties) {
                  if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
                    if (
                      /^(bypassAuth|devBypass|mockAuth|skipAuth|enableDebug|debugMode)$/i.test(
                        prop.name.text
                      ) &&
                      prop.initializer.kind === ts.SyntaxKind.TrueKeyword
                    ) {
                      hasDirectBypass = true
                      break
                    }
                    if (
                      /^(authEnabled|requireAuth)$/i.test(prop.name.text) &&
                      prop.initializer.kind === ts.SyntaxKind.FalseKeyword
                    ) {
                      hasDirectBypass = true
                      break
                    }
                  }
                }
              }
            }
          }

          if (ts.isReturnStatement(stmt)) {
            if (stmt.expression && ts.isObjectLiteralExpression(stmt.expression)) {
              for (const prop of stmt.expression.properties) {
                if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
                  if (
                    /^(bypassAuth|devBypass|mockAuth|skipAuth|enableDebug|debugMode)$/i.test(
                      prop.name.text
                    ) &&
                    prop.initializer.kind === ts.SyntaxKind.TrueKeyword
                  ) {
                    hasDirectBypass = true
                    break
                  }
                  if (
                    /^(authEnabled|requireAuth)$/i.test(prop.name.text) &&
                    prop.initializer.kind === ts.SyntaxKind.FalseKeyword
                  ) {
                    hasDirectBypass = true
                    break
                  }
                }
              }
            }
          }
        }

        if (hasDirectBypass) {
          findings.push({
            id: buildFindingId('sec-env-dev-switch', file.path, lineStart, offset),
            category: 'Security',
            title: `Development feature or bypass enabled in production in ${file.path}:${lineStart}`,
            description:
              'Development debug mode or authentication bypass is active when NODE_ENV is production.',
            severity: 'high',
            confidence: 'high',
            evidence: [
              file.truncated
                ? '[source evidence omitted: file content truncated]'
                : `Development switch or bypass configuration active in production branch at line ${lineStart}.`,
            ],
            location: `${file.path}:${lineStart}`,
            recommendation:
              'Ensure debug modes and test bypasses are strictly disabled or excluded in production builds.',
            source: 'repository',
            verification: 'heuristic',
            filePath: file.path,
            lineStart,
            lineEnd,
            githubPermaUrl: redactUrl(
              `https://github.com/${owner}/${repo}/blob/${sha}/${file.path}#L${lineStart}`,
              sensitiveValues
            ),
            security: {
              category: 'Security',
              ruleId: 'env.dev-switch-production',
              ruleVersion: '1.0.0',
              commitSha: sha,
              filePath: file.path,
              lineStart,
              lineEnd,
              observation:
                'Development switch, authentication bypass, or debug feature active in production environment branch.',
              possibleImpact:
                'Security control bypass, sensitive debug exposure, or relaxed validation in production.',
              coverageLimitations:
                'Static heuristic on environment condition blocks; runtime environment variables control actual behavior.',
            },
          })
        }
      }
    }

    ts.forEachChild(node, visit)
    if (isNewScope) {
      currentScope = prevScope
    }
  }

  checkScopeCorsHeaders(sourceFile)
  visit(sourceFile)
}
