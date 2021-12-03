import * as React from 'react'
import observeRect from '@reach/observe-rect'
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect'

type Key = number | string

interface Rect {
  width: number
  height: number
}

type ScrollAlignment = 'start' | 'center' | 'end' | 'auto'

interface ScrollToOptions {
  align: ScrollAlignment
}

interface ScrollToOffsetOptions extends ScrollToOptions {}

interface ScrollToIndexOptions extends ScrollToOptions {}

type ScrollReason = 'ToIndex' | 'ToOffset' | 'SizeChanged'

interface Measurement {
  key: Key
  index: number
  start: number
  end: number
  size: number
}

export interface VirtualItem extends Measurement {
  measureRef: (el: HTMLElement | null) => void
}

const defaultEstimateSize = () => 50

const defaultKeyExtractor = (index: number) => index

const defaultMeasureSize = (el: HTMLElement, horizontal: boolean) => {
  const key = horizontal ? 'offsetWidth' : 'offsetHeight'

  return el[key]
}

export interface Range {
  start: number
  end: number
  overscan: number
  size: number
}

export const defaultRangeExtractor = (range: Range) => {
  const start = Math.max(range.start - range.overscan, 0)
  const end = Math.min(range.end + range.overscan, range.size - 1)

  const arr = []

  for (let i = start; i <= end; i++) {
    arr.push(i)
  }

  return arr
}

export const useRect = (
  parentRef: React.RefObject<HTMLElement>,
  initialRect: Rect = { width: 0, height: 0 },
) => {
  const [element, setElement] = React.useState<HTMLElement | null>(
    parentRef.current,
  )
  const [rect, setRect] = React.useState<Rect>(initialRect)

  useIsomorphicLayoutEffect(() => {
    setElement(parentRef.current)
  })

  React.useEffect(() => {
    if (!element) {
      return
    }

    const update = (next: Rect) => {
      setRect((prev) =>
        prev.height !== next.height || prev.width !== next.width ? next : prev,
      )
    }
    const observer = observeRect(element, update)

    observer.observe()

    // initial rect
    update(element.getBoundingClientRect())

    return () => {
      observer.unobserve()
    }
  }, [element])

  return rect
}

export const useElementScroll = <T extends HTMLElement>({
  parentRef,
  horizontal,
  useObserver,
  initialRect,
}: {
  parentRef: React.RefObject<T>
  horizontal?: boolean
  useObserver?: (ref: React.RefObject<T>, initialRect?: Rect) => Rect
  initialRect?: Rect
}) => {
  const scrollKey = horizontal ? 'scrollLeft' : 'scrollTop'
  const [scrollOffset, setScrollOffset] = React.useState(0)
  const [element, setElement] = React.useState(parentRef.current)

  useIsomorphicLayoutEffect(() => {
    setElement(parentRef.current)
  })

  useIsomorphicLayoutEffect(() => {
    if (!element) {
      setScrollOffset(0)

      return
    }

    const onScroll = () => {
      setScrollOffset(element[scrollKey])
    }

    onScroll()

    element.addEventListener('scroll', onScroll, {
      capture: false,
      passive: true,
    })

    return () => {
      element.removeEventListener('scroll', onScroll)
    }
  }, [element, scrollKey])

  const scrollToFn = React.useCallback(
    (offset: number) => {
      if (parentRef.current) {
        parentRef.current[scrollKey] = offset
      }
    },
    [parentRef, scrollKey],
  )

  const useMeasureParent = useObserver || useRect

  const sizeKey = horizontal ? 'width' : 'height'

  const { [sizeKey]: outerSize } = useMeasureParent(parentRef, initialRect)

  return {
    outerSize,
    scrollOffset,
    scrollToFn,
  }
}

