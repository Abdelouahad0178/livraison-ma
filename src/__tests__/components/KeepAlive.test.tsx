// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useEffect, useState } from 'react'
import KeepAlive from '../../components/KeepAlive'

let renders = 0
let mounts = 0
function Counter({ label }: { label: string }) {
  renders++
  const [n, setN] = useState(0)
  useEffect(() => { mounts++ }, [])
  return <button onClick={() => setN(v => v + 1)}>{label} {n}</button>
}

function Page({ tab, tick }: { tab: string; tick: number }) {
  return (
    <>
      <KeepAlive active={tab === 'a'} visited><Counter label={`A${tick}`} /></KeepAlive>
      <KeepAlive active={tab === 'b'} visited={false}><span>onglet B</span></KeepAlive>
    </>
  )
}

describe('KeepAlive', () => {
  it('garde l’état de l’onglet caché, ne le redessine pas, ne le remonte pas', async () => {
    renders = 0; mounts = 0
    const { rerender } = render(<Page tab="a" tick={0} />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button').textContent).toBe('A0 2')
    expect(screen.queryByText('onglet B')).toBeNull() // jamais ouvert : rien de monté

    await act(async () => { rerender(<Page tab="b" tick={1} />) })
    const rendersWhileHidden = renders
    await act(async () => { rerender(<Page tab="b" tick={2} />) })
    expect(renders).toBe(rendersWhileHidden) // gelé : aucun nouveau rendu pendant qu'il est caché
    expect(screen.getByText('onglet B')).toBeTruthy()

    await act(async () => { rerender(<Page tab="a" tick={3} />) })
    expect(screen.getByRole('button').textContent).toBe('A3 2') // état conservé (2 clics), données à jour
    expect(mounts).toBe(1) // jamais remonté : aucun chargement relancé
  })
})
