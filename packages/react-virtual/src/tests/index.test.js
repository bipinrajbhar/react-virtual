import '@testing-library/jest-dom'
import * as React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { renderHook, act } from '@testing-library/react-hooks'
import { useVirtual as useVirtualImpl } from '../index'

function List({
  size = 200,
  overscan,
  height = 200,
  width = 200,
  onRef,
  parentRef,
  useVirtual,
  rangeExtractor,
}) {
  const rowVirtualizer = useVirtual({
    size,
    parentRef,
    overscan,
    useObserver: () => ({ height, width }),
    rangeExtractor,
  })

  return (
    <>
      <div
        ref={parentRef}
        style={{
          height,
          width,
          overflow: 'auto',
        }}
      >
        <div
          style={{
            height: `${rowVirtualizer.totalSize}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.virtualItems.map((virtualRow) => (
            <div
              key={virtualRow.index}
              ref={onRef ? onRef(virtualRow) : undefined}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
                height: `${virtualRow.size}px`,
              }}
            >
              Row {virtualRow.index}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

describe('useVirtual list', () => {
  let useVirtual, parentRef, props

  beforeEach(() => {
    parentRef = React.createRef()
    useVirtual = jest.fn((props) => useVirtualImpl(props))

    props = { parentRef, useVirtual }
  })

  it('should render', () => {
    render(<List {...props} />)

    expect(screen.queryByText('Row 0')).toBeInTheDocument()
    expect(screen.queryByText('Row 4')).toBeInTheDocument()
    expect(screen.queryByText('Row 5')).not.toBeInTheDocument()

    expect(useVirtual).toHaveBeenCalledTimes(3)
  })
  it('should render with overscan', () => {
    render(<List {...props} overscan={0} />)

    expect(screen.queryByText('Row 0')).toBeInTheDocument()
    expect(screen.queryByText('Row 3')).toBeInTheDocument()
    expect(screen.queryByText('Row 4')).not.toBeInTheDocument()

    expect(useVirtual).toHaveBeenCalledTimes(3)
  })
  it('should render given dynamic size', async () => {
    const onRef = (virtualRow) => (el) => {
      if (el) {
        jest.spyOn(el, 'offsetHeight', 'get').mockImplementation(() => 25)
      }
      virtualRow.measureRef(el)
    }

    render(<List {...props} onRef={onRef} />)

    expect(screen.queryByText('Row 0')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Row 8')).toBeInTheDocument())
    expect(screen.queryByText('Row 9')).not.toBeInTheDocument()

    expect(useVirtual).toHaveBeenCalledTimes(5)
  })
  it('should render given dynamic size after scroll', async () => {
    const onRef = (virtualRow) => (el) => {
      if (el) {
        jest.spyOn(el, 'offsetHeight', 'get').mockImplementation(() => 25)
      }
      virtualRow.measureRef(el)
    }

    render(<List {...props} onRef={onRef} />)

    expect(screen.queryByText('Row 0')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Row 8')).toBeInTheDocument())
    expect(screen.queryByText('Row 9')).not.toBeInTheDocument()

    fireEvent.scroll(parentRef.current, { target: { scrollTop: 75 } })

    expect(screen.queryByText('Row 1')).not.toBeInTheDocument()
    expect(screen.queryByText('Row 2')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByText('Row 11')).toBeInTheDocument(),
    )
    expect(screen.queryByText('Row 12')).not.toBeInTheDocument()
  })
  it('should use rangeExtractor', () => {
    render(<List {...props} rangeExtractor={() => [0, 1]} />)

    expect(screen.queryByText('Row 0')).toBeInTheDocument()
    expect(screen.queryByText('Row 1')).toBeInTheDocument()
    expect(screen.queryByText('Row 2')).not.toBeInTheDocument()
  })
  it('should allow to provide useScroll', () => {
    let scrollOffset = 0
    const scrollToFn = jest.fn((offset) => {
      scrollOffset = offset
    })
    const { result, rerender } = renderHook(() =>
      useVirtualImpl({
        size: 100,
        parentRef: React.useRef(null),
        overscan: 0,
        estimateSize: React.useCallback(() => 50, []),
        useScroll: () => ({ outerSize: 200, scrollOffset, scrollToFn }),
      }),
    )
    expect(result.current.virtualItems.length).toBe(4)
    expect(result.current.virtualItems[3].index).toBe(3)
    act(() => {
      result.current.scrollToIndex(5)
    })
    expect(scrollToFn).toHaveBeenCalledTimes(1)
    rerender()
    expect(result.current.virtualItems[3].index).toBe(5)
  })
  it('should allow to pass a window', () => {
    const { result } = renderHook(() =>
      useVirtualImpl({
        size: 100,
        parentRef: React.useRef(document.createElement('div')),
        windowRef: React.useRef(window),
        useWindowObserver: () => ({ height: 200, width: '100%' }),
        overscan: 0,
        estimateSize: React.useCallback(() => 50, []),
      }),
    )
    expect(result.current.virtualItems.length).toBe(4)
  })
  it('should handle scroll in window mode', () => {
    const { result } = renderHook(() =>
      useVirtualImpl({
        size: 100,
        parentRef: React.useRef(document.createElement('div')),
        windowRef: React.useRef(window),
        useWindowObserver: () => ({ height: 200, width: '100%' }),
        overscan: 0,
        estimateSize: React.useCallback(() => 50, []),
      }),
    )
    expect(result.current.virtualItems[0].index).toBe(0)
    act(() => {
      fireEvent.scroll(window, { target: { scrollY: 100 } })
    })
    expect(result.current.virtualItems[0].index).toBe(2)
  })
})
