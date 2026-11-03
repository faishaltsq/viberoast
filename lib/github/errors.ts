export class GitHubApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly message: string
  ) {
    super(`GitHub API error ${status}: ${message}`)
    this.name = 'GitHubApiError'
  }
}

export class GitHubRateLimitError extends Error {
  readonly retryAfter: number // seconds
  constructor(retryAfter: number = 60) {
    super(`GitHub rate limit exceeded. Retry after ${retryAfter}s.`)
    this.name = 'GitHubRateLimitError'
    this.retryAfter = retryAfter
  }
}
