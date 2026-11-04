/**
 * Synthetic security fixtures for secret detector tests.
 * All values are synthetic and non-functional.
 */

// 1. GitHub
export const GITHUB_PAT = 'ghp_' + 'Q7n4'.repeat(9) // 36 chars
export const GITHUB_FINE_GRAINED = 'github_pat_' + '11A1234567_'.repeat(7) + '12345' // 82 chars
export const GITHUB_OAUTH = 'gho_' + 'Q7n4'.repeat(9)
export const GITHUB_APP_USER = 'ghu_' + 'Q7n4'.repeat(9)
export const GITHUB_APP_SERVER = 'ghs_' + 'Q7n4'.repeat(9)
export const GITHUB_REFRESH = 'ghr_' + 'Q7n4'.repeat(9)
export const LOW_DIVERSITY_GITHUB = 'ghp_' + 'a1'.repeat(18) // Valid shape, low character diversity
export const GHP_24 = 'ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2' // 24 chars payload outside assignment
export const GITHUB_PAT_24 = 'github_pat_' + 'a1B2c3D4e5F6g7H8i9J0k1L2' // 24 chars payload
// Slack values are concatenated at runtime (same style as the GitHub fixtures above) so the
// source file never contains a full token literal; push-protection scanners see fragments only.
export const SLACK_LEGACY_UNKNOWN = 'xoxb-' + '12345678' + '-' + 'unknownvariant' + 'segment'

// 2. AWS
export const AWS_ACCESS_KEY_ID = 'AKIA' + '234567QWERTZXCVB' // 16 chars from [A-Z2-7]
export const AWS_ACCESS_KEY_ID_LEGACY = 'AKIA1234567890ABCDEF'
export const AWS_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
export const AWS_EXAMPLE_KEY = 'AKIAIOSFODNN7EXAMPLE'
export const AWS_BEDROCK_LONG_LIVED = 'ABSK' + 'QmVkcm9ja0FQSUtleS1'.repeat(6) + '=='
export const AWS_BEDROCK_SHORT_LIVED = 'bedrock-api-key-YmVkcm9jay5hbWF6b25hd3MuY29t'
export const BEDROCK_SHORT_LIVED_WITH_SUFFIX = 'bedrock-api-key-YmVkcm9jay5hbWF6b25hd3MuY29t.eyJleHAiOjE3MDAwMDAwMDB9.s1gN4tur3'

// 3. Stripe
export const STRIPE_SK_LIVE = 'sk_live_' + '51OuEMLAlTWGaDypq4P5cuDHbuKeG4tAGPYHJpEXQ7zE8mKK3jkhTFPvCxnSS'
export const STRIPE_SK_TEST = 'sk_test_' + '51OuEMLAlTWGaDypq4P5cuDHbuKeG4tAGPYHJpEXQ7zE8mKK3jkhTFPvCxnSS'
export const STRIPE_RK_LIVE = 'rk_live_' + '51OuEMLAlTWGaDypquDn9aZigaJOsa9NR1w1BxZXs9JlYsVVkv5XDu6aLmAxwt'
export const STRIPE_PK_TEST = 'pk_test_' + 'a7Z2'.repeat(6)
export const STRIPE_PK_LIVE = 'pk_live_' + 'a7Z2'.repeat(6)
export const STRIPE_WHSEC = 'whsec_' + 'AbCdEf1234567890GhIjKlMnOpQrStUv'

// 4. Slack
export const SLACK_BOT_TOKEN = 'xoxb-' + '123456789012' + '-' + '1234567890123' + '-' + 'GkwFDQ' + 'oHqzXDVs' + 'C6GzqYUypD'
export const SLACK_USER_TOKEN = 'xoxp-' + '41684372915' + '-' + '1320496754' + '-' + '45609968301' + '-' + 'e708ba56e1517a99' + 'f6b5fb07349476ef'
export const SLACK_APP_TOKEN = 'xapp-' + '1-A052FGTS2DL-' + '5171572773297-' + '610b6a11f4b7eb' + '819e87b767d80e' + '6575a3634791ac' + 'b9a9ead051da87' + '9eb5b55e'
export const SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/' + 'T00000000/' + 'B00000000/' + 'XXXXXXXXXXXXXXXXXXXXXXXX'

