import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { hasAnalyticsConsent, setAnalyticsConsent, trackPage, trackProfileCreated, trackPetAdopted, trackSessionCompleted, trackSessionStart } from '@/shared/analytics'

const fetchMock = vi.fn(async (_url: string): Promise<Response> => new Response('{}'))

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.stubGlobal('fetch', fetchMock)
  Object.defineProperty(navigator, 'doNotTrack', { value: '0', configurable: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
  sessionStorage.clear()
})

describe('anonymous analytics', () => {
  it('defaults to on, and can be explicitly turned off', () => {
    expect(hasAnalyticsConsent()).toBe(true)
    trackPage('home')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    setAnalyticsConsent(false)
    expect(hasAnalyticsConsent()).toBe(false)
    fetchMock.mockClear()
    trackPage('home')
    expect(fetchMock).not.toHaveBeenCalled()
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

  it('counts one session per browser tab per day', () => {
    setAnalyticsConsent(true)
    trackSessionStart()
    trackSessionStart()
    const urls = fetchMock.mock.calls.map(([url]) => String(url))
    expect(urls.filter((url) => url.includes('/visit-session-total')).length).toBe(1)
    expect(urls.filter((url) => /\/visit-session-\d{4}-\d{2}-\d{2}/.test(url)).length).toBe(1)
  })

  it('tracks each adopted pet once per profile', () => {
    setAnalyticsConsent(true)
    trackPetAdopted('companion-cat', 'p1')
    trackPetAdopted('companion-cat', 'p1')
    const urls = fetchMock.mock.calls.map(([url]) => String(url))
    expect(urls.filter((url) => url.endsWith('/pet-adopted-total')).length).toBe(1)
    expect(urls.filter((url) => url.endsWith('/pet-adopted-companion-cat')).length).toBe(1)
  })

  it('respects Do Not Track even after consent', () => {
    setAnalyticsConsent(true)
    Object.defineProperty(navigator, 'doNotTrack', { value: '1', configurable: true })
    trackPage('home')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
