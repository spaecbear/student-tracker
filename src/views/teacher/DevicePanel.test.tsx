import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DevicePanel } from './DevicePanel'

function withStorageManager(manager: unknown) {
  Object.defineProperty(navigator, 'storage', { value: manager, configurable: true })
}

afterEach(() => {
  withStorageManager(undefined)
  vi.restoreAllMocks()
})

describe('DevicePanel', () => {
  it('confirms when storage is protected', async () => {
    withStorageManager({
      persisted: vi.fn().mockResolvedValue(true),
      persist: vi.fn(),
      estimate: vi.fn().mockResolvedValue({ usage: 524_288, quota: 1_073_741_824 }),
    })
    render(<DevicePanel />)

    expect(await screen.findByText('Storage is protected')).toBeInTheDocument()
    expect(screen.getByText(/512 KB/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ask again' })).not.toBeInTheDocument()
  })

  it('warns and offers a retry when the grant was refused', async () => {
    const persist = vi.fn().mockResolvedValue(false)
    withStorageManager({
      persisted: vi.fn().mockResolvedValue(false),
      persist,
      estimate: vi.fn().mockResolvedValue({}),
    })
    const user = userEvent.setup()
    render(<DevicePanel />)

    expect(await screen.findByText('Storage is not protected yet')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ask again' }))
    expect(persist).toHaveBeenCalled()
  })

  it('says so plainly when the browser cannot protect storage', async () => {
    withStorageManager(undefined)
    render(<DevicePanel />)
    expect(await screen.findByText('This browser cannot protect storage')).toBeInTheDocument()
  })
})
