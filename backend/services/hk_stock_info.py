"""
港股股票信息服务
使用东方财富API获取港股的手数和其他股票信息
"""
import logging
import re
from typing import Dict, Optional

def _normalize_hk_symbol(symbol: str) -> str:
    if not symbol:
        raise ValueError("Symbol is required for HK stock lookup")
    cleaned = symbol.strip().upper()
    if cleaned.endswith('.HK'):
        cleaned = cleaned[:-3]
    digits = ''.join(ch for ch in cleaned if ch.isdigit())
    if not digits:
        raise ValueError(f"无效的港股代码: {symbol}")
    return digits.zfill(5)


def _parse_numeric(value: Optional[object]) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = value.replace(',', '')
        match = re.search(r'[-+]?\d*\.?\d+', cleaned)
        if match and match.group():
            try:
                return float(match.group())
            except ValueError:
                return None
    return None

import requests

logger = logging.getLogger(__name__)

# 缓存股票信息，避免频繁API调用
_stock_info_cache: Dict[str, Dict] = {}

def get_hk_stock_info(symbol: str) -> Dict:
    """
    获取港股股票信息，包括手数
    
    Args:
        symbol: 港股代码，如 "03900", "0700" 等
    
    Returns:
        Dict: 包含股票信息，特别是 trade_unit (手数)
    """
    symbol_padded = _normalize_hk_symbol(symbol)
    
    # 检查缓存
    if symbol_padded in _stock_info_cache:
        return _stock_info_cache[symbol_padded]
    
    try:
        url = 'https://datacenter.eastmoney.com/securities/api/data/v1/get'
        params = {
            'reportName': 'RPT_HKF10_INFO_SECURITYINFO',
            'columns': 'SECUCODE,SECURITY_CODE,SECURITY_NAME_ABBR,SECURITY_TYPE,LISTING_DATE,ISIN_CODE,BOARD,'
                       'TRADE_UNIT,TRADE_MARKET,GANGGUTONGBIAODISHEN,GANGGUTONGBIAODIHU,PAR_VALUE,'
                       'ISSUE_PRICE,ISSUE_NUM,YEAR_SETTLE_DAY',
            'quoteColumns': '',
            'filter': f'(SECUCODE="{symbol_padded}.HK")',
            'pageNumber': '1',
            'pageSize': '200',
            'sortTypes': '',
            'sortColumns': '',
            'source': 'F10',
            'client': 'PC',
            'v': '04748497219912483'
        }
        
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data_json = response.json()
        
        if 'result' in data_json and 'data' in data_json['result'] and data_json['result']['data']:
            stock_data = data_json['result']['data'][0]
            
            trade_unit_raw = stock_data.get('TRADE_UNIT', 100)
            trade_unit = int(_parse_numeric(trade_unit_raw) or 100)

            issue_price_raw = stock_data.get('ISSUE_PRICE')
            issue_price = _parse_numeric(issue_price_raw)

            par_value_raw = stock_data.get('PAR_VALUE')
            par_value = _parse_numeric(par_value_raw)

            stock_info = {
                'symbol': symbol_padded,
                'name': stock_data.get('SECURITY_NAME_ABBR', ''),
                'trade_unit': trade_unit,
                'listing_date': stock_data.get('LISTING_DATE', ''),
                'security_type': stock_data.get('SECURITY_TYPE', ''),
                'board': stock_data.get('BOARD', ''),
                'trade_market': stock_data.get('TRADE_MARKET', ''),
                'issue_price': issue_price,
                'par_value': par_value,
                'is_hk_connect_sh': stock_data.get('GANGGUTONGBIAODISHEN', '') == '是',  # 是否沪港通标的
                'is_hk_connect_sz': stock_data.get('GANGGUTONGBIAODIHU', '') == '是',    # 是否深港通标的
            }
            
            # 缓存结果
            _stock_info_cache[symbol_padded] = stock_info
            
            logger.info(f"Retrieved HK stock info for {symbol_padded}: {stock_info['name']}, trade_unit: {stock_info['trade_unit']}")
            return stock_info
        logger.warning(f"No data found for HK stock {symbol_padded}")
        raise ValueError(f"未找到港股 {symbol_padded} 的信息")

    except requests.RequestException as e:
        logger.error("Failed to request HK stock info for %s: %s", symbol_padded, e)
        raise ValueError(f"获取港股 {symbol_padded} 信息失败: {e}") from e
    except (ValueError, KeyError, TypeError) as e:
        logger.error("Invalid HK stock response for %s: %s", symbol_padded, e)
        raise ValueError(f"港股 {symbol_padded} 信息解析失败") from e


def get_hk_trade_unit(symbol: str) -> int:
    """
    获取港股的手数（每手股数）
    
    Args:
        symbol: 港股代码
    
    Returns:
        int: 手数，默认100
    """
    stock_info = get_hk_stock_info(symbol)
    return stock_info['trade_unit']


def validate_hk_quantity(symbol: str, quantity: int) -> bool:
    """
    验证港股数量是否符合手数要求
    
    Args:
        symbol: 港股代码
        quantity: 股票数量
    
    Returns:
        bool: 是否符合手数要求
    """
    trade_unit = get_hk_trade_unit(symbol)
    return quantity % trade_unit == 0


def round_hk_quantity(symbol: str, quantity: int) -> int:
    """
    将数量调整为符合手数要求的最接近值
    
    Args:
        symbol: 港股代码
        quantity: 原始数量
    
    Returns:
        int: 调整后的数量
    """
    trade_unit = get_hk_trade_unit(symbol)
    return round(quantity / trade_unit) * trade_unit