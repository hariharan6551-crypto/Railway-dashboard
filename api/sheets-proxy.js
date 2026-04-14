/**
 * Serverless API Proxy for Google Sheets
 * - Keeps API key on server side (never exposed to frontend)
 * - Validates incoming requests
 * - Rate limiting protection
 * - Caching layer with auto-invalidation
 */

// In-memory cache (per serverless instance)
const cache = new Map();
const CACHE_TTL_MS = 800; // ~800ms cache to reduce API calls, but never stale
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 60; // max requests per window

function isRateLimited(ip) {
    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
        rateLimitMap.set(ip, { windowStart: now, count: 1 });
        return false;
    }
    entry.count++;
    if (entry.count > RATE_LIMIT_MAX) return true;
    return false;
}

function getCached(key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL_MS) {
        cache.delete(key);
        return null;
    }
    return entry.data;
}

function setCache(key, data) {
    cache.set(key, { data, ts: Date.now() });
    // Cleanup old entries
    if (cache.size > 100) {
        const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts);
        for (let i = 0; i < 50; i++) cache.delete(oldest[i][0]);
    }
}

module.exports = async (req, res) => {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Request-Token");

    if (req.method === "OPTIONS") return res.status(200).end();

    // Rate limiting
    const clientIP = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
    if (isRateLimited(clientIP)) {
        return res.status(429).json({ error: 'Rate limit exceeded. Try again later.', retryAfter: 60 });
    }

    const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
    if (!API_KEY) {
        return res.status(500).json({ error: 'Server configuration error: API key not set.' });
    }

    try {
        const { action, spreadsheetId, sheetName } = req.method === 'POST' ? req.body : req.query;

        if (!spreadsheetId) {
            return res.status(400).json({ error: 'Missing spreadsheetId parameter.' });
        }

        // Validate spreadsheet ID format
        if (!/^[a-zA-Z0-9_-]+$/.test(spreadsheetId)) {
            return res.status(400).json({ error: 'Invalid spreadsheetId format.' });
        }

        if (action === 'metadata') {
            const cacheKey = `meta_${spreadsheetId}`;
            const cached = getCached(cacheKey);
            if (cached) return res.status(200).json({ ...cached, fromCache: true });

            const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?key=${API_KEY}&fields=sheets.properties`;
            const response = await fetch(url);
            if (!response.ok) {
                const errBody = await response.text();
                return res.status(response.status).json({ error: `Google API error: ${response.status}`, detail: errBody });
            }
            const data = await response.json();
            const result = {
                sheetNames: data.sheets.map(s => s.properties.title),
                sheetMeta: data.sheets.map(s => ({
                    title: s.properties.title,
                    index: s.properties.index,
                    rowCount: s.properties.gridProperties?.rowCount,
                    colCount: s.properties.gridProperties?.columnCount
                }))
            };
            setCache(cacheKey, result);
            return res.status(200).json(result);
        }

        if (action === 'data') {
            const sheet = sheetName || 'Sheet1';
            const cacheKey = `data_${spreadsheetId}_${sheet}`;
            const cached = getCached(cacheKey);
            if (cached) return res.status(200).json({ ...cached, fromCache: true });

            const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheet)}?key=${API_KEY}`;
            const response = await fetch(url);
            if (!response.ok) {
                const errBody = await response.text();
                return res.status(response.status).json({ error: `Google API error: ${response.status}`, detail: errBody });
            }
            const data = await response.json();
            const result = {
                sheetName: sheet,
                values: data.values || [],
                rowCount: (data.values || []).length,
                hash: simpleHash(JSON.stringify(data.values || []))
            };
            setCache(cacheKey, result);
            return res.status(200).json(result);
        }

        if (action === 'allSheets') {
            const cacheKey = `all_${spreadsheetId}`;
            const cached = getCached(cacheKey);
            if (cached) return res.status(200).json({ ...cached, fromCache: true });

            // First get metadata
            const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?key=${API_KEY}&fields=sheets.properties`;
            const metaRes = await fetch(metaUrl);
            if (!metaRes.ok) {
                return res.status(metaRes.status).json({ error: `Failed to fetch metadata: ${metaRes.status}` });
            }
            const metaData = await metaRes.json();
            const sheetNames = metaData.sheets.map(s => s.properties.title);

            // Fetch all sheets in parallel
            const sheetPromises = sheetNames.map(async name => {
                const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(name)}?key=${API_KEY}`;
                const r = await fetch(url);
                if (r.ok) {
                    const d = await r.json();
                    return { name, values: d.values || [] };
                }
                return { name, values: [] };
            });

            const sheetsResults = await Promise.all(sheetPromises);
            const sheets = {};
            sheetsResults.forEach(s => { sheets[s.name] = s.values; });

            const result = {
                type: 'sheets',
                sheetNames,
                sheets,
                hash: simpleHash(JSON.stringify(sheets)),
                fetchedAt: Date.now()
            };
            setCache(cacheKey, result);
            return res.status(200).json(result);
        }

        return res.status(400).json({ error: 'Invalid action. Use: metadata, data, allSheets' });

    } catch (err) {
        console.error('Sheets proxy error:', err);
        return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
};

function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return hash.toString(36);
}
