"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Flex,
  Heading,
  Text,
  NativeSelect,
  Input,
  Spinner,
  SimpleGrid,
} from "@chakra-ui/react";
import PriceChart, { ChartPoint } from "./components/PriceChart";
import {
  GOLD_UNIT_OPTIONS,
  GOLD_UNITS,
  goldApiRequestsForDays,
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

  const [refreshKey, setRefreshKey] = useState(0);
  const [fetchingCrypto, setFetchingCrypto] = useState(false);
  const [fetchCryptoError, setFetchCryptoError] = useState("");
  const [fetchingGold, setFetchingGold] = useState(false);
  const [fetchGoldError, setFetchGoldError] = useState("");
  const [training, setTraining] = useState(false);
  const [trainError, setTrainError] = useState("");

  const [fetchDays, setFetchDays] = useState(365);

  const [goldRefreshing, setGoldRefreshing] = useState(false);
  const [goldRefreshError, setGoldRefreshError] = useState("");
  const [goldApiPrice, setGoldApiPrice] = useState<{
    date: string;
    price: number;
    daysFetched: number;
  } | null>(null);

  const [coingeckoRefreshing, setCoingeckoRefreshing] = useState(false);
  const [coingeckoRefreshError, setCoingeckoRefreshError] = useState("");
  const [coingeckoPrice, setCoingeckoPrice] = useState<{ date: string; price: number } | null>(
    null
  );

  const [yahooRefreshing, setYahooRefreshing] = useState(false);
  const [yahooRefreshError, setYahooRefreshError] = useState("");
  const [yahooPrice, setYahooPrice] = useState<{ date: string; price: number } | null>(null);

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
  }, [symbol, model, horizon, historyDays, refreshKey]);

  useEffect(() => {
    setCoingeckoPrice(null);
    setCoingeckoRefreshError("");
    setYahooPrice(null);
    setYahooRefreshError("");
  }, [symbol]);

  async function handleFetchCrypto() {
    setFetchingCrypto(true);
    setFetchCryptoError("");
    try {
      const res = await fetch(`${API_BASE}/data/fetch-crypto?days=${fetchDays}`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? t.fetchCryptoErrorFallback);
      }
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setFetchCryptoError(e instanceof Error ? e.message : t.genericErrorFallback);
    } finally {
      setFetchingCrypto(false);
    }
  }

  async function handleFetchGold() {
    setFetchingGold(true);
    setFetchGoldError("");
    try {
      const res = await fetch(`${API_BASE}/data/fetch-gold?days=${fetchDays}`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? t.fetchGoldErrorFallback);
      }
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setFetchGoldError(e instanceof Error ? e.message : t.genericErrorFallback);
    } finally {
      setFetchingGold(false);
    }
  }

  async function handleTrainModels() {
    setTraining(true);
    setTrainError("");
    try {
      const res = await fetch(`${API_BASE}/data/train`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? t.trainErrorFallback);
      }
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setTrainError(e instanceof Error ? e.message : t.genericErrorFallback);
    } finally {
      setTraining(false);
    }
  }

  async function handleRefreshGoldPrice() {
    setGoldRefreshing(true);
    setGoldRefreshError("");
    try {
      const res = await fetch(`${API_BASE}/data/refresh-gold-price?days=${fetchDays}`, {
        method: "POST",
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.detail ?? t.goldErrorFallback);
      }
      setGoldApiPrice({
        date: body.latest.date,
        price: body.latest.price,
        daysFetched: body.days_fetched,
      });
    } catch (e) {
      setGoldRefreshError(e instanceof Error ? e.message : t.genericErrorFallback);
    } finally {
      setGoldRefreshing(false);
    }
  }

  async function handleRefreshCoinGecko() {
    setCoingeckoRefreshing(true);
    setCoingeckoRefreshError("");
    try {
      const res = await fetch(
        `${API_BASE}/data/refresh-crypto-coingecko?days=${fetchDays}`,
        { method: "POST" }
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.detail ?? t.coingeckoErrorFallback);
      }
      const entry = body.latest[symbol];
      if (entry) setCoingeckoPrice(entry);
    } catch (e) {
      setCoingeckoRefreshError(e instanceof Error ? e.message : t.genericErrorFallback);
    } finally {
      setCoingeckoRefreshing(false);
    }
  }

  async function handleRefreshYahoo() {
    setYahooRefreshing(true);
    setYahooRefreshError("");
    try {
      const res = await fetch(`${API_BASE}/data/refresh-crypto-yahoo?days=${fetchDays}`, {
        method: "POST",
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.detail ?? t.yahooErrorFallback);
      }
      const entry = body.latest[symbol];
      if (entry) setYahooPrice(entry);
    } catch (e) {
      setYahooRefreshError(e instanceof Error ? e.message : t.genericErrorFallback);
    } finally {
      setYahooRefreshing(false);
    }
  }

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

  return (
    <Box maxW="960px" mx="auto" px={4} py={8} fontFamily="system-ui, sans-serif">
      <Flex justify="space-between" align="flex-start" wrap="wrap" gap={2}>
        <Box>
          <Heading size="xl">{APP_NAME}</Heading>
          <Text color="gray.500" mt={1}>
            {t.subtitle}
          </Text>
        </Box>
        <NativeSelect.Root size="sm" width="60px">
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
          <Text fontSize="xs" color="gray.500" mb={1}>
            {t.modelLabel}
          </Text>
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
          <Text fontSize="xs" color="gray.500" mt={1} maxW="220px">
            {MODEL_NOTES[lang][model]}
          </Text>
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

      </Flex>

      <Box mb={4}>
        <Text fontSize="xs" color="gray.500" mb={1}>
          {t.fetchRangeLabel}
        </Text>
        <NativeSelect.Root size="sm" width="160px">
          <NativeSelect.Field
            value={fetchDays}
            onChange={(e) => setFetchDays(Number(e.target.value))}
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

      <Box mt={4} p={4} borderWidth="1px" borderRadius="md" bg="gray.50">
        <Text fontSize="sm" mb={2}>
          {t.fetchNote}
        </Text>
        <Flex gap={2} wrap="wrap">
          {symbol !== "gold" && (
            <Button
              size="sm"
              onClick={handleFetchCrypto}
              loading={fetchingCrypto}
              loadingText={t.fetchCryptoLoading}
            >
              {t.fetchCryptoButton}
            </Button>
          )}
          {symbol === "gold" && (
            <Button
              size="sm"
              onClick={handleFetchGold}
              loading={fetchingGold}
              loadingText={t.fetchGoldLoading}
            >
              {t.fetchGoldButton}
            </Button>
          )}
        </Flex>
        {symbol !== "gold" && fetchCryptoError && (
          <Text color="red.500" fontSize="sm" mt={2}>
            {fetchCryptoError}
          </Text>
        )}
        {symbol === "gold" && fetchGoldError && (
          <Text color="red.500" fontSize="sm" mt={2}>
            {fetchGoldError}
          </Text>
        )}
      </Box>

      {symbol === "gold" && (
        <Box mt={4} p={4} borderWidth="1px" borderRadius="md" bg="yellow.50">
          <Text fontSize="sm" mb={2}>
            {t.goldNote}
          </Text>
          <Button
            size="sm"
            onClick={handleRefreshGoldPrice}
            loading={goldRefreshing}
            loadingText={t.goldButtonLoading}
          >
            {t.goldButton}
          </Button>
          <Text fontSize="xs" color="gray.500" mt={1}>
            {t.goldApiRequestsNote(goldApiRequestsForDays(fetchDays))}
          </Text>
          {goldApiPrice && (
            <Text fontSize="sm" mt={2}>
              {t.goldApiResultLabel}: {(goldApiPrice.price * unitFactor).toLocaleString()}{" "}
              {unitSuffix} ({goldApiPrice.date}) — {t.goldApiDaysFetchedLabel(goldApiPrice.daysFetched)}
            </Text>
          )}
          {goldRefreshError && (
            <Text color="red.500" fontSize="sm" mt={2}>
              {goldRefreshError}
            </Text>
          )}
        </Box>
      )}

      {symbol !== "gold" && (
        <Box mt={4} p={4} borderWidth="1px" borderRadius="md" bg="blue.50">
          <Text fontSize="sm" mb={2}>
            {t.coingeckoNote}
          </Text>
          <Flex gap={2} wrap="wrap">
            <Button
              size="sm"
              onClick={handleRefreshCoinGecko}
              loading={coingeckoRefreshing}
              loadingText={t.coingeckoButtonLoading}
            >
              {t.coingeckoButton}
            </Button>
            <Button
              size="sm"
              onClick={handleRefreshYahoo}
              loading={yahooRefreshing}
              loadingText={t.yahooButtonLoading}
            >
              {t.yahooButton}
            </Button>
          </Flex>
          {coingeckoPrice && (
            <Text fontSize="sm" mt={2}>
              {t.coingeckoResultLabel}: {coingeckoPrice.price.toLocaleString()} USD (
              {coingeckoPrice.date})
            </Text>
          )}
          {coingeckoRefreshError && (
            <Text color="red.500" fontSize="sm" mt={2}>
              {coingeckoRefreshError}
            </Text>
          )}
          {yahooPrice && (
            <Text fontSize="sm" mt={2}>
              {t.yahooResultLabel}: {yahooPrice.price.toLocaleString()} USD ({yahooPrice.date})
            </Text>
          )}
          {yahooRefreshError && (
            <Text color="red.500" fontSize="sm" mt={2}>
              {yahooRefreshError}
            </Text>
          )}
        </Box>
      )}

      <Box mt={4} p={4} borderWidth="1px" borderRadius="md" bg="gray.50">
        <Text fontSize="sm" mb={2}>
          {t.trainNote}
        </Text>
        <Button size="sm" onClick={handleTrainModels} loading={training} loadingText={t.trainLoading}>
          {t.trainButton}
        </Button>
        {trainError && (
          <Text color="red.500" fontSize="sm" mt={2}>
            {trainError}
          </Text>
        )}
      </Box>

      {loading && <Spinner size="md" />}
      {!loading && error && <Text color="red.500">{error}</Text>}

      {!loading && !error && (
        <>
          <SimpleGrid columns={{ base: 1, sm: 3 }} gap={4} mb={4}>
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

          <Box mt={2}>
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
        </>
      )}
    </Box>
  );
}
