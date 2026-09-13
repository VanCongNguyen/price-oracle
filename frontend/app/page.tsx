"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Flex,
  Heading,
  Text,
  NativeSelect,
  Input,
  Spinner,
  SimpleGrid,
} from "@chakra-ui/react";
import PriceChart, { ChartPoint } from "./components/PriceChart";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

const SYMBOLS = [
  { value: "btc", label: "Bitcoin (BTC)" },
  { value: "eth", label: "Ethereum (ETH)" },
  { value: "gold", label: "Vàng (Gold)" },
];

const MODELS = [
  { value: "linear", label: "Linear Regression" },
  { value: "random_forest", label: "Random Forest" },
  { value: "lstm", label: "LSTM" },
];

interface HistoryPoint {
  date: string;
  price: number;
}

interface PredictionPoint {
  date: string;
  price: number;
}

export default function Home() {
  const [symbol, setSymbol] = useState("btc");
  const [model, setModel] = useState("random_forest");
  const [horizon, setHorizon] = useState(7);
  const [historyDays, setHistoryDays] = useState(90);

  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [predictions, setPredictions] = useState<PredictionPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [historyRes, predictRes] = await Promise.all([
          fetch(`${API_BASE}/history/${symbol}?days=${historyDays}`),
          fetch(`${API_BASE}/predict/${symbol}?model=${model}&horizon=${horizon}`),
        ]);
        if (!historyRes.ok || !predictRes.ok) {
          const failed = !historyRes.ok ? historyRes : predictRes;
          const body = await failed.json().catch(() => null);
          throw new Error(body?.detail ?? "Không tải được dữ liệu từ API.");
        }
        const historyJson = await historyRes.json();
        const predictJson = await predictRes.json();
        if (!cancelled) {
          setHistory(historyJson.history);
          setPredictions(predictJson.predictions);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Đã có lỗi xảy ra.");
          setHistory([]);
          setPredictions([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [symbol, model, horizon, historyDays]);

  const chartData: ChartPoint[] = useMemo(() => {
    const historyPoints: ChartPoint[] = history.map((p) => ({
      date: p.date,
      actual: p.price,
    }));
    const bridge = history.at(-1);
    const predictionPoints: ChartPoint[] = predictions.map((p) => ({
      date: p.date,
      predicted: p.price,
    }));
    if (bridge) {
      predictionPoints.unshift({ date: bridge.date, predicted: bridge.price });
    }
    return [...historyPoints, ...predictionPoints];
  }, [history, predictions]);

  const lastActual = history.at(-1)?.price;
  const lastPredicted = predictions.at(-1)?.price;
  const changePct =
    lastActual && lastPredicted ? ((lastPredicted - lastActual) / lastActual) * 100 : null;

  return (
    <Box maxW="960px" mx="auto" px={4} py={8} fontFamily="system-ui, sans-serif">
      <Heading size="xl">Price Oracle</Heading>
      <Text color="gray.500" mt={1}>
        Dự đoán giá BTC / ETH / Vàng bằng Machine Learning (dự án học tập, không dùng để đầu tư
        thực tế)
      </Text>

      <Flex gap={4} wrap="wrap" mt={6} mb={6}>
        <Box>
          <Text fontSize="xs" color="gray.500" mb={1}>
            Tài sản
          </Text>
          <NativeSelect.Root size="sm" width="180px">
            <NativeSelect.Field value={symbol} onChange={(e) => setSymbol(e.target.value)}>
              {SYMBOLS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </Box>

        <Box>
          <Text fontSize="xs" color="gray.500" mb={1}>
            Model
          </Text>
          <NativeSelect.Root size="sm" width="180px">
            <NativeSelect.Field value={model} onChange={(e) => setModel(e.target.value)}>
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </Box>

        <Box>
          <Text fontSize="xs" color="gray.500" mb={1}>
            Số ngày dự đoán
          </Text>
          <Input
            size="sm"
            type="number"
            width="120px"
            min={1}
            max={30}
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value))}
          />
        </Box>

        <Box>
          <Text fontSize="xs" color="gray.500" mb={1}>
            Lịch sử (ngày)
          </Text>
          <Input
            size="sm"
            type="number"
            width="120px"
            min={30}
            max={1000}
            value={historyDays}
            onChange={(e) => setHistoryDays(Number(e.target.value))}
          />
        </Box>
      </Flex>

      {loading && <Spinner size="md" />}
      {!loading && error && <Text color="red.500">{error}</Text>}

      {!loading && !error && (
        <>
          <SimpleGrid columns={{ base: 1, sm: 3 }} gap={4} mb={4}>
            <Box>
              <Text fontSize="xs" color="gray.500">
                Giá gần nhất
              </Text>
              <Text fontSize="xl" fontWeight="semibold">
                {lastActual?.toLocaleString()}
              </Text>
            </Box>
            <Box>
              <Text fontSize="xs" color="gray.500">
                Dự đoán ({horizon} ngày tới)
              </Text>
              <Text fontSize="xl" fontWeight="semibold">
                {lastPredicted?.toLocaleString()}
              </Text>
            </Box>
            {changePct !== null && (
              <Box>
                <Text fontSize="xs" color="gray.500">
                  Thay đổi dự kiến
                </Text>
                <Text fontSize="xl" fontWeight="semibold" color={changePct >= 0 ? "green.500" : "red.500"}>
                  {changePct >= 0 ? "+" : ""}
                  {changePct.toFixed(2)}%
                </Text>
              </Box>
            )}
          </SimpleGrid>

          <PriceChart data={chartData} />
        </>
      )}
    </Box>
  );
}
