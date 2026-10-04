import { afterEach, describe, expect, it, vi } from 'vitest'
import { read, write } from 'xlsx'
import { loadExcel } from './loadExcel'

afterEach(() => {
  vi.doUnmock('xlsx')
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('Excel on demand', () => {
  it('preserves exported values in an actual Excel workbook', async () => {
    const XLSX = await loadExcel()
    expect(XLSX).not.toBeNull()
    if (!XLSX) throw new Error('Excel did not load')
    const values = [{ tracking: 'BG123456', price: 125.5, status: 'Delivered' }]
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(values), 'Expeditions')
    const bytes = write(workbook, { type: 'array', bookType: 'xlsx' })
    const readBack = read(bytes, { type: 'array' })
    expect(XLSX.utils.sheet_to_json(readBack.Sheets.Expeditions)).toEqual(values)
  })

  it('reports a loading failure without an unhandled rejection', async () => {
    vi.doMock('xlsx', () => { throw new Error('Offline') })
    const alertMock = vi.fn()
    vi.stubGlobal('alert', alertMock)
    const { loadExcel: failingLoad } = await import('./loadExcel')
    expect(await failingLoad()).toBeNull()
    expect(alertMock).toHaveBeenCalledOnce()
  })
})
