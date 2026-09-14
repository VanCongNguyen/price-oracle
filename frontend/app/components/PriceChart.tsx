"use client";

import { useEffect, useState } from "react";
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

export interface ChartPoint {
  date: string;
  actual?: number | null;
  predicted?: number | null;
}

const ZOOM_STEP = 0.25;
const MIN_VISIBLE_POINTS = 5;

export default function PriceChart({ data }: { data: ChartPoint[] }) {
  const [visibleCount, setVisibleCount] = useState(data.length);

  useEffect(() => {
    setVisibleCount(data.length);
  }, [data.length]);

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
    <Box position="relative">
      <Flex position="absolute" top={0} right={0} zIndex={1} direction="column" gap={1}>
        <Button size="xs" onClick={zoomIn} disabled={visibleCount <= MIN_VISIBLE_POINTS}>
          +
        </Button>
        <Button size="xs" onClick={zoomOut} disabled={!isZoomed}>
          −
        </Button>
        {isZoomed && (
          <Button size="xs" onClick={resetZoom}>
            ⤢
          </Button>
        )}
      </Flex>
      <ResponsiveContainer width="100%" height={400}>
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
            name="Giá thực tế"
            stroke="#2563eb"
            dot={false}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="predicted"
            name="Dự đoán"
            stroke="#f97316"
            strokeDasharray="6 4"
            dot={false}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}
