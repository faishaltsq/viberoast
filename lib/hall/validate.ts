import { hallCaseSchema, hallFindingSchema, type HallCase, type HallFinding } from './types'

export function validateHallCase(input: unknown): HallCase {
  return hallCaseSchema.parse(input)
}

export function validateHallFinding(input: unknown): HallFinding {
  return hallFindingSchema.parse(input)
}
