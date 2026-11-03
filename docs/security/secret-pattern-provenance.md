# Secret Pattern Provenance & License Tracking

## 1. Upstream Source & License

The secret pattern shapes implemented in `lib/security/secrets/` are derived from and vetted against:

- **Source Repository**: [Gitleaks](https://github.com/gitleaks/gitleaks)
- **Pinned Version**: `v8.30.1`
- **Upstream License**: MIT License (Copyright (c) 2019 Zachary Rice)
- **Vendored Pattern Rules**:
  - `cmd/generate/config/rules/github.go`
  - `cmd/generate/config/rules/aws.go`
  - `cmd/generate/config/rules/stripe.go`
  - `cmd/generate/config/rules/slack.go`
  - `cmd/generate/config/rules/openai.go`
  - `cmd/generate/config/rules/anthropic.go`
  - `cmd/generate/config/rules/privatekey.go`
  - `config/gitleaks.toml`

## 2. Rule Inventory & Implementations

| Provider | Rule ID | Pattern Shape / Length | Classification |
| :--- | :--- | :--- | :--- |
| **GitHub** | `github-pat` | `ghp_[0-9a-zA-Z]{36}` | `recognized` |
| **GitHub** | `github-fine-grained-pat` | `github_pat_[0-9a-zA-Z_]{82}` | `recognized` |
| **GitHub** | `github-oauth` | `gho_[0-9a-zA-Z]{36}` | `recognized` |
| **GitHub** | `github-app-token` | `(?:ghu\|ghs)_[0-9a-zA-Z]{36}` | `recognized` |
| **GitHub** | `github-refresh-token` | `ghr_[0-9a-zA-Z]{36}` | `recognized` |
| **GitHub** | `github-token-broad` | `(?:gh[pousr]_[0-9a-zA-Z]{20,}\|github_pat_[0-9a-zA-Z_]{20,})` | `uncertain` |
| **AWS** | `aws-access-key-id` | `(?:A3T[A-Z0-9]\|AKIA\|ASIA\|ABIA\|ACCA)[A-Z0-9]{16}` | `recognized` / `placeholder` (EXAMPLE) |
| **AWS** | `aws-secret-access-key` | Contextual assignment with 40-char base64 string | `recognized` |
| **AWS** | `aws-bedrock-api-key-long-lived` | `ABSK[A-Za-z0-9+/]{109,269}={0,2}` | `recognized` |
| **AWS** | `aws-bedrock-api-key-short-lived` | `bedrock-api-key-YmVkcm9jay5hbWF6b25hd3MuY29t` (including full suffix) | `recognized` |
| **Stripe** | `stripe-secret-key` | `(?:sk\|rk)_(?:test\|live\|prod)_[a-zA-Z0-9]{10,99}` | `recognized` |
| **Stripe** | `stripe-publishable-key` | `pk_(?:test\|live\|prod)_[a-zA-Z0-9]{10,99}` | `publishable` |
| **Stripe** | `stripe-webhook-secret` | `whsec_[a-zA-Z0-9]{24,}` | `recognized` |
| **Slack** | `slack-bot-token` | `xoxb-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*` | `recognized` |
| **Slack** | `slack-user-token` | `xox[pe](?:-[0-9]{10,13}){3}-[a-zA-Z0-9-]{28,34}` | `recognized` |
| **Slack** | `slack-app-token` | `xapp-\d-[A-Za-z0-9]+-\d+-[a-zA-Z0-9]+` | `recognized` |
| **Slack** | `slack-config-access-token` | `xoxe\.xox[bp]-\d-[A-Za-z0-9]{163,166}` | `recognized` |
| **Slack** | `slack-config-refresh-token` | `xoxe-\d-[A-Za-z0-9]{146}` | `recognized` |
| **Slack** | `slack-legacy-workspace-token` | `xox[ar]-(?:\d-)?[0-9a-zA-Z]{8,48}` | `recognized` |
| **Slack** | `slack-webhook-url` | `https://hooks.slack.com/...` | `recognized` |
| **Slack** | `slack-token-broad` | `(?:xox[baprs]-[0-9a-zA-Z-]{10,}\|xoxe-[0-9a-zA-Z-]{10,}\|xapp-[0-9a-zA-Z-]{10,})` | `uncertain` |
| **OpenAI** | `openai-api-key` | Modern project (`{74}` or `{58}` around `T3BlbkFJ`) & legacy | `recognized` |
| **Anthropic** | `anthropic-api-key` | `sk-ant-api03-[a-zA-Z0-9_\-]{93}AA` | `recognized` |
| **Anthropic** | `anthropic-admin-api-key` | `sk-ant-admin01-[a-zA-Z0-9_\-]{93}AA` | `recognized` |
| **Google** | `gcp-api-key` | `AIza[0-9A-Za-z_-]{35}` | `recognized` |
| **Google** | `google-service-account-key` | Service Account JSON with escaped PEM newlines | `recognized` |
| **Crypto** | `private-key-block` | `-----BEGIN [A-Z0-9_-]+ PRIVATE KEY...` | `suspicious` |
| **Crypto** | `public-key-certificate` | `-----BEGIN [PUBLIC KEY\|CERTIFICATE]...` | `publishable` |
| **Database** | `database-url-credentials` | `postgres://user:pass@host` (incl percent-encoding) | `recognized` |
| **JWT** | `jwt-signing-secret` | `JWT_SECRET="..."` | `suspicious` |
| **JWT** | `jwt-bearer-token` | `eyJ...` (contextual role inspection for Supabase) | `publishable` (`anon`) / `recognized` (`service_role`) / `uncertain` |
| **Supabase** | `supabase-publishable` | `sb_publishable_...` | `publishable` |
| **Supabase** | `supabase-secret` | `sb_secret_...` | `recognized` |
| **Supabase** | `supabase-pat` | `sbp_...` | `recognized` |
| **Generic** | `generic-credential-assignment` | Assignment context with Shannon entropy >= 3.5 | `suspicious` |

## 3. Operational Limits & Guarantees

1. **Heuristic Shapes Only**: Patterns describe structural credential shapes. They do not cryptographically verify signatures or prove issuance.
2. **No Network / Issuer Calls**: Under no circumstances does the engine call external token validation endpoints or provider APIs.
3. **Conservative Redaction**: `uncertain`, `suspicious`, and `recognized` tokens are masked from outgoing report evidence to prevent leakage.
4. **Publishable Non-Interference**: Tokens classified as `publishable` (e.g. Stripe `pk_`, Supabase `sb_publishable_`, public certs) do not create private security findings.
5. **No History Rewrites in Automated Reports**: Recommendations emphasize owner-controlled secret revocation, rotation, and git history review.

## 4. Upstream license notice

Source: https://github.com/gitleaks/gitleaks/blob/v8.30.1/LICENSE

MIT License

Copyright (c) 2019 Zachary Rice

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
