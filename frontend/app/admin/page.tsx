"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Box, Button, Flex, Heading, Text, NativeSelect } from "@chakra-ui/react";
import {
  cryptoTickersLabel,
  fetchAssetOptions,
  goldApiRequestsForDays,
  HISTORY_RANGE_OPTIONS,
  Lang,
  TEXT,
} from "../translations";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Price Oracle";

export default function AdminPage() {
  const [lang, setLang] = useState<Lang>("en");
  const [symbol, setSymbol] = useState("gold");
  const [fetchDays, setFetchDays] = useState(365);

  const [fetchingCrypto, setFetchingCrypto] = useState(false);
  const [fetchCryptoError, setFetchCryptoError] = useState("");
  const [fetchingGold, setFetchingGold] = useState(false);
  const [fetchGoldError, setFetchGoldError] = useState("");
  const [training, setTraining] = useState(false);
  const [trainError, setTrainError] = useState("");

  const [goldRefreshing, setGoldRefreshing] = useState(false);
  const [goldRefreshError, setGoldRefreshError] = useState("");
  const [goldApiPrice, setGoldApiPrice] = useState<{
    date: string;
    price: number;
    daysFetched: number;
  } | null>(null);

  const [coingeckoRefreshing, setCoingeckoRefreshing] = useState(false);
  const [coingeckoRefreshError, setCoingeckoRefreshError] = useState("");
  const [coingeckoPrices, setCoingeckoPrices] = useState<Record<
    string,
    { date: string; price: number }
  > | null>(null);

  const [yahooRefreshing, setYahooRefreshing] = useState(false);
  const [yahooRefreshError, setYahooRefreshError] = useState("");
  const [yahooPrices, setYahooPrices] = useState<Record<
    string,
    { date: string; price: number }
  > | null>(null);

  const t = TEXT[lang];

  useEffect(() => {
    try {
      const saved = localStorage.getItem("lang");
      if (saved === "vi" || saved === "en") {
        setLang(saved);
      }
    } catch {}
  }, []);

  useEffect(() => {
    setCoingeckoPrices(null);
    setCoingeckoRefreshError("");
    setYahooPrices(null);
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
      setCoingeckoPrices(body.latest);
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
      setYahooPrices(body.latest);
    } catch (e) {
      setYahooRefreshError(e instanceof Error ? e.message : t.genericErrorFallback);
    } finally {
      setYahooRefreshing(false);
    }
  }

  return (
    <Box maxW="100%" px={{ base: 4, md: 8 }} py={{ base: 4, md: 8 }} fontFamily="system-ui, sans-serif">
      <Flex justify="space-between" align="flex-start" wrap="wrap" gap={2}>
        <Box>
          <Heading size="lg">{APP_NAME} — Data Management</Heading>
          <Link href="/">
            <Text color="blue.500" fontSize="sm" mt={1}>
              ← {lang === "en" ? "Back to dashboard" : "Về trang chính"}
            </Text>
          </Link>
        </Box>
        <NativeSelect.Root size="sm" width="76px">
          <NativeSelect.Field value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
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
              {fetchAssetOptions(lang).map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
          {symbol === "crypto" && (
            <Text fontSize="xs" color="gray.500" mt={1}>
              {cryptoTickersLabel(lang)}
            </Text>
          )}
        </Box>

        <Box>
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
      </Flex>

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
              {t.goldApiResultLabel}: {goldApiPrice.price.toLocaleString()} USD/oz (
              {goldApiPrice.date}) — {t.goldApiDaysFetchedLabel(goldApiPrice.daysFetched)}
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
          {coingeckoPrices && (
            <Box mt={2}>
              <Text fontSize="sm" fontWeight="semibold">
                {t.coingeckoResultLabel}
              </Text>
              {Object.entries(coingeckoPrices).map(([sym, p]) => (
                <Text key={sym} fontSize="sm">
                  {sym.toUpperCase()}: {p.price.toLocaleString()} USD ({p.date})
                </Text>
              ))}
            </Box>
          )}
          {coingeckoRefreshError && (
            <Text color="red.500" fontSize="sm" mt={2}>
              {coingeckoRefreshError}
            </Text>
          )}
          {yahooPrices && (
            <Box mt={2}>
              <Text fontSize="sm" fontWeight="semibold">
                {t.yahooResultLabel}
              </Text>
              {Object.entries(yahooPrices).map(([sym, p]) => (
                <Text key={sym} fontSize="sm">
                  {sym.toUpperCase()}: {p.price.toLocaleString()} USD ({p.date})
                </Text>
              ))}
            </Box>
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
    </Box>
  );
}
