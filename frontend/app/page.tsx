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
  Table,
  Tooltip,
} from "@chakra-ui/react";
import Link from "next/link";
import PriceChart, { ChartPoint } from "./components/PriceChart";
import {
  GOLD_UNIT_OPTIONS,
  GOLD_UNITS,
  GoldUnit,
  HISTORY_RANGE_OPTIONS,
  Lang,
  MODEL_NOTES,
  MODELS,
  SYMBOLS,
  TEXT,
} from "./translations";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Price Oracle";

interface HistoryPoint {
  date: string;
  price: number;
}

interface PredictionPoint {
  date: string;
  price: number;
}

interface PredictionComparison {
  logged_date: string;
  target_date: string;
  model: string;
  predicted_price: number;
  actual_price: number;
  error_pct: number;
}

export default function Home() {
  const [lang, setLang] = useState<Lang>("en");
  const [symbol, setSymbol] = useState("gold");
  const [model, setModel] = useState("random_forest");
  const [horizon, setHorizon] = useState(30);
  const [historyDays, setHistoryDays] = useState(365);

  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [predictions, setPredictions] = useState<PredictionPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [predictionHistory, setPredictionHistory] = useState<PredictionComparison[]>([]);
  const [predictionHistoryError, setPredictionHistoryError] = useState("");

  const [goldUnit, setGoldUnit] = useState<GoldUnit>("oz");
  const [currency, setCurrency] = useState<"USD" | "VND">("USD");
  const [usdVndRate, setUsdVndRate] = useState<{ rate: number; date: string } | null>(null);
  const [fxRefreshing, setFxRefreshing] = useState(false);
  const [fxRefreshError, setFxRefreshError] = useState("");

  const weightFactor = symbol === "gold" ? GOLD_UNITS[goldUnit].factor : 1;
  const currencyFactor = symbol === "gold" && currency === "VND" && usdVndRate ? usdVndRate.rate : 1;
  const unitFactor = weightFactor * currencyFactor;
  const unitSuffix = symbol === "gold" ? `${currency}/${GOLD_UNITS[goldUnit].label}` : "";

  const t = TEXT[lang];

  useEffect(() => {
    try {
      const saved = localStorage.getItem("lang");
      if (saved === "vi" || saved === "en") {
        setLang(saved);
        document.documentElement.lang = saved;
      }
    } catch {}
  }, []);

  function changeLang(l: Lang) {
    setLang(l);
    document.documentElement.lang = l;
    try {
      localStorage.setItem("lang", l);
    } catch {}
  }

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
          throw new Error(body?.detail ?? t.loadErrorFallback);
        }
        const historyJson = await historyRes.json();
        const predictJson = await predictRes.json();
        if (!cancelled) {
          setHistory(historyJson.history);
          setPredictions(predictJson.predictions);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : t.genericErrorFallback);
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

  useEffect(() => {
    let cancelled = false;
    async function loadPredictionHistory() {
      setPredictionHistoryError("");
      try {
        const res = await fetch(`${API_BASE}/predict-history/${symbol}?model=${model}`);
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(body?.detail ?? t.predictionHistoryErrorFallback);
        }
        if (!cancelled) {
          setPredictionHistory(body.comparisons);
        }
      } catch (e) {
        if (!cancelled) {
          setPredictionHistoryError(e instanceof Error ? e.message : t.genericErrorFallback);
          setPredictionHistory([]);
        }
      }
    }
    loadPredictionHistory();
    return () => {
      cancelled = true;
    };
  }, [symbol, model]);

  async function handleSwitchToVnd() {
    setFxRefreshing(true);
    setFxRefreshError("");
    try {
      const res = await fetch(`${API_BASE}/data/refresh-fx-rate`, { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.detail ?? t.fxErrorFallback);
      }
      setUsdVndRate({ rate: body.latest.rate, date: body.latest.date });
      setCurrency("VND");
    } catch (e) {
      setFxRefreshError(e instanceof Error ? e.message : t.genericErrorFallback);
    } finally {
      setFxRefreshing(false);
    }
  }

  const chartData: ChartPoint[] = useMemo(() => {
    const historyPoints: ChartPoint[] = history.map((p) => ({
      date: p.date,
      actual: p.price * unitFactor,
    }));
    const bridge = history.at(-1);
    const predictionPoints: ChartPoint[] = predictions.map((p) => ({
      date: p.date,
      predicted: p.price * unitFactor,
    }));
    if (bridge) {
      predictionPoints.unshift({ date: bridge.date, predicted: bridge.price * unitFactor });
    }
    return [...historyPoints, ...predictionPoints];
  }, [history, predictions, unitFactor]);

  const lastActual = history.at(-1)?.price;
  const lastPredicted = predictions.at(-1)?.price;
  const changePct =
    lastActual && lastPredicted ? ((lastPredicted - lastActual) / lastActual) * 100 : null;
  const showData = !loading && !error;

  return (
    <Box maxW="100%" px={{ base: 4, md: 8 }} py={{ base: 4, md: 8 }} fontFamily="system-ui, sans-serif">
      <Flex justify="space-between" align="flex-start" wrap="wrap" gap={2}>
        <Box>
          <Heading size="xl">{APP_NAME}</Heading>
          <Text color="gray.500" mt={1}>
            {t.subtitle}
          </Text>
        </Box>
        <Flex align="center" gap={3}>
          <Link href="/how-it-works">
            <Text fontSize="sm" color="blue.500">
              {t.howItWorksLink}
            </Text>
          </Link>
          <NativeSelect.Root size="sm" width="76px">
            <NativeSelect.Field
              value={lang}
              onChange={(e) => changeLang(e.target.value as Lang)}
            >
              <option value="vi">VI</option>
              <option value="en">EN</option>
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </Flex>
      </Flex>

      <Box mt={4} p={3} borderWidth="1px" borderRadius="md" borderColor="orange.200" bg="orange.50">
        <Text fontSize="xs" color="orange.800">
          {t.disclaimer}
        </Text>
      </Box>

      {loading && <Spinner size="md" />}
      {!loading && error && <Text color="red.500">{error}</Text>}

      {showData && (
        <>
          <SimpleGrid columns={{ base: 1, sm: 3 }} gap={4} mt={6} mb={4}>
            <Box>
              <Text fontSize="xs" color="gray.500">
                {t.latestPriceLabel}
                {unitSuffix ? ` (${unitSuffix})` : ""}
              </Text>
              <Text fontSize="xl" fontWeight="semibold">
                {lastActual !== undefined ? (lastActual * unitFactor).toLocaleString() : ""}
              </Text>
            </Box>
            <Box>
              <Text fontSize="xs" color="gray.500">
                {t.forecastLabel(horizon)}
                {unitSuffix ? ` (${unitSuffix})` : ""}
              </Text>
              <Text fontSize="xl" fontWeight="semibold">
                {lastPredicted !== undefined ? (lastPredicted * unitFactor).toLocaleString() : ""}
              </Text>
            </Box>
            {changePct !== null && (
              <Box>
                <Text fontSize="xs" color="gray.500">
                  {t.expectedChangeLabel}
                </Text>
                <Text fontSize="xl" fontWeight="semibold" color={changePct >= 0 ? "green.500" : "red.500"}>
                  {changePct >= 0 ? "+" : ""}
                  {changePct.toFixed(2)}%
                </Text>
              </Box>
            )}
          </SimpleGrid>

          <PriceChart data={chartData} t={t} />
        </>
      )}

      <Flex gap={4} wrap="wrap" mt={6} mb={6}>
        <Box>
          <Text fontSize="xs" color="gray.500" mb={1}>
            {t.assetLabel}
          </Text>
          <NativeSelect.Root size="sm" width="180px">
            <NativeSelect.Field value={symbol} onChange={(e) => setSymbol(e.target.value)}>
              {SYMBOLS[lang].map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </Box>

        {symbol === "gold" && (
          <Box>
            <Text fontSize="xs" color="gray.500" mb={1}>
              {t.goldUnitLabel}
            </Text>
            <NativeSelect.Root size="sm" width="180px">
              <NativeSelect.Field
                value={goldUnit}
                onChange={(e) => setGoldUnit(e.target.value as GoldUnit)}
              >
                {GOLD_UNIT_OPTIONS[lang].map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Box>
        )}

        {symbol === "gold" && (
          <Box>
            <Text fontSize="xs" color="gray.500" mb={1}>
              {t.currencyLabel}
            </Text>
            <NativeSelect.Root size="sm" width="120px">
              <NativeSelect.Field
                value={currency}
                disabled={fxRefreshing}
                onChange={(e) => {
                  const next = e.target.value as "USD" | "VND";
                  if (next === "VND") {
                    handleSwitchToVnd();
                  } else {
                    setCurrency("USD");
                  }
                }}
              >
                <option value="USD">USD</option>
                <option value="VND">VND</option>
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
            {usdVndRate && (
              <Text fontSize="xs" color="gray.500" mt={1}>
                {t.fxRateLabel(usdVndRate.rate, usdVndRate.date)}
              </Text>
            )}
            {fxRefreshError && (
              <Text fontSize="xs" color="red.500" mt={1}>
                {fxRefreshError}
              </Text>
            )}
          </Box>
        )}

        <Box>
          <Flex align="center" gap={1} mb={1}>
            <Text fontSize="xs" color="gray.500">
              {t.modelLabel}
            </Text>
            <Tooltip.Root>
              <Tooltip.Trigger
                fontSize="10px"
                lineHeight="1"
                color="gray.500"
                borderWidth="1px"
                borderColor="gray.400"
                borderRadius="full"
                w="14px"
                h="14px"
                display="inline-flex"
                alignItems="center"
                justifyContent="center"
                cursor="help"
                bg="transparent"
              >
                ?
              </Tooltip.Trigger>
              <Tooltip.Positioner>
                <Tooltip.Content maxW="260px">{MODEL_NOTES[lang][model]}</Tooltip.Content>
              </Tooltip.Positioner>
            </Tooltip.Root>
          </Flex>
          <NativeSelect.Root size="sm" width="180px">
            <NativeSelect.Field value={model} onChange={(e) => setModel(e.target.value)}>
              {MODELS[lang].map((m) => (
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
            {t.horizonLabel}
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
            {t.historyDaysLabel}
          </Text>
          <NativeSelect.Root size="sm" width="140px">
            <NativeSelect.Field
              value={historyDays}
              onChange={(e) => setHistoryDays(Number(e.target.value))}
            >
              {HISTORY_RANGE_OPTIONS.map((o) => (
                <option key={o.days} value={o.days}>
                  {t.fetchRangeOptionLabel(o.years)}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </Box>
      </Flex>

      <Box mt={6}>
        <Text fontWeight="semibold" mb={2}>
          {t.predictionHistoryTitle}
        </Text>
        {predictionHistoryError && <Text color="red.500">{predictionHistoryError}</Text>}
        {!predictionHistoryError && predictionHistory.length === 0 && (
          <Text color="gray.500" fontSize="sm">
            {t.predictionHistoryEmpty}
          </Text>
        )}
        {!predictionHistoryError && predictionHistory.length > 0 && (
          <Box overflowX="auto">
            <Table.Root size="sm" maxW="480px">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader>{t.predictionHistoryDateCol}</Table.ColumnHeader>
                  <Table.ColumnHeader>{t.predictionHistoryPredictedCol}</Table.ColumnHeader>
                  <Table.ColumnHeader>{t.predictionHistoryActualCol}</Table.ColumnHeader>
                  <Table.ColumnHeader>{t.predictionHistoryErrorCol}</Table.ColumnHeader>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {predictionHistory.slice(0, 20).map((row) => (
                  <Table.Row key={row.target_date}>
                    <Table.Cell>{row.target_date}</Table.Cell>
                    <Table.Cell>{(row.predicted_price * unitFactor).toLocaleString()}</Table.Cell>
                    <Table.Cell>{(row.actual_price * unitFactor).toLocaleString()}</Table.Cell>
                    <Table.Cell color={Math.abs(row.error_pct) <= 5 ? "green.600" : "red.600"}>
                      {row.error_pct >= 0 ? "+" : ""}
                      {row.error_pct.toFixed(2)}%
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Box>
        )}
      </Box>
    </Box>
  );
}
