import { describe, it, expect } from '@jest/globals'
import { ownsFile } from './fileOwnership.js'

describe('ownsFile — fail-closed file ownership', () => {
  it('allows the matching owner', () => {
    expect(ownsFile({ userId: 'user_abc' }, 'user_abc')).toBe(true)
  })
  it('denies a different user', () => {
    expect(ownsFile({ userId: 'user_abc' }, 'user_xyz')).toBe(false)
  })
  it('denies when the file has no stored owner (legacy/undefined) — no more inert pass', () => {
    expect(ownsFile({ userId: undefined }, 'user_abc')).toBe(false)
    expect(ownsFile({ userId: null }, 'user_abc')).toBe(false)
    expect(ownsFile({}, 'user_abc')).toBe(false)
  })
  it('denies when the caller id is missing (undefined must NOT match a legacy undefined file)', () => {
    expect(ownsFile({ userId: undefined }, undefined)).toBe(false)
    expect(ownsFile({ userId: null }, null)).toBe(false)
    expect(ownsFile({ userId: 'user_abc' }, undefined)).toBe(false)
  })
  it('denies when metadata is missing entirely', () => {
    expect(ownsFile(null, 'user_abc')).toBe(false)
    expect(ownsFile(undefined, 'user_abc')).toBe(false)
  })
  it('denies empty-string ids on either side', () => {
    expect(ownsFile({ userId: '' }, '')).toBe(false)
    expect(ownsFile({ userId: 'user_abc' }, '')).toBe(false)
  })
})