export const useWindowRect = (
  windowRef: React.RefObject<Window>,
  initialRect: Rect = { width: 0, height: 0 },
) => {
  const [rect, setRect] = React.useState<Rect>(initialRect)
  const [element, setElement] = React.useState<Window | null>(windowRef.current)

  useIsomorphicLayoutEffect(() => {
    setElement(windowRef.current)
  })

  useIsomorphicLayoutEffect(() => {
    if (!element) {
      return
    }

    function resizeHandler() {
      if (!element) {
        return
      }

      const next = {
        width: element.innerWidth,
        height: element.innerHeight,
      }

      setRect((prev) =>
        prev.height !== next.height || prev.width !== next.width ? next : prev,
      )
    }
    resizeHandler()

    element.addEventListener('resize', resizeHandler)

    return () => {
      element.removeEventListener('resize', resizeHandler)
    }
  }, [element])

  return rect
}

export const useWindowScroll = <T extends HTMLElement>({
  windowRef,
  parentRef,
  horizontal,
  useWindowObserver,
  initialRect,
}: {
  parentRef: React.RefObject<T>
  windowRef: React.RefObject<Window>
  horizontal?: boolean
  useObserver?: (ref: React.RefObject<T>, initialRect?: Rect) => Rect
  useWindowObserver?: (ref: React.RefObject<Window>, initialRect?: Rect) => Rect
  initialRect?: Rect
}) => {
  const [scrollOffset, setScrollOffset] = React.useState<number>(0)
  const [element, setElement] = React.useState<Window | null>(windowRef.current)

  const parentOffsetRef = React.useRef(0)

  const rectKey = horizontal ? 'left' : 'top'
  const scrollKey = horizontal ? 'scrollX' : 'scrollY'

  useIsomorphicLayoutEffect(() => {
    setElement(windowRef.current)
  })

  useIsomorphicLayoutEffect(() => {
    if (!element) {
      parentOffsetRef.current = 0
      setScrollOffset(0)

      return
    }

    if (parentRef.current) {
      parentOffsetRef.current =
        element[scrollKey] + parentRef.current.getBoundingClientRect()[rectKey]
    }

    const onScroll = () => {
      const offset = element[scrollKey] - parentOffsetRef.current
      setScrollOffset(offset)
    }

    onScroll()

    element.addEventListener('scroll', onScroll, {
      capture: false,
      passive: true,
    })

    return () => {
      element.removeEventListener('scroll', onScroll)
    }
  }, [element, scrollKey, rectKey, parentRef])

  const scrollToFn = React.useCallback(
    (offset: number, reason: ScrollReason) => {
      if (windowRef.current) {
        const delta = ['ToIndex', 'SizeChanged'].includes(reason)
          ? parentOffsetRef.current
          : 0

        windowRef.current.scrollTo({ [rectKey]: offset + delta })
      }
    },
    [windowRef, rectKey],
  )

  const useMeasureParent = useWindowObserver || useWindowRect

  const sizeKey = horizontal ? 'width' : 'height'

  const { [sizeKey]: outerSize } = useMeasureParent(windowRef, initialRect)

  return {
    outerSize,
    scrollOffset,
    scrollToFn,
  }
}

interface ScrollOptions<T> {
  parentRef: React.RefObject<T>
  windowRef?: React.RefObject<Window>
  horizontal?: boolean
  useObserver?: (ref: React.RefObject<T>, initialRect?: Rect) => Rect
  useWindowObserver?: (ref: React.RefObject<Window>, initialRect?: Rect) => Rect
  initialRect?: Rect
}

export const useDefaultScroll = <T extends HTMLElement>(
  options: ScrollOptions<T>,
) => {
  const { parentRef, windowRef } = options

  const useWindow = windowRef !== undefined

  const emptyRef = React.useRef(null)

  const elementRes = useElementScroll({
    ...options,
    parentRef: useWindow ? emptyRef : parentRef,
  })

  const windowRes = useWindowScroll({
    ...options,
    windowRef: useWindow ? windowRef : emptyRef,
  })

  return useWindow ? windowRes : elementRes
}

