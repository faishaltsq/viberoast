import 'server-only'

import { hallExamples } from './examples'
import { sanitizeHallCase } from './sanitize'
import type { HallCase } from './types'

export function loadHallCases(): HallCase[] {
  return hallExamples.map(sanitizeHallCase)
}
