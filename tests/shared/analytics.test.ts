import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { hasAnalyticsConsent, setAnalyticsConsent, trackPage, trackProfileCreated, trackSessionCompleted } from '@/shared/analytics'

const fetchMock = vi.fn(async (_url: string): Promise<Response> => new Response('{}'))

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('fetch', fetchMock)
  Object.defineProperty(navigator, 'doNotTrack', { value: '0', configurable: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('anonymous analytics', () => {
  it('sends nothing until the parent opts in', () => {
    trackPage('home')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(hasAnalyticsConsent()).toBe(false)
  })

  it('sends only coarse counters after consent', () => {
    setAnalyticsConsent(true)
    trackProfileCreated(1, 'dinosaur')
    trackSessionCompleted(1, 'dinosaur')
    trackPage('home')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const urls = fetchMock.mock.calls.map(([url]) => String(url))
    expect(urls.some((url) => url.endsWith('/profile-created-g1-dinosaur'))).toBe(true)
    expect(urls.some((url) => url.endsWith('/session-completed-g1-dinosaur'))).toBe(true)
    expect(urls.some((url) => url.endsWith('/page-home'))).toBe(true)
    expect(urls.join(' ')).not.toContain('小深')
    expect(urls.join(' ')).not.toContain('session=')
  })

  it('respects Do Not Track even after consent', () => {
    setAnalyticsConsent(true)
    Object.defineProperty(navigator, 'doNotTrack', { value: '1', configurable: true })
    trackPage('home')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