export interface Options<T> extends ScrollOptions<T> {
  estimateSize?: (index: number) => number
  keyExtractor?: (index: number) => Key
  measureSize?: (el: HTMLElement, horizontal: boolean) => number
  overscan?: number
  paddingEnd?: number
  paddingStart?: number
  rangeExtractor?: (range: Range) => number[]
  scrollToFn?: (
    offset: number,
    defaultScrollToFn?: (offset: number) => void,
  ) => void
  size: number
  useScroll?: (options: ScrollOptions<T>) => {
    outerSize: number
    scrollOffset: number
    scrollToFn: (offset: number, reason: ScrollReason) => void
  }
}

export function useVirtual<T extends HTMLElement>({
  size = 0,
  estimateSize = defaultEstimateSize,
  overscan = 1,
  paddingStart = 0,
  paddingEnd = 0,
  parentRef,
  windowRef,
  horizontal = false,
  scrollToFn,
  useObserver,
  useWindowObserver,
  initialRect,
  keyExtractor = defaultKeyExtractor,
  measureSize = defaultMeasureSize,
  rangeExtractor = defaultRangeExtractor,
  useScroll = useDefaultScroll,
}: Options<T>) {
  const latestRef = React.useRef<{
    scrollOffset: number
    outerSize: number
    measurements: Measurement[]
    totalSize: number
  }>({
    outerSize: 0,
    scrollOffset: 0,
    measurements: [],
    totalSize: 0,
  })

  const {
    outerSize,
    scrollOffset,
    scrollToFn: defaultScrollToFn,
  } = useScroll({
    windowRef,
    parentRef,
    horizontal,
    useObserver,
    useWindowObserver,
    initialRect,
  })

  const scrollOffsetWithAdjustmentsRef = React.useRef(scrollOffset)
  if (latestRef.current.scrollOffset !== scrollOffset) {
    scrollOffsetWithAdjustmentsRef.current = scrollOffset
  }

  latestRef.current.outerSize = outerSize
  latestRef.current.scrollOffset = scrollOffset

  const scrollTo = React.useCallback(
    (offset: number, reason: ScrollReason) => {
      const toFn = (offset: number) => defaultScrollToFn(offset, reason)
      const resolvedScrollToFn = scrollToFn || toFn

      resolvedScrollToFn(offset, toFn)
    },
    [scrollToFn, defaultScrollToFn],
  )

  const [measuredCache, setMeasuredCache] = React.useState<Record<Key, number>>(
    {},
  )

  const measure = React.useCallback(() => setMeasuredCache({}), [])

  const pendingMeasuredCacheIndexesRef = React.useRef<number[]>([])

  const measurements = React.useMemo(() => {
    const min =
      pendingMeasuredCacheIndexesRef.current.length > 0
        ? Math.min(...pendingMeasuredCacheIndexesRef.current)
        : 0
    pendingMeasuredCacheIndexesRef.current = []

    const measurements = latestRef.current.measurements.slice(0, min)

    for (let i = min; i < size; i++) {
      const key = keyExtractor(i)
      const measuredSize = measuredCache[key]
      const start = measurements[i - 1]
        ? measurements[i - 1]!.end
        : paddingStart
      const size =
        typeof measuredSize === 'number' ? measuredSize : estimateSize(i)
      const end = start + size
      measurements[i] = { index: i, start, size, end, key }
    }
    return measurements
  }, [estimateSize, measuredCache, paddingStart, size, keyExtractor])

  const totalSize = (measurements[size - 1]?.end || 0) + paddingEnd

  latestRef.current.measurements = measurements
  latestRef.current.totalSize = totalSize

  const { start, end } = calculateRange(latestRef.current)

  const indexes = React.useMemo(
    () =>
      rangeExtractor({
        start,
        end,
        overscan,
        size,
      }),
    [start, end, overscan, size, rangeExtractor],
  )

  const virtualItems = React.useMemo(() => {
    const virtualItems: VirtualItem[] = []

    for (let k = 0, len = indexes.length; k < len; k++) {
      const i = indexes[k]!
      const measurement = measurements[i]!

      const item = {
        ...measurement,
        measureRef: (el: HTMLElement | null) => {
          if (el) {
            const measuredSize = measureSize(el, horizontal)

            if (measuredSize !== item.size) {
              const { scrollOffset } = latestRef.current

              if (item.start < scrollOffset) {
                const delta = measuredSize - item.size
                scrollOffsetWithAdjustmentsRef.current += delta

                defaultScrollToFn(
                  scrollOffsetWithAdjustmentsRef.current,
                  'SizeChanged',
                )
              }

              pendingMeasuredCacheIndexesRef.current.push(i)

              setMeasuredCache((old) => ({
                ...old,
                [item.key]: measuredSize,
              }))
            }
          }
        },
      }

      virtualItems.push(item)
    }

    return virtualItems
  }, [indexes, defaultScrollToFn, horizontal, measurements, measureSize])

  const mountedRef = React.useRef(false)

  useIsomorphicLayoutEffect(() => {
    if (mountedRef.current) {
      setMeasuredCache({})
    }
    mountedRef.current = true
  }, [estimateSize])

  const scrollToOffset = React.useCallback(
    (
      toOffset: number,
      { align }: ScrollToOffsetOptions = { align: 'start' },
      reason: ScrollReason = 'ToOffset',
    ) => {
      const { scrollOffset, outerSize } = latestRef.current

      if (align === 'auto') {
        if (toOffset <= scrollOffset) {
          align = 'start'
        } else if (toOffset >= scrollOffset + outerSize) {
          align = 'end'
        } else {
          align = 'start'
        }
      }

      if (align === 'start') {
        scrollTo(toOffset, reason)
      } else if (align === 'end') {
        scrollTo(toOffset - outerSize, reason)
      } else if (align === 'center') {
        scrollTo(toOffset - outerSize / 2, reason)
      }
    },
    [scrollTo],
  )

  const tryScrollToIndex = React.useCallback(
    (
      index: number,
      { align, ...rest }: ScrollToIndexOptions = { align: 'auto' },
    ) => {
      const { measurements, scrollOffset, outerSize } = latestRef.current

      const measurement = measurements[Math.max(0, Math.min(index, size - 1))]

      if (!measurement) {
        return
      }

      if (align === 'auto') {
        if (measurement.end >= scrollOffset + outerSize) {
          align = 'end'
        } else if (measurement.start <= scrollOffset) {
          align = 'start'
        } else {
          return
        }
      }

      const toOffset =
        align === 'center'
          ? measurement.start + measurement.size / 2
          : align === 'end'
          ? measurement.end
          : measurement.start

      scrollToOffset(toOffset, { align, ...rest }, 'ToIndex')
    },
    [scrollToOffset, size],
  )

  const scrollToIndex = React.useCallback(
    (...args: [number, ScrollToIndexOptions]) => {
      // We do a double request here because of
      // dynamic sizes which can cause offset shift
      // and end up in the wrong spot. Unfortunately,
      // we can't know about those dynamic sizes until
      // we try and render them. So double down!
      tryScrollToIndex(...args)
      requestAnimationFrame(() => {
        tryScrollToIndex(...args)
      })
    },
    [tryScrollToIndex],
  )

  return {
    virtualItems,
    totalSize,
    scrollToOffset,
    scrollToIndex,
    measure,
  }
}

const findNearestBinarySearch = (
  low: number,
  high: number,
  getCurrentValue: (index: number) => number,
  value: number,
) => {
  while (low <= high) {
    let middle = ((low + high) / 2) | 0
    let currentValue = getCurrentValue(middle)

    if (currentValue < value) {
      low = middle + 1
    } else if (currentValue > value) {
      high = middle - 1
    } else {
      return middle
    }
  }

  if (low > 0) {
    return low - 1
  } else {
    return 0
  }
}

function calculateRange({
  measurements,
  outerSize,
  scrollOffset,
}: {
  measurements: Measurement[]
  outerSize: number
  scrollOffset: number
}) {
  const size = measurements.length - 1
  const getOffset = (index: number) => measurements[index]!.start

  let start = findNearestBinarySearch(0, size, getOffset, scrollOffset)
  let end = start

  while (end < size && measurements[end]!.end < scrollOffset + outerSize) {
    end++
  }

  return { start, end }
}
