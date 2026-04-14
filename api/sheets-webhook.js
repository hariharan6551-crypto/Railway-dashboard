/**
 * Webhook endpoint for Google Sheets change notifications
 * - Validates incoming webhook requests
 * - Broadcasts updates to connected clients via response
 * - Logs all webhook events
 */

const webhookLog = [];

module.exports = async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Webhook-Secret");

    if (req.method === "OPTIONS") return res.status(200).end();

    // GET — return recent webhook events (for polling clients)
    if (req.method === "GET") {
        const since = parseInt(req.query.since || '0');
        const events = webhookLog.filter(e => e.ts > since).slice(-50);
        return res.status(200).json({
            events,
            serverTime: Date.now(),
            totalEvents: webhookLog.length
        });
    }

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    // Validate webhook secret if configured
    const webhookSecret = process.env.SHEETS_WEBHOOK_SECRET;
    if (webhookSecret) {
        const incomingSecret = req.headers['x-webhook-secret'];
        if (incomingSecret !== webhookSecret) {
            console.warn('Webhook: Invalid secret received');
            return res.status(403).json({ error: "Invalid webhook secret" });
        }
    }

    try {
        const payload = req.body || {};
        
        const event = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 6),
            ts: Date.now(),
            type: payload.type || 'sheet_updated',
            spreadsheetId: payload.spreadsheetId || null,
            sheetName: payload.sheetName || null,
            changedRange: payload.changedRange || null,
            changedCells: payload.changedCells || [],
            source: payload.source || 'external',
            metadata: {
                userAgent: req.headers['user-agent'] || 'unknown',
                ip: req.headers['x-forwarded-for'] || 'unknown'
            }
        };

        webhookLog.push(event);

        // Keep log manageable
        if (webhookLog.length > 500) {
            webhookLog.splice(0, webhookLog.length - 200);
        }

        console.log(`Webhook received: ${event.type} for sheet ${event.spreadsheetId}`);

        return res.status(200).json({
            success: true,
            eventId: event.id,
            message: 'Webhook processed successfully'
        });

    } catch (err) {
        console.error('Webhook error:', err);
        return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
};
