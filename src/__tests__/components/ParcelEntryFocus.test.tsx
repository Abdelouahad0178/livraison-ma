// @vitest-environment jsdom
import { useRef } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useParcelEntryFocus } from '../../pages/agent/hooks/useParcelEntryFocus'

function Entry() {
  const input = useRef<HTMLInputElement>(null)
  useParcelEntryFocus(input)
  return <><header><button>Expéditions</button></header><form><input ref={input} aria-label="N° EXP" /><input aria-label="Expéditeur" /></form></>
}
beforeEach(() => { vi.useFakeTimers(); Element.prototype.scrollIntoView = vi.fn() })
afterEach(() => { cleanup(); vi.useRealTimers() })

it('initially focuses the shipment number and preserves an explicit new-entry request', () => {
  render(<Entry />)
  act(() => vi.advanceTimersByTime(60))
  expect(screen.getByRole('textbox', { name: 'N° EXP' })).toHaveFocus()
  fireEvent.pointerDown(screen.getByRole('textbox', { name: 'Expéditeur' }))
  screen.getByRole('textbox', { name: 'Expéditeur' }).focus()
  act(() => vi.advanceTimersByTime(1800))
  expect(screen.getByRole('textbox', { name: 'Expéditeur' })).toHaveFocus()
  screen.getByRole('button').focus()
  act(() => window.dispatchEvent(new Event('focus-nexp')))
  act(() => vi.advanceTimersByTime(60))
  expect(screen.getByRole('textbox', { name: 'N° EXP' })).toHaveFocus()
})
it('does not steal the focus back from header navigation or keyboard interaction', () => {
  const view = render(<Entry />)
  const button = screen.getByRole('button')
  fireEvent.pointerDown(button)
  button.focus()
  act(() => vi.advanceTimersByTime(2000))
  expect(button).toHaveFocus()
  act(() => window.dispatchEvent(new Event('focus-nexp')))
  fireEvent.keyDown(button, { key: 'Tab' })
  act(() => vi.advanceTimersByTime(2000))
  expect(button).toHaveFocus()
  view.unmount()
  expect(vi.getTimerCount()).toBe(0)
})
