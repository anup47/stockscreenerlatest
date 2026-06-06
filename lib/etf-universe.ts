export type AssetType = 'etf';
export type Region    = 'us' | 'europe' | 'asia' | 'em' | 'global' | 'india' | 'china' | 'japan';

export interface EtfEntry {
  symbol:         string;
  name:           string;
  assetType:      AssetType;
  region:         Region;
  country:        string;
  theme:          string;
  benchmarkGroup: string;
  factorTags:     string[];   // used by explanation engine
  benchmarkName?: string;
}

export const ETF_UNIVERSE: EtfEntry[] = [
  // ── US Broad Market ────────────────────────────────────────────────────────
  { symbol: 'SPY',  name: 'SPDR S&P 500 ETF',              assetType: 'etf', region: 'us',     country: 'USA',   theme: 'Broad Market',    benchmarkGroup: 'US Equity',    factorTags: ['us-equity','large-cap'],                   benchmarkName: 'S&P 500' },
  { symbol: 'QQQ',  name: 'Invesco NASDAQ-100 ETF',         assetType: 'etf', region: 'us',     country: 'USA',   theme: 'Tech / Growth',   benchmarkGroup: 'US Equity',    factorTags: ['tech','growth','large-cap'],                benchmarkName: 'NASDAQ-100' },
  { symbol: 'IWM',  name: 'iShares Russell 2000 ETF',       assetType: 'etf', region: 'us',     country: 'USA',   theme: 'Small Cap',       benchmarkGroup: 'US Equity',    factorTags: ['small-cap','value','domestic'],             benchmarkName: 'Russell 2000' },
  { symbol: 'DIA',  name: 'SPDR Dow Jones Industrial ETF',  assetType: 'etf', region: 'us',     country: 'USA',   theme: 'Large Cap',       benchmarkGroup: 'US Equity',    factorTags: ['large-cap','value','industrials'],          benchmarkName: 'Dow Jones' },
  { symbol: 'MDY',  name: 'SPDR S&P MidCap 400 ETF',        assetType: 'etf', region: 'us',     country: 'USA',   theme: 'Mid Cap',         benchmarkGroup: 'US Equity',    factorTags: ['mid-cap','domestic'],                      benchmarkName: 'S&P MidCap 400' },

  // ── US Sectors ─────────────────────────────────────────────────────────────
  { symbol: 'XLK',  name: 'Technology Select Sector ETF',   assetType: 'etf', region: 'us', country: 'USA', theme: 'Technology',       benchmarkGroup: 'US Sector', factorTags: ['tech','growth','semis'] },
  { symbol: 'XLF',  name: 'Financial Select Sector ETF',    assetType: 'etf', region: 'us', country: 'USA', theme: 'Financials',       benchmarkGroup: 'US Sector', factorTags: ['financials','value','rates'] },
  { symbol: 'XLE',  name: 'Energy Select Sector ETF',       assetType: 'etf', region: 'us', country: 'USA', theme: 'Energy',           benchmarkGroup: 'US Sector', factorTags: ['energy','oil','commodities'] },
  { symbol: 'XLV',  name: 'Health Care Select Sector ETF',  assetType: 'etf', region: 'us', country: 'USA', theme: 'Healthcare',       benchmarkGroup: 'US Sector', factorTags: ['healthcare','defensive'] },
  { symbol: 'XLI',  name: 'Industrial Select Sector ETF',   assetType: 'etf', region: 'us', country: 'USA', theme: 'Industrials',      benchmarkGroup: 'US Sector', factorTags: ['industrials','cyclical'] },
  { symbol: 'XLB',  name: 'Materials Select Sector ETF',    assetType: 'etf', region: 'us', country: 'USA', theme: 'Materials',        benchmarkGroup: 'US Sector', factorTags: ['materials','commodities','cyclical'] },
  { symbol: 'XLU',  name: 'Utilities Select Sector ETF',    assetType: 'etf', region: 'us', country: 'USA', theme: 'Utilities',        benchmarkGroup: 'US Sector', factorTags: ['utilities','defensive','rates'] },
  { symbol: 'XLRE', name: 'Real Estate Select Sector ETF',  assetType: 'etf', region: 'us', country: 'USA', theme: 'Real Estate',      benchmarkGroup: 'US Sector', factorTags: ['real-estate','rates','defensive'] },
  { symbol: 'XLC',  name: 'Communication Services ETF',     assetType: 'etf', region: 'us', country: 'USA', theme: 'Communication',    benchmarkGroup: 'US Sector', factorTags: ['tech','media','growth'] },
  { symbol: 'XLY',  name: 'Consumer Discretionary ETF',     assetType: 'etf', region: 'us', country: 'USA', theme: 'Consumer Disc.',   benchmarkGroup: 'US Sector', factorTags: ['consumer','cyclical','growth'] },
  { symbol: 'XLP',  name: 'Consumer Staples ETF',           assetType: 'etf', region: 'us', country: 'USA', theme: 'Consumer Staples', benchmarkGroup: 'US Sector', factorTags: ['consumer','defensive','value'] },

  // ── US Factor / Style ──────────────────────────────────────────────────────
  { symbol: 'VTV',  name: 'Vanguard Value ETF',             assetType: 'etf', region: 'us', country: 'USA', theme: 'Value',      benchmarkGroup: 'US Factor', factorTags: ['value','large-cap','financials'] },
  { symbol: 'VUG',  name: 'Vanguard Growth ETF',            assetType: 'etf', region: 'us', country: 'USA', theme: 'Growth',     benchmarkGroup: 'US Factor', factorTags: ['growth','tech','large-cap'] },
  { symbol: 'MTUM', name: 'iShares MSCI Momentum ETF',      assetType: 'etf', region: 'us', country: 'USA', theme: 'Momentum',   benchmarkGroup: 'US Factor', factorTags: ['momentum','large-cap'] },
  { symbol: 'QUAL', name: 'iShares MSCI Quality ETF',       assetType: 'etf', region: 'us', country: 'USA', theme: 'Quality',    benchmarkGroup: 'US Factor', factorTags: ['quality','large-cap','defensive'] },

  // ── US Thematic ────────────────────────────────────────────────────────────
  { symbol: 'SMH',  name: 'VanEck Semiconductor ETF',        assetType: 'etf', region: 'us',     country: 'USA',    theme: 'Semiconductors',   benchmarkGroup: 'US Thematic',     factorTags: ['semis','tech','growth','ai'] },
  { symbol: 'SOXX', name: 'iShares Semiconductor ETF',       assetType: 'etf', region: 'us',     country: 'USA',    theme: 'Semiconductors',   benchmarkGroup: 'US Thematic',     factorTags: ['semis','tech','growth','ai'] },
  { symbol: 'ARKK', name: 'ARK Innovation ETF',              assetType: 'etf', region: 'us',     country: 'USA',    theme: 'Disruptive Tech',  benchmarkGroup: 'US Thematic',     factorTags: ['tech','growth','ai','high-beta'] },
  { symbol: 'XBI',  name: 'SPDR Biotech ETF',                assetType: 'etf', region: 'us',     country: 'USA',    theme: 'Biotech',          benchmarkGroup: 'US Thematic',     factorTags: ['healthcare','growth','high-beta'] },
  { symbol: 'JETS', name: 'US Global Jets ETF',              assetType: 'etf', region: 'us',     country: 'USA',    theme: 'Airlines',         benchmarkGroup: 'US Thematic',     factorTags: ['energy','consumer','cyclical'] },
  { symbol: 'ITB',  name: 'iShares US Home Construction ETF',assetType: 'etf', region: 'us',     country: 'USA',    theme: 'Homebuilders',     benchmarkGroup: 'US Thematic',     factorTags: ['real-estate','cyclical','consumer'] },
  { symbol: 'HACK', name: 'ETFMG Cyber Security ETF',        assetType: 'etf', region: 'us',     country: 'USA',    theme: 'Cybersecurity',    benchmarkGroup: 'US Thematic',     factorTags: ['tech','growth','security'] },
  { symbol: 'ICLN', name: 'iShares Global Clean Energy ETF', assetType: 'etf', region: 'global', country: 'Global', theme: 'Clean Energy',     benchmarkGroup: 'Global Thematic', factorTags: ['energy','growth','esg','rates'] },
  { symbol: 'TAN',  name: 'Invesco Solar ETF',               assetType: 'etf', region: 'global', country: 'Global', theme: 'Solar',            benchmarkGroup: 'Global Thematic', factorTags: ['energy','growth','esg','rates'] },
  { symbol: 'BOTZ', name: 'Global X Robotics & AI ETF',      assetType: 'etf', region: 'global', country: 'Multi',  theme: 'Robotics / AI',   benchmarkGroup: 'Global Thematic', factorTags: ['tech','ai','growth'] },

  // ── International Developed ────────────────────────────────────────────────
  { symbol: 'EFA',  name: 'iShares MSCI EAFE ETF',           assetType: 'etf', region: 'global',  country: 'Multi',        theme: "Int'l Developed",  benchmarkGroup: 'Developed ex-US', factorTags: ['international','large-cap','dollar'] },
  { symbol: 'VEA',  name: 'Vanguard Developed Markets ETF',  assetType: 'etf', region: 'global',  country: 'Multi',        theme: "Int'l Developed",  benchmarkGroup: 'Developed ex-US', factorTags: ['international','large-cap','dollar'] },
  { symbol: 'EWJ',  name: 'iShares MSCI Japan ETF',          assetType: 'etf', region: 'japan',   country: 'Japan',        theme: 'Japan Equities',   benchmarkGroup: 'Asia Developed',  factorTags: ['japan','large-cap','value','jpy'] },
  { symbol: 'EWG',  name: 'iShares MSCI Germany ETF',        assetType: 'etf', region: 'europe',  country: 'Germany',      theme: 'Germany Equities', benchmarkGroup: 'Europe',          factorTags: ['europe','industrials','value','eur'] },
  { symbol: 'EWU',  name: 'iShares MSCI UK ETF',             assetType: 'etf', region: 'europe',  country: 'UK',           theme: 'UK Equities',      benchmarkGroup: 'Europe',          factorTags: ['europe','value','energy','financials'] },
  { symbol: 'EWQ',  name: 'iShares MSCI France ETF',         assetType: 'etf', region: 'europe',  country: 'France',       theme: 'France Equities',  benchmarkGroup: 'Europe',          factorTags: ['europe','luxury','large-cap','eur'] },
  { symbol: 'EWP',  name: 'iShares MSCI Spain ETF',          assetType: 'etf', region: 'europe',  country: 'Spain',        theme: 'Spain Equities',   benchmarkGroup: 'Europe',          factorTags: ['europe','financials','value','eur'] },
  { symbol: 'EWA',  name: 'iShares MSCI Australia ETF',      assetType: 'etf', region: 'asia',    country: 'Australia',    theme: 'Australia Equities',benchmarkGroup: 'Asia Pacific',   factorTags: ['commodities','financials','value','aud'] },
  { symbol: 'EWC',  name: 'iShares MSCI Canada ETF',         assetType: 'etf', region: 'global',  country: 'Canada',       theme: 'Canada Equities',  benchmarkGroup: 'Americas',        factorTags: ['commodities','energy','financials'] },

  // ── Emerging Markets ───────────────────────────────────────────────────────
  { symbol: 'EEM',  name: 'iShares MSCI Emerging Markets ETF', assetType: 'etf', region: 'em', country: 'Multi',       theme: 'Broad EM',       benchmarkGroup: 'Emerging Markets', factorTags: ['em','large-cap','dollar','china'] },
  { symbol: 'VWO',  name: 'Vanguard FTSE Emerging Markets ETF',assetType: 'etf', region: 'em', country: 'Multi',       theme: 'Broad EM',       benchmarkGroup: 'Emerging Markets', factorTags: ['em','large-cap','dollar'] },
  { symbol: 'INDA', name: 'iShares MSCI India ETF',            assetType: 'etf', region: 'india', country: 'India',    theme: 'India Equities', benchmarkGroup: 'Asia EM',          factorTags: ['india','em','growth','dollar'] },
  { symbol: 'EPI',  name: 'WisdomTree India Earnings ETF',     assetType: 'etf', region: 'india', country: 'India',    theme: 'India Equities', benchmarkGroup: 'Asia EM',          factorTags: ['india','em','value','dollar'] },
  { symbol: 'FXI',  name: 'iShares China Large-Cap ETF',       assetType: 'etf', region: 'china', country: 'China',    theme: 'China Equities', benchmarkGroup: 'Asia EM',          factorTags: ['china','em','large-cap','policy'] },
  { symbol: 'MCHI', name: 'iShares MSCI China ETF',            assetType: 'etf', region: 'china', country: 'China',    theme: 'China Equities', benchmarkGroup: 'Asia EM',          factorTags: ['china','em','growth','policy'] },
  { symbol: 'KWEB', name: 'KraneShares China Internet ETF',    assetType: 'etf', region: 'china', country: 'China',    theme: 'China Tech',     benchmarkGroup: 'Asia EM',          factorTags: ['china','tech','growth','policy'] },
  { symbol: 'EWY',  name: 'iShares MSCI South Korea ETF',      assetType: 'etf', region: 'asia',  country: 'S. Korea', theme: 'Korea Equities', benchmarkGroup: 'Asia EM',          factorTags: ['semis','tech','em','dollar'] },
  { symbol: 'EWT',  name: 'iShares MSCI Taiwan ETF',           assetType: 'etf', region: 'asia',  country: 'Taiwan',   theme: 'Taiwan Equities',benchmarkGroup: 'Asia EM',          factorTags: ['semis','tech','em','dollar'] },
  { symbol: 'EWZ',  name: 'iShares MSCI Brazil ETF',           assetType: 'etf', region: 'em',    country: 'Brazil',   theme: 'Brazil Equities',benchmarkGroup: 'Latin America',    factorTags: ['em','commodities','energy'] },
  { symbol: 'EWW',  name: 'iShares MSCI Mexico ETF',           assetType: 'etf', region: 'em',    country: 'Mexico',   theme: 'Mexico Equities',benchmarkGroup: 'Latin America',    factorTags: ['em','cyclical','dollar'] },

  // ── Commodities ────────────────────────────────────────────────────────────
  { symbol: 'GLD',  name: 'SPDR Gold Shares',              assetType: 'etf', region: 'global', country: 'Global', theme: 'Gold',             benchmarkGroup: 'Commodities', factorTags: ['gold','precious-metals','risk-off','dollar'] },
  { symbol: 'GDX',  name: 'VanEck Gold Miners ETF',        assetType: 'etf', region: 'global', country: 'Global', theme: 'Gold Miners',      benchmarkGroup: 'Commodities', factorTags: ['gold','mining','commodities','dollar'] },
  { symbol: 'SLV',  name: 'iShares Silver Trust',          assetType: 'etf', region: 'global', country: 'Global', theme: 'Silver',           benchmarkGroup: 'Commodities', factorTags: ['silver','precious-metals','industrials'] },
  { symbol: 'USO',  name: 'United States Oil Fund',        assetType: 'etf', region: 'global', country: 'Global', theme: 'Crude Oil',        benchmarkGroup: 'Commodities', factorTags: ['energy','oil'] },
  { symbol: 'DBB',  name: 'Invesco Base Metals ETF',       assetType: 'etf', region: 'global', country: 'Global', theme: 'Base Metals',      benchmarkGroup: 'Commodities', factorTags: ['metals','industrials','cyclical','china'] },
  { symbol: 'PDBC', name: 'Invesco Commodity ETF',         assetType: 'etf', region: 'global', country: 'Global', theme: 'Broad Commodities', benchmarkGroup: 'Commodities', factorTags: ['commodities','energy','metals'] },

  // ── Fixed Income ───────────────────────────────────────────────────────────
  { symbol: 'TLT',  name: 'iShares 20+ Year Treasury ETF',  assetType: 'etf', region: 'us', country: 'USA', theme: 'Long Bonds',   benchmarkGroup: 'Fixed Income', factorTags: ['bonds','rates','defensive','duration'] },
  { symbol: 'IEF',  name: 'iShares 7-10 Year Treasury ETF', assetType: 'etf', region: 'us', country: 'USA', theme: 'Medium Bonds', benchmarkGroup: 'Fixed Income', factorTags: ['bonds','rates','defensive'] },
  { symbol: 'SHY',  name: 'iShares 1-3 Year Treasury ETF',  assetType: 'etf', region: 'us', country: 'USA', theme: 'Short Bonds',  benchmarkGroup: 'Fixed Income', factorTags: ['bonds','short-duration','defensive'] },
  { symbol: 'HYG',  name: 'iShares High Yield Corporate Bond ETF', assetType: 'etf', region: 'us', country: 'USA', theme: 'High Yield', benchmarkGroup: 'Fixed Income', factorTags: ['bonds','credit','risk-on'] },
  { symbol: 'LQD',  name: 'iShares IG Corporate Bond ETF',  assetType: 'etf', region: 'us', country: 'USA', theme: 'IG Bonds',     benchmarkGroup: 'Fixed Income', factorTags: ['bonds','credit','defensive','rates'] },
  { symbol: 'EMB',  name: 'iShares EM USD Bond ETF',         assetType: 'etf', region: 'em', country: 'Multi', theme: 'EM Bonds',   benchmarkGroup: 'Fixed Income', factorTags: ['bonds','em','credit','dollar'] },
  { symbol: 'TIP',  name: 'iShares TIPS Bond ETF',           assetType: 'etf', region: 'us', country: 'USA', theme: 'Inflation Bonds', benchmarkGroup: 'Fixed Income', factorTags: ['bonds','inflation','defensive'] },

  // ── Alternatives ───────────────────────────────────────────────────────────
  { symbol: 'VIXY', name: 'ProShares VIX Short-Term Futures ETF', assetType: 'etf', region: 'us', country: 'USA', theme: 'Volatility', benchmarkGroup: 'Alternatives', factorTags: ['volatility','risk-off','hedge'] },
  { symbol: 'UUP',  name: 'Invesco DB US Dollar Bullish ETF',      assetType: 'etf', region: 'us', country: 'USA', theme: 'US Dollar',  benchmarkGroup: 'Currencies',   factorTags: ['dollar','currencies','rates'] },
];

