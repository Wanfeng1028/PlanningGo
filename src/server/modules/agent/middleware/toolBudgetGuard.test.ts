import { describe, it, expect } from 'vitest'
import {
  checkToolBudget,
  getRemainingBudget,
  isBudgetExhausted,
  ToolBudgetExceededError,
} from './toolBudgetGuard.js'
import type { ToolBudget, ToolCallPlan } from '../../tools/types.js'

const defaultBudget: ToolBudget = {
  maxToolCalls: 10,
  maxToolRounds: 3,
  maxParallelCalls: 4,
  maxTotalLatencyMs: 30000,
  maxAmapCalls: 8,
  maxLlmCalls: 5,
}

const sampleToolCall: ToolCallPlan = { tool: 'search_poi', input: {} }

describe('checkToolBudget', () => {
  it('should pass when within budget', () => {
    expect(() => checkToolBudget(sampleToolCall, defaultBudget, 5, 1)).not.toThrow()
  })

  it('should throw when tool calls exceeded', () => {
    expect(() => checkToolBudget(sampleToolCall, defaultBudget, 10, 1))
      .toThrow(ToolBudgetExceededError)
  })

  it('should throw when tool rounds exceeded', () => {
    expect(() => checkToolBudget(sampleToolCall, defaultBudget, 5, 3))
      .toThrow(ToolBudgetExceededError)
  })

  it('should throw at exact boundary for calls', () => {
    expect(() => checkToolBudget(sampleToolCall, defaultBudget, 10, 0))
      .toThrow('Tool call budget exceeded: 10/10')
  })

  it('should throw at exact boundary for rounds', () => {
    expect(() => checkToolBudget(sampleToolCall, defaultBudget, 0, 3))
      .toThrow('Tool round budget exceeded: 3/3')
  })

  it('should pass at boundary - 1', () => {
    expect(() => checkToolBudget(sampleToolCall, defaultBudget, 9, 2)).not.toThrow()
  })
})

describe('getRemainingBudget', () => {
  it('should return remaining calls and rounds', () => {
    const remaining = getRemainingBudget(defaultBudget, 3, 1)
    expect(remaining.maxToolCalls).toBe(7)
    expect(remaining.maxToolRounds).toBe(2)
  })

  it('should return 0 when over budget', () => {
    const remaining = getRemainingBudget(defaultBudget, 15, 5)
    expect(remaining.maxToolCalls).toBe(0)
    expect(remaining.maxToolRounds).toBe(0)
  })

  it('should preserve non-decremented fields', () => {
    const remaining = getRemainingBudget(defaultBudget, 0, 0)
    expect(remaining.maxParallelCalls).toBe(4)
    expect(remaining.maxTotalLatencyMs).toBe(30000)
    expect(remaining.maxAmapCalls).toBe(8)
    expect(remaining.maxLlmCalls).toBe(5)
  })
})

describe('isBudgetExhausted', () => {
  it('should return false when budget available', () => {
    expect(isBudgetExhausted(defaultBudget, 5, 1)).toBe(false)
  })

  it('should return true when calls exhausted', () => {
    expect(isBudgetExhausted(defaultBudget, 10, 1)).toBe(true)
  })

  it('should return true when rounds exhausted', () => {
    expect(isBudgetExhausted(defaultBudget, 5, 3)).toBe(true)
  })
})
