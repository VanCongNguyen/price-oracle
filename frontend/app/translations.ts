export type Lang = "vi" | "en";

const GRAMS_PER_TROY_OUNCE = 31.1034768;
const GRAMS_PER_CHI = 3.75; // đơn vị "chỉ" vàng ở Việt Nam = 1/10 lượng
const GRAMS_PER_LUONG = 37.5; // đơn vị "lượng" vàng ở Việt Nam = 10 chỉ

export const GOLD_UNITS = {
  oz: { factor: 1, label: "oz" },
  gram: { factor: 1 / GRAMS_PER_TROY_OUNCE, label: "g" },
  chi: { factor: GRAMS_PER_CHI / GRAMS_PER_TROY_OUNCE, label: "chỉ" },
  luong: { factor: GRAMS_PER_LUONG / GRAMS_PER_TROY_OUNCE, label: "lượng" },
} as const;

export type GoldUnit = keyof typeof GOLD_UNITS;

export const GOLD_UNIT_OPTIONS: Record<Lang, { value: GoldUnit; label: string }[]> = {
  vi: [
    { value: "oz", label: "Troy ounce (oz)" },
    { value: "gram", label: "Gram (g)" },
    { value: "chi", label: "Chỉ (3,75g)" },
    { value: "luong", label: "Lượng (37,5g)" },
  ],
  en: [
    { value: "oz", label: "Troy ounce (oz)" },
    { value: "gram", label: "Gram (g)" },
    { value: "chi", label: "Chỉ (3.75g)" },
    { value: "luong", label: "Vietnamese lượng (37.5g)" },
  ],
};

export const SYMBOLS: Record<Lang, { value: string; label: string }[]> = {
  vi: [
    { value: "btc", label: "Bitcoin (BTC)" },
    { value: "eth", label: "Ethereum (ETH)" },
    { value: "gold", label: "Vàng (Gold)" },
    { value: "uni", label: "Uniswap (UNI)" },
  ],
  en: [
    { value: "btc", label: "Bitcoin (BTC)" },
    { value: "eth", label: "Ethereum (ETH)" },
    { value: "gold", label: "Gold" },
    { value: "uni", label: "Uniswap (UNI)" },
  ],
};

export const MODELS: Record<Lang, { value: string; label: string }[]> = {
  vi: [
    { value: "linear", label: "Linear Regression" },
    { value: "random_forest", label: "Random Forest" },
    { value: "lstm", label: "LSTM" },
  ],
  en: [
    { value: "linear", label: "Linear Regression" },
    { value: "random_forest", label: "Random Forest" },
    { value: "lstm", label: "LSTM" },
  ],
};

export const MODEL_NOTES: Record<Lang, Record<string, string>> = {
  vi: {
    linear:
      "Hồi quy tuyến tính: dự đoán dựa trên quan hệ tuyến tính đơn giản giữa giá và các đặc trưng lịch sử (lag, trung bình trượt). Nhanh nhưng khó bắt xu hướng phức tạp.",
    random_forest:
      "Random Forest: kết hợp nhiều cây quyết định trên cùng bộ đặc trưng với Linear Regression, thường chính xác hơn nhờ bắt được quan hệ phi tuyến.",
    lstm: "LSTM: mạng nơ-ron học trực tiếp từ chuỗi 30 ngày giá gần nhất, phù hợp với biến động phức tạp theo thời gian nhưng cần huấn luyện lâu hơn.",
  },
  en: {
    linear:
      "Linear Regression: predicts using a simple linear relationship between price and historical features (lags, rolling averages). Fast, but struggles with complex trends.",
    random_forest:
      "Random Forest: combines many decision trees on the same features as Linear Regression; usually more accurate since it captures non-linear patterns.",
    lstm: "LSTM: a neural network that learns directly from the last 30 days of prices; good for complex time patterns but takes longer to train.",
  },
};

interface TextDict {
  subtitle: string;
  refreshNote: string;
  refreshButton: string;
  refreshLoading: string;
  assetLabel: string;
  modelLabel: string;
  horizonLabel: string;
  historyDaysLabel: string;
  latestPriceLabel: string;
  forecastLabel: (horizon: number) => string;
  expectedChangeLabel: string;
  loadErrorFallback: string;
  genericErrorFallback: string;
  refreshErrorFallback: string;
  goldButton: string;
  goldButtonLoading: string;
  goldNote: string;
  goldErrorFallback: string;
  goldApiResultLabel: string;
  coingeckoButton: string;
  coingeckoButtonLoading: string;
  coingeckoNote: string;
  coingeckoErrorFallback: string;
  coingeckoResultLabel: string;
  yahooButton: string;
  yahooButtonLoading: string;
  yahooErrorFallback: string;
  yahooResultLabel: string;
  goldUnitLabel: string;
  currencyLabel: string;
  fxErrorFallback: string;
  fxRateLabel: (rate: number, date: string) => string;
  goldApiDaysFetchedLabel: (days: number) => string;
}

