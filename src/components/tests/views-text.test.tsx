/* @vitest-environment jsdom */

import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const useViewsMock = vi.fn()

vi.mock('@/hooks/useViews', () => ({
  useViews: (options: unknown) => useViewsMock(options),
}))

import { ViewsText } from '@/components/ui/views-text'

describe('ViewsText', () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    useViewsMock.mockReset()
    useViewsMock.mockReturnValue({ count: 99 })
  })

  afterEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
    document.body.innerHTML = ''
  })

  it('renders a provided count without invoking useViews', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(createElement(ViewsText, { count: 42, notation: 'compact' }))
    })

    expect(container.textContent).toContain('42 views')
    expect(useViewsMock).not.toHaveBeenCalled()

    act(() => root.unmount())
    container.remove()
  })
})