// Macro proxies fetched alongside universe (many are already in universe)
export const MACRO_PROXY_SYMBOLS = ['SPY', 'QQQ', 'GLD', 'TLT', 'USO', 'XLF', 'SMH', 'EEM', 'HYG', 'UUP', 'VIXY', 'IEF'];

// For the explanation engine: map factorTag → proxy + human label
export const FACTOR_PROXY: Record<string, { proxy: string; label: string }> = {
  'tech':           { proxy: 'QQQ',  label: 'Tech/QQQ' },
  'semis':          { proxy: 'SMH',  label: 'Semis/SMH' },
  'ai':             { proxy: 'SMH',  label: 'AI/Semis' },
  'growth':         { proxy: 'QQQ',  label: 'Growth/QQQ' },
  'energy':         { proxy: 'USO',  label: 'Oil/USO' },
  'oil':            { proxy: 'USO',  label: 'Crude oil' },
  'gold':           { proxy: 'GLD',  label: 'Gold/GLD' },
  'precious-metals':{ proxy: 'GLD',  label: 'Precious metals' },
  'bonds':          { proxy: 'TLT',  label: 'Long bonds/TLT' },
  'duration':       { proxy: 'TLT',  label: 'Rates/TLT' },
  'rates':          { proxy: 'IEF',  label: 'Rates/IEF' },
  'financials':     { proxy: 'XLF',  label: 'Financials/XLF' },
  'em':             { proxy: 'EEM',  label: 'EM/EEM' },
  'china':          { proxy: 'EEM',  label: 'EM/China' },
  'india':          { proxy: 'EEM',  label: 'EM sentiment' },
  'risk-on':        { proxy: 'HYG',  label: 'Risk appetite/HYG' },
  'credit':         { proxy: 'HYG',  label: 'Credit/HYG' },
  'defensive':      { proxy: 'TLT',  label: 'Flight-to-safety' },
  'risk-off':       { proxy: 'GLD',  label: 'Risk-off/GLD' },
  'volatility':     { proxy: 'VIXY', label: 'Volatility/VIX' },
  'dollar':         { proxy: 'UUP',  label: 'USD/UUP' },
  'us-equity':      { proxy: 'SPY',  label: 'S&P 500/SPY' },
};