export const TEXT: Record<Lang, TextDict> = {
  vi: {
    subtitle:
      "Dự đoán giá BTC / ETH / Vàng bằng Machine Learning (dự án học tập, không dùng để đầu tư thực tế)",
    refreshNote:
      "Nút này tải lịch sử giá BTC/ETH/UNI/Vàng mới nhất (Binance + Yahoo Finance) rồi huấn luyện lại các model dự đoán (Linear Regression, Random Forest, LSTM). Cần bấm ít nhất 1 lần thì biểu đồ bên dưới mới có dữ liệu để hiển thị; quá trình huấn luyện có thể mất vài phút.",
    refreshButton: "Tải dữ liệu & huấn luyện model",
    refreshLoading: "Đang tải & huấn luyện...",
    assetLabel: "Tài sản",
    modelLabel: "Model",
    horizonLabel: "Số ngày dự đoán",
    historyDaysLabel: "Lịch sử (ngày)",
    latestPriceLabel: "Giá gần nhất",
    forecastLabel: (horizon) => `Dự đoán (${horizon} ngày tới)`,
    expectedChangeLabel: "Thay đổi dự kiến",
    loadErrorFallback: "Không tải được dữ liệu từ API.",
    genericErrorFallback: "Đã có lỗi xảy ra.",
    refreshErrorFallback: "Không tải được dữ liệu.",
    goldButton: "Cập nhật lịch sử giá vàng (GoldAPI)",
    goldButtonLoading: "Đang cập nhật...",
    goldNote:
      "Lấy giá vàng (XAU/USD) từ GoldAPI — cả lịch sử ~1 năm gần đây lẫn giá giao ngay mới nhất — lưu vào file riêng (gold_goldapi.csv) để tham khảo/so sánh, không ghi đè lên dữ liệu lịch sử từ yfinance nên không ảnh hưởng biểu đồ bên dưới. Tài khoản GoldAPI miễn phí giới hạn khoảng 100 request/tháng, nên tách riêng khỏi nút tải dữ liệu chung — chỉ bấm khi cần.",
    goldErrorFallback: "Không cập nhật được giá vàng.",
    goldApiResultLabel: "Giá GoldAPI mới nhất",
    goldApiDaysFetchedLabel: (days) => `đã lấy ${days} ngày lịch sử`,
    coingeckoButton: "Cập nhật từ CoinGecko",
    coingeckoButtonLoading: "Đang cập nhật...",
    coingeckoNote:
      "Lấy giá BTC/ETH/UNI tham khảo từ các nguồn khác, mỗi nguồn lưu 1 file riêng (vd: btc_coingecko.csv, btc_yahoo_finance.csv) để so sánh với nguồn chính từ Binance (btc_binance.csv) — không ảnh hưởng biểu đồ hay model.",
    coingeckoErrorFallback: "Không cập nhật được giá từ CoinGecko.",
    coingeckoResultLabel: "Giá CoinGecko mới nhất",
    yahooButton: "Cập nhật từ Yahoo Finance",
    yahooButtonLoading: "Đang cập nhật...",
    yahooErrorFallback: "Không cập nhật được giá từ Yahoo Finance.",
    yahooResultLabel: "Giá Yahoo Finance mới nhất",
    goldUnitLabel: "Đơn vị",
    currencyLabel: "Tiền tệ",
    fxErrorFallback: "Không lấy được tỷ giá USD/VND.",
    fxRateLabel: (rate, date) => `Tỷ giá: 1 USD = ${rate.toLocaleString()} VND (${date})`,
  },
  en: {
    subtitle:
      "BTC / ETH / Gold price prediction using Machine Learning (a learning project, not for real investment)",
    refreshNote:
      "This button fetches the latest BTC/ETH/UNI/Gold price history (Binance + Yahoo Finance) and retrains the prediction models (Linear Regression, Random Forest, LSTM). Click it at least once so the chart below has data; training can take a few minutes.",
    refreshButton: "Fetch data & train models",
    refreshLoading: "Fetching & training...",
    assetLabel: "Asset",
    modelLabel: "Model",
    horizonLabel: "Forecast horizon (days)",
    historyDaysLabel: "History (days)",
    latestPriceLabel: "Latest price",
    forecastLabel: (horizon) => `Forecast (next ${horizon} days)`,
    expectedChangeLabel: "Expected change",
    loadErrorFallback: "Failed to load data from the API.",
    genericErrorFallback: "Something went wrong.",
    refreshErrorFallback: "Failed to fetch data.",
    goldButton: "Update gold price history (GoldAPI)",
    goldButtonLoading: "Updating...",
    goldNote:
      "Fetches gold prices (XAU/USD) from GoldAPI — roughly the last year of history plus the latest spot price — into a separate file (gold_goldapi.csv) for reference/comparison; it never overwrites the yfinance history, so it won't change the chart below. The free GoldAPI account is capped around 100 requests/month, so this is kept separate from the main refresh button — only click when needed.",
    goldErrorFallback: "Failed to update the gold price.",
    goldApiResultLabel: "Latest GoldAPI price",
    goldApiDaysFetchedLabel: (days) => `${days} days of history fetched`,
    coingeckoButton: "Update from CoinGecko",
    coingeckoButtonLoading: "Updating...",
    coingeckoNote:
      "Fetches BTC/ETH/UNI reference prices from other sources, each saved to its own file (e.g. btc_coingecko.csv, btc_yahoo_finance.csv) to compare against the main Binance data (btc_binance.csv) — doesn't affect the chart or models.",
    coingeckoErrorFallback: "Failed to update the CoinGecko price.",
    coingeckoResultLabel: "Latest CoinGecko price",
    yahooButton: "Update from Yahoo Finance",
    yahooButtonLoading: "Updating...",
    yahooErrorFallback: "Failed to update the Yahoo Finance price.",
    yahooResultLabel: "Latest Yahoo Finance price",
    goldUnitLabel: "Unit",
    currencyLabel: "Currency",
    fxErrorFallback: "Failed to fetch the USD/VND exchange rate.",
    fxRateLabel: (rate, date) => `Rate: 1 USD = ${rate.toLocaleString()} VND (${date})`,
  },
};