// 5. OpenAI
export const OPENAI_MODERN_PROJECT = 'sk-proj-' + 'A'.repeat(74) + 'T3BlbkFJ' + 'B'.repeat(74)
export const OPENAI_MODERN_58 = 'sk-proj-' + 'C'.repeat(58) + 'T3BlbkFJ' + 'D'.repeat(58)
export const OPENAI_LEGACY = 'sk-' + 'a'.repeat(20) + 'T3BlbkFJ' + 'b'.repeat(20)

// 6. Anthropic
export const ANTHROPIC_API_KEY = 'sk-ant-api03-' + 'aB1_'.repeat(23) + 'xAA'
export const ANTHROPIC_ADMIN_KEY = 'sk-ant-admin01-' + 'aB1_'.repeat(23) + 'xAA'

// 7. Google Service Account & GCP
export const GOOGLE_SA_PRIVATE_KEY_PEM = '-----BEGIN PRIVATE KEY-----\\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC6r1234567890abcdefghijklmnopqrstuvwxyz\\n-----END PRIVATE KEY-----\\n'
export const GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
  type: 'service_account',
  project_id: 'sample-project-1234',
  private_key_id: 'key1234567890',
  private_key: GOOGLE_SA_PRIVATE_KEY_PEM,
  client_email: 'service-account@sample-project-1234.iam.gserviceaccount.com',
  client_id: '123456789012345678901',
})
export const GCP_API_KEY = 'AIzaSy' + 'A'.repeat(33)

// 8. Generic PEM
export const PEM_PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIIEogIBAAKCAQEA0Y1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL
MNOPQRSTUVWXYZ0123456789+/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL==
-----END RSA PRIVATE KEY-----`

export const PEM_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0Y1234567890abcdefghij
-----END PUBLIC KEY-----`

export const PEM_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIDdzCCAl+gAwIBAgIEAgAAuTANBgkqhkiG9w0BAQsFADBaMQswCQYDVQQGEwJV
-----END CERTIFICATE-----`

// 9. Database URLs
export const DATABASE_URL_POSTGRES = 'postgres://dbadmin:p%40ssw0rd123!@db.example.internal:5432/production'
export const DATABASE_URL_MYSQL = 'mysql://appuser:Secret9988!@mysql.internal:3306/appdb'
export const MALFORMED_URL_CREDENTIAL = 'postgres://dbadmin:p%ZZword@db.example.internal:5432/production'

// 10. JWT
export const JWT_SIGNING_CONFIG = 'JWT_SECRET="correct-horse-battery-staple-jwt-secret-phrase-here"'
export const OVERLAPPING_JWT_SIGNING = 'JWT_SECRET="myprefix_' + GITHUB_PAT + '_mysuffix"'
// Header: {"alg":"HS256","typ":"JWT"} -> eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9
// Anon: {"role":"anon","iss":"supabase"} -> eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIn0
// Service Role: {"role":"service_role","iss":"supabase"} -> eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UifQ
export const SUPABASE_ANON_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIn0.dummySignatureStringForTesting123456'
export const SUPABASE_SERVICE_ROLE_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UifQ.dummySignatureStringForTesting123456'
export const UNAUTHENTICATED_ANON_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.dummySig1234567890'
export const UNAUTHENTICATED_SERVICE_ROLE_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.dummySig1234567890'
export const BARE_SHORT_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNdfw'
export const GENERIC_OPAQUE_SK = 'sk-abcdefghijklmnopqrst'

// 11. Supabase Prefixes
export const SUPABASE_PUBLISHABLE = 'sb_publishable_' + '51OuEMLAlTWGaDypq4P5cuDHbuKe'
export const SUPABASE_SECRET = 'sb_secret_' + '51OuEMLAlTWGaDypq4P5cuDHbuKe'
export const SUPABASE_PAT = 'sbp_' + '51OuEMLAlTWGaDypq4P5cuDHbuKe'

// 12. Generic High Entropy
export const GENERIC_SECRET_ASSIGNMENT = 'api_secret = "dK8#mP2$vL9*xQ5&zR1!tY7^wE3~sB0+"'

// 13. Placeholders
export const PLACEHOLDER_KEY = 'YOUR_API_KEY_HERE'
export const PLACEHOLDER_ANGLE = '<api_key>'
export const PLACEHOLDER_ENV_INTERP = '${API_KEY}'
export const PLACEHOLDER_PROCESS_ENV = 'process.env.GITHUB_TOKEN'
export const PLACEHOLDER_REPEATED_GH = 'ghp_' + 'x'.repeat(36)
