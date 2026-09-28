/* F14: with Cloud Run --max-instances 1, a process exit on one unhandled
 * rejection takes the whole service down for every user. A rejection is now
 * logged and the process keeps serving. (An uncaught exception still exits:
 * after one, process state is undefined.) */
import { describe, it, expect, jest, afterEach } from '@jest/globals'
import { onUnhandledRejection } from './errorHandler.js'

afterEach(() => jest.restoreAllMocks())

describe('unhandledRejection', () => {
  it('is handled by the registered listener', () => {
    expect(process.listeners('unhandledRejection')).toContain(onUnhandledRejection)
  })
  it('logs and does not exit', () => {
    const exit = jest.spyOn(process, 'exit').mockImplementation(() => {})
    const logged = []
    jest.spyOn(console, 'error').mockImplementation((...a) => logged.push(a.map(String).join(' ')))
    onUnhandledRejection(new Error('db timeout sk-proj-abcdefghijklmnop123'), Promise.resolve())
    expect(exit).not.toHaveBeenCalled()
    expect(logged.join('\n')).toContain('db timeout')
    expect(logged.join('\n')).not.toContain('abcdefghijklmnop')
  })
})
