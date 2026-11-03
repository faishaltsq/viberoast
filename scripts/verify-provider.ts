import { z } from 'zod'

async function main() {
  const key = process.env.DEEPSEEK_API_KEY
  const model = process.env.DEEPSEEK_MODEL
  const configuredBase = process.env.DEEPSEEK_BASE_URL
  if (!key || !model || !configuredBase) throw new Error('Set DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, and DEEPSEEK_MODEL before provider verification.')
  const base = new URL(configuredBase)
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('Provider base URL must be an HTTPS API origin/path without credentials, queries, or fragments.')
  const response = await fetch(`${base.href.replace(/\/$/, '')}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000), redirect: 'error' })
  if (!response.ok) throw new Error(`Model discovery failed with HTTP ${response.status}; check provider access and configuration.`)
  const reader = response.body?.getReader()
  if (!reader) throw new Error('The model catalog was empty.')
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      bytes += part.value.byteLength
      if (bytes > 256_000) { await reader.cancel(); throw new Error('The model catalog exceeded the safety limit.') }
      chunks.push(part.value)
    }
  } finally { reader.releaseLock() }
  const catalog = z.object({ data: z.array(z.object({ id: z.string(), input_modalities: z.array(z.string()).optional() })) }).parse(JSON.parse(Buffer.concat(chunks).toString('utf8')))
  const selected = catalog.data.find(item => item.id === model)
  if (!selected) throw new Error('The configured model was not found in the provider model catalog.')
  const vision = process.env.DEEPSEEK_SUPPORTS_VISION === 'true'
  if (vision && !selected.input_modalities?.includes('image')) throw new Error('Vision is enabled but image input was not confirmed by the provider catalog. Disable vision or select a supported model.')
  console.log(`Configured model is available. Analysis mode: ${vision ? 'text and images (catalog verified)' : 'text only (screenshots not sent)'}. No paid completion was requested.`)
}

main().catch(error => {
  console.error(error instanceof z.ZodError ? 'The provider model catalog did not match the expected schema.' : error instanceof Error && !error.message.includes('fetch') ? error.message : 'Provider discovery could not connect safely.')
  process.exitCode = 1
})
