import { describe, it, expect } from 'vitest'
import { sendOk, sendCreated, sendNoContent, sendError } from './response.js'

// Mock Fastify reply
function mockReply() {
  const request = { traceId: 'test-trace-id' }
  const reply: Record<string, unknown> = {
    _status: 200,
    _payload: undefined,
    request,
    status(code: number) { reply._status = code; return reply },
    send(payload?: unknown) { reply._payload = payload; return reply },
    header(_key: string, _value: string) { return reply },
  }
  return reply as unknown as import('fastify').FastifyReply & { _status: number; _payload: unknown }
}

describe('Response Helpers', () => {
  it('sendOk returns 200 with data', () => {
    const reply = mockReply()
    sendOk(reply, { id: 1 })
    expect(reply._status).toBe(200)
    expect(reply._payload).toEqual({ ok: true, data: { id: 1 }, traceId: 'test-trace-id' })
  })

  it('sendCreated returns 201 with data', () => {
    const reply = mockReply()
    sendCreated(reply, { id: 2 })
    expect(reply._status).toBe(201)
    expect(reply._payload).toEqual({ ok: true, data: { id: 2 }, traceId: 'test-trace-id' })
  })

  it('sendNoContent returns 204', () => {
    const reply = mockReply()
    sendNoContent(reply)
    expect(reply._status).toBe(204)
  })

  it('sendError returns error response with custom status', () => {
    const reply = mockReply()
    sendError(reply, 404, 'NOT_FOUND', 'Resource not found')
    expect(reply._status).toBe(404)
    expect(reply._payload).toEqual({ ok: false, error: { code: 'NOT_FOUND', message: 'Resource not found' }, traceId: 'test-trace-id' })
  })
})
