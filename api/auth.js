/**
 * Authentication API Endpoint
 * - Session-based auth with secure token generation
 * - Supports login, logout, and session validation
 * - Logs all authentication events
 */

const crypto = require('crypto');

// In-memory session store (per serverless instance)
// In production, use Redis or a database
const sessions = new Map();
const authLog = [];

// Default admin credentials (in production, use hashed passwords in a database)
const USERS = [
    { username: 'admin', password: 'admin123', role: 'admin', displayName: 'Administrator' },
    { username: 'operator', password: 'rail2026', role: 'operator', displayName: 'Rail Operator' },
    { username: 'analyst', password: 'data2026', role: 'analyst', displayName: 'Data Analyst' },
    { username: 'Mari@2001', password: 'Mari@9087', role: 'admin', displayName: 'Mari' }
];

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function logAuthEvent(action, username, ip, success, details = '') {
    const event = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 6),
        action,
        username: username || 'unknown',
        ip: ip || 'unknown',
        success,
        details,
        timestamp: Date.now(),
        date: new Date().toISOString()
    };
    authLog.push(event);
    if (authLog.length > 1000) authLog.splice(0, authLog.length - 500);
    console.log(`[AUTH] ${action} - ${username} - ${success ? 'SUCCESS' : 'FAILED'} - ${details}`);
    return event;
}

module.exports = async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Session-Token");

    if (req.method === "OPTIONS") return res.status(200).end();

    const clientIP = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';

    try {
        const action = (req.query && req.query.action) || (req.body && req.body.action);

        // ═══════ LOGIN ═══════
        if (action === 'login' && req.method === 'POST') {
            const { username, password } = req.body;

            if (!username || !password) {
                logAuthEvent('login', username, clientIP, false, 'Missing credentials');
                return res.status(400).json({ error: 'Username and password are required' });
            }

            const user = USERS.find(u => u.username.toLowerCase() === username.toLowerCase().trim() && u.password === password);
            if (!user) {
                logAuthEvent('login', username, clientIP, false, 'Invalid credentials');
                return res.status(401).json({ error: 'Invalid username or password' });
            }

            // Create session
            const token = generateToken();
            const session = {
                token,
                username: user.username,
                role: user.role,
                displayName: user.displayName,
                loginTime: Date.now(),
                ip: clientIP,
                lastActivity: Date.now()
            };
            sessions.set(token, session);

            logAuthEvent('login', user.username, clientIP, true, `Role: ${user.role}`);

            return res.status(200).json({
                success: true,
                token,
                user: {
                    username: user.username,
                    role: user.role,
                    displayName: user.displayName
                },
                message: 'Authentication successful'
            });
        }

        // ═══════ VALIDATE SESSION ═══════
        if (action === 'validate') {
            const token = req.headers['x-session-token'] || (req.body && req.body.token) || (req.query && req.query.token);
            if (!token) {
                return res.status(401).json({ valid: false, error: 'No session token provided' });
            }

            const session = sessions.get(token);
            if (!session) {
                return res.status(401).json({ valid: false, error: 'Invalid or expired session' });
            }

            // Update last activity
            session.lastActivity = Date.now();

            return res.status(200).json({
                valid: true,
                user: {
                    username: session.username,
                    role: session.role,
                    displayName: session.displayName,
                    loginTime: session.loginTime
                }
            });
        }

        // ═══════ LOGOUT ═══════
        if (action === 'logout') {
            const token = req.headers['x-session-token'] || (req.body && req.body.token) || (req.query && req.query.token);
            if (token) {
                const session = sessions.get(token);
                if (session) {
                    logAuthEvent('logout', session.username, clientIP, true, 'Manual logout');
                    sessions.delete(token);
                }
            }
            return res.status(200).json({ success: true, message: 'Logged out successfully' });
        }

        // ═══════ AUTH LOG ═══════
        if (action === 'log' && req.method === 'GET') {
            const limit = parseInt(req.query.limit || '50');
            const recentLogs = authLog.slice(-limit).reverse();
            return res.status(200).json({ logs: recentLogs, total: authLog.length });
        }

        return res.status(400).json({ error: 'Invalid action. Use: login, validate, logout, log' });

    } catch (err) {
        console.error('Auth error:', err);
        return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
};
