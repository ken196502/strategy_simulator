/**
 * 港股股票信息服务
 * 使用东方财富API获取港股的手数和其他股票信息
 */

interface HKStockInfo {
  symbol: string;
  name: string;
  trade_unit: number;
  listing_date: string;
  security_type: string;
  board: string;
  trade_market: string;
  issue_price: number | null;
  par_value: number | null;
  is_hk_connect_sh: boolean;
  is_hk_connect_sz: boolean;
}

interface APIResponse {
  result?: {
    data?: Array<{
      SECUCODE?: string;
      SECURITY_CODE?: string;
      SECURITY_NAME_ABBR?: string;
      SECURITY_TYPE?: string;
      LISTING_DATE?: string;
      ISIN_CODE?: string;
      BOARD?: string;
      TRADE_UNIT?: number | string;
      TRADE_MARKET?: string;
      GANGGUTONGBIAODISHEN?: string;
      GANGGUTONGBIAODIHU?: string;
      PAR_VALUE?: number | string | null;
      ISSUE_PRICE?: number | string | null;
      ISSUE_NUM?: number | string;
      YEAR_SETTLE_DAY?: string;
    }>;
  };
}

// 缓存股票信息，避免频繁API调用
const stockInfoCache: Map<string, HKStockInfo> = new Map();

/**
 * 规范化港股代码
 */
function normalizeHKSymbol(symbol: string): string {
  if (!symbol) {
    throw new Error("Symbol is required for HK stock lookup");
  }
  
  let cleaned = symbol.trim().toUpperCase();
  if (cleaned.endsWith('.HK')) {
    cleaned = cleaned.slice(0, -3);
  }
  
  const digits = cleaned.replace(/\D/g, '');
  if (!digits) {
    throw new Error(`无效的港股代码: ${symbol}`);
  }
  
  return digits.padStart(5, '0');
}

/**
 * 解析数值
 */
function parseNumeric(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  
  if (typeof value === 'number') {
    return value;
  }
  
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '');
    const match = cleaned.match(/[-+]?\d*\.?\d+/);
    if (match && match[0]) {
      try {
        return parseFloat(match[0]);
      } catch {
        return null;
      }
    }
  }
  
  return null;
}

/**
 * 获取港股股票信息，包括手数
 */
export async function getHKStockInfo(symbol: string): Promise<HKStockInfo> {
  const symbolPadded = normalizeHKSymbol(symbol);
  
  // 检查缓存
  if (stockInfoCache.has(symbolPadded)) {
    return stockInfoCache.get(symbolPadded)!;
  }
  
  try {
    const url = 'https://datacenter.eastmoney.com/securities/api/data/v1/get';
    const params = new URLSearchParams({
      reportName: 'RPT_HKF10_INFO_SECURITYINFO',
      columns: 'SECUCODE,SECURITY_CODE,SECURITY_NAME_ABBR,SECURITY_TYPE,LISTING_DATE,ISIN_CODE,BOARD,' +
               'TRADE_UNIT,TRADE_MARKET,GANGGUTONGBIAODISHEN,GANGGUTONGBIAODIHU,PAR_VALUE,' +
               'ISSUE_PRICE,ISSUE_NUM,YEAR_SETTLE_DAY',
      quoteColumns: '',
      filter: `(SECUCODE="${symbolPadded}.HK")`,
      pageNumber: '1',
      pageSize: '200',
      sortTypes: '',
      sortColumns: '',
      source: 'F10',
      client: 'PC',
      v: '04748497219912483'
    });
    
    const response = await fetch(`${url}?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const dataJson: APIResponse = await response.json();
    
    if (dataJson.result?.data && dataJson.result.data.length > 0) {
      const stockData = dataJson.result.data[0];
      
      const tradeUnitRaw = stockData.TRADE_UNIT ?? 100;
      const tradeUnit = Math.floor(parseNumeric(tradeUnitRaw) ?? 100);
      
      const issuePriceRaw = stockData.ISSUE_PRICE;
      const issuePrice = parseNumeric(issuePriceRaw);
      
      const parValueRaw = stockData.PAR_VALUE;
      const parValue = parseNumeric(parValueRaw);
      
      const stockInfo: HKStockInfo = {
        symbol: symbolPadded,
        name: stockData.SECURITY_NAME_ABBR ?? '',
        trade_unit: tradeUnit,
        listing_date: stockData.LISTING_DATE ?? '',
        security_type: stockData.SECURITY_TYPE ?? '',
        board: stockData.BOARD ?? '',
        trade_market: stockData.TRADE_MARKET ?? '',
        issue_price: issuePrice,
        par_value: parValue,
        is_hk_connect_sh: stockData.GANGGUTONGBIAODISHEN === '是',
        is_hk_connect_sz: stockData.GANGGUTONGBIAODIHU === '是',
      };
      
      // 缓存结果
      stockInfoCache.set(symbolPadded, stockInfo);
      
      console.log(`Retrieved HK stock info for ${symbolPadded}: ${stockInfo.name}, trade_unit: ${stockInfo.trade_unit}`);
      return stockInfo;
    }
    
    console.warn(`No data found for HK stock ${symbolPadded}`);
    throw new Error(`未找到港股 ${symbolPadded} 的信息`);
    
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Failed to get HK stock info for ${symbolPadded}:`, error.message);
      throw new Error(`获取港股 ${symbolPadded} 信息失败: ${error.message}`);
    }
    throw new Error(`港股 ${symbolPadded} 信息解析失败`);
  }
}

/**
 * 获取港股的手数（每手股数）
 */
export async function getHKTradeUnit(symbol: string): Promise<number> {
  const stockInfo = await getHKStockInfo(symbol);
  return stockInfo.trade_unit;
}

/**
 * 验证港股数量是否符合手数要求
 */
export async function validateHKQuantity(symbol: string, quantity: number): Promise<boolean> {
  const tradeUnit = await getHKTradeUnit(symbol);
  return quantity % tradeUnit === 0;
}

/**
 * 将数量调整为符合手数要求的最接近值
 */
export async function roundHKQuantity(symbol: string, quantity: number): Promise<number> {
  const tradeUnit = await getHKTradeUnit(symbol);
  return Math.round(quantity / tradeUnit) * tradeUnit;
}