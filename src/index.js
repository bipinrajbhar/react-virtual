import React from 'react'

import useRect from './useRect'
import useIsomorphicLayoutEffect from './useIsomorphicLayoutEffect'
import { requestTimeout, cancelTimeout } from './timer'

const defaultEstimateSize = () => 50
const defaultKeyExtractor = index => index

const ResetScrollingTimeoutDelay = 200

export function useVirtual({
  size = 0,
  estimateSize = defaultEstimateSize,
  overscan = 1,
  paddingStart = 0,
  paddingEnd = 0,
  parentRef,
  horizontal,
  scrollToFn,
  useObserver,
  onScrollElement,
  scrollOffsetFn,
  keyExtractor = defaultKeyExtractor,
}) {
  const sizeKey = horizontal ? 'width' : 'height'
  const scrollKey = horizontal ? 'scrollLeft' : 'scrollTop'
  const latestRef = React.useRef({})
  const useMeasureParent = useObserver || useRect

  const isMountedRef = React.useRef(false)

  useIsomorphicLayoutEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const { [sizeKey]: outerSize } = useMeasureParent(parentRef) || {
    [sizeKey]: 0,
  }

  const defaultScrollToFn = React.useCallback(
    offset => {
      if (parentRef.current) {
        parentRef.current[scrollKey] = offset
      }
    },
    [parentRef, scrollKey]
  )

  const resolvedScrollToFn = scrollToFn || defaultScrollToFn

  scrollToFn = React.useCallback(
    offset => {
      resolvedScrollToFn(offset, defaultScrollToFn)
    },
    [defaultScrollToFn, resolvedScrollToFn]
  )

  const [measuredCache, setMeasuredCache] = React.useState({})

  const measure = React.useCallback(() => setMeasuredCache({}), [])

  const mountedEstimateSizeRef = React.useRef(false)

  useIsomorphicLayoutEffect(() => {
    if (mountedEstimateSizeRef.current) {
      if (estimateSize) {
        setMeasuredCache({})
      }
    }
    mountedEstimateSizeRef.current = true
  }, [estimateSize])

  const measurements = React.useMemo(() => {
    const measurements = []
    for (let i = 0; i < size; i++) {
      const measuredSize = measuredCache[keyExtractor(i)]
      const start = measurements[i - 1] ? measurements[i - 1].end : paddingStart
      const size =
        typeof measuredSize === 'number' ? measuredSize : estimateSize(i)
      const end = start + size
      measurements[i] = { index: i, start, size, end }
    }
    return measurements
  }, [estimateSize, measuredCache, paddingStart, size, keyExtractor])

  const totalSize = (measurements[size - 1]?.end || 0) + paddingEnd

  latestRef.current.overscan = overscan
  latestRef.current.measurements = measurements
  latestRef.current.outerSize = outerSize
  latestRef.current.totalSize = totalSize

  const [isScrolling, setIsScrolling] = React.useState(false)
  const scrollingIdRef = React.useRef(null)
  const debouncedResetScrollingRef = React.useRef(() => {
    if (scrollingIdRef.current !== null) {
      cancelTimeout(scrollingIdRef.current)
    }

    scrollingIdRef.current = requestTimeout(() => {
      scrollingIdRef.current = null

      if (isMountedRef.current) {
        setIsScrolling(false)
      }
    }, ResetScrollingTimeoutDelay)
  })
  const [range, setRange] = React.useState({ start: 0, end: 0 })

  const element = onScrollElement ? onScrollElement.current : parentRef.current

  const scrollOffsetFnRef = React.useRef(scrollOffsetFn)
  scrollOffsetFnRef.current = scrollOffsetFn

  useIsomorphicLayoutEffect(() => {
    if (!element) {
      setRange({ start: 0, end: 0 })
      latestRef.current.scrollOffset = undefined

      return
    }

    const onScroll = event => {
      const scrollOffset = scrollOffsetFnRef.current
        ? scrollOffsetFnRef.current(event)
        : element[scrollKey]
      latestRef.current.scrollOffset = scrollOffset

      if (event) {
        setIsScrolling(true)
        debouncedResetScrollingRef.current()
      }
      setRange(prevRange => calculateRange(latestRef.current, prevRange))
    }

    // Determine initially visible range
    onScroll()

    element.addEventListener('scroll', onScroll, {
      capture: false,
      passive: true,
    })

    return () => {
      element.removeEventListener('scroll', onScroll)
    }
  }, [element, scrollKey, size, outerSize])

  useIsomorphicLayoutEffect(() => {
    if (!isScrolling && latestRef.current.scrollOffset !== undefined) {
      setRange(prevRange => calculateRange(latestRef.current, prevRange))
    }
  }, [isScrolling, measurements])

  const virtualItems = React.useMemo(() => {
    const virtualItems = []
    const end = Math.min(range.end, measurements.length - 1)

    for (let i = range.start; i <= end; i++) {
      const measurement = measurements[i]

      const item = {
        ...measurement,
        measureRef: el => {
          const { scrollOffset } = latestRef.current

          if (el) {
            const { [sizeKey]: measuredSize } = el.getBoundingClientRect()

            if (measuredSize !== item.size) {
              if (item.start < scrollOffset) {
                defaultScrollToFn(scrollOffset + (measuredSize - item.size))
              }

              setMeasuredCache(old => ({
                ...old,
                [keyExtractor(i)]: measuredSize,
              }))
            }
          }
        },
      }

      virtualItems.push(item)
    }

    return virtualItems
  }, [
    range.start,
    range.end,
    measurements,
    sizeKey,
    defaultScrollToFn,
    keyExtractor,
  ])

  const scrollToOffset = React.useCallback(
    (toOffset, { align = 'start' } = {}) => {
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
        scrollToFn(toOffset)
      } else if (align === 'end') {
        scrollToFn(toOffset - outerSize)
      } else if (align === 'center') {
        scrollToFn(toOffset - outerSize / 2)
      }
    },
    [scrollToFn]
  )

  const tryScrollToIndex = React.useCallback(
    (index, { align = 'auto', ...rest } = {}) => {
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

      scrollToOffset(toOffset, { align, ...rest })
    },
    [scrollToOffset, size]
  )

  const scrollToIndex = React.useCallback(
    (...args) => {
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
    [tryScrollToIndex]
  )

  return {
    virtualItems,
    totalSize,
    scrollToOffset,
    scrollToIndex,
    measure,
    isScrolling,
  }
}

const findNearestBinarySearch = (low, high, getCurrentValue, value) => {
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

function calculateRange(
  { overscan, measurements, outerSize, scrollOffset },
  prevRange
) {
  const size = measurements.length - 1
  const getOffset = index => measurements[index].start

  let start = findNearestBinarySearch(0, size, getOffset, scrollOffset)
  let end = start

  while (end < size && measurements[end].end < scrollOffset + outerSize) {
    end++
  }

  start = Math.max(start - overscan, 0)
  end = Math.min(end + overscan, size)

  if (!prevRange || prevRange.start !== start || prevRange.end !== end) {
    return { start, end }
  }

  return prevRange
}
