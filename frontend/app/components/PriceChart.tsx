"use client";

import { useEffect, useRef, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Box, Button, Flex } from "@chakra-ui/react";
import { TextDict } from "../translations";

export interface ChartPoint {
  date: string;
  actual?: number | null;
  predicted?: number | null;
}

const ZOOM_STEP = 0.25;
const MIN_VISIBLE_POINTS = 5;

export default function PriceChart({ data, t }: { data: ChartPoint[]; t: TextDict }) {
  const [visibleCount, setVisibleCount] = useState(data.length);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisibleCount(data.length);
  }, [data.length]);

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current?.requestFullscreen();
    }
  }

  function zoomIn() {
    setVisibleCount((c) => Math.max(MIN_VISIBLE_POINTS, Math.round(c * (1 - ZOOM_STEP))));
  }

  function zoomOut() {
    setVisibleCount((c) => Math.min(data.length, Math.round(c * (1 + ZOOM_STEP))));
  }

  function resetZoom() {
    setVisibleCount(data.length);
  }

  const visibleData = data.slice(Math.max(0, data.length - visibleCount));
  const isZoomed = visibleCount < data.length;

  return (
    <Box
      ref={containerRef}
      bg="white"
      height={isFullscreen ? "100vh" : undefined}
      p={isFullscreen ? 6 : 0}
      display={isFullscreen ? "flex" : undefined}
      flexDirection={isFullscreen ? "column" : undefined}
    >
      <Flex justify="flex-end" gap={1} mb={2}>
        <Button
          size="xs"
          onClick={zoomIn}
          disabled={visibleCount <= MIN_VISIBLE_POINTS}
          aria-label={t.chartZoomIn}
        >
          +
        </Button>
        <Button size="xs" onClick={zoomOut} disabled={!isZoomed} aria-label={t.chartZoomOut}>
          −
        </Button>
        {isZoomed && (
          <Button size="xs" onClick={resetZoom} aria-label={t.chartResetZoom}>
            ⤢
          </Button>
        )}
        <Button
          size="xs"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? t.chartExitFullscreen : t.chartFullscreen}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            {isFullscreen ? (
              <path d="M3 8h3a2 2 0 0 0 2-2V3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M21 16h-3a2 2 0 0 0-2 2v3" />
            ) : (
              <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
            )}
          </svg>
        </Button>
      </Flex>
      <Box flex={isFullscreen ? "1" : undefined} minHeight={0}>
        <ResponsiveContainer width="100%" height={isFullscreen ? "100%" : 400}>
          <LineChart data={visibleData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} />
            <YAxis
              tick={{ fontSize: 11 }}
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => v.toLocaleString()}
            />
            <Tooltip formatter={(v) => (typeof v === "number" ? v.toLocaleString() : v)} />
            <Legend />
            <Line
              type="monotone"
              dataKey="actual"
              name={t.chartActualLabel}
              stroke="#2563eb"
              dot={false}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="predicted"
              name={t.chartPredictedLabel}
              stroke="#f97316"
              strokeDasharray="6 4"
              dot={false}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
}
