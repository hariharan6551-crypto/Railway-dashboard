/**
 * Activity Log API Endpoint
 * - Tracks all user actions (login, upload, delete, update, view)
 * - Supports filtering by user, action type, date range
 * - Maintains upload history with versioning
 */

const activityLog = [];
const uploadHistory = [];
const MAX_LOG = 2000;
const MAX_UPLOADS = 500;

module.exports = async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Session-Token");

    if (req.method === "OPTIONS") return res.status(200).end();

    try {
        const { action } = req.method === 'POST' ? (req.body || {}) : (req.query || {});

        // ═══════ LOG AN ACTIVITY ═══════
        if (action === 'log' && req.method === 'POST') {
            const { username, actionType, fileName, fileType, details, metadata } = req.body;

            const entry = {
                id: Date.now().toString(36) + Math.random().toString(36).substr(2, 6),
                username: username || 'system',
                actionType: actionType || 'unknown',
                fileName: fileName || null,
                fileType: fileType || null,
                details: details || '',
                metadata: metadata || {},
                timestamp: Date.now(),
                date: new Date().toISOString()
            };

            activityLog.push(entry);
            if (activityLog.length > MAX_LOG) activityLog.splice(0, activityLog.length - (MAX_LOG / 2));

            return res.status(200).json({ success: true, entry });
        }

        // ═══════ GET ACTIVITY LOG ═══════
        if (action === 'list' || (action === 'get' && req.method === 'GET')) {
            let logs = [...activityLog];
            const { user, type, from, to, limit, search } = req.query;

            if (user) logs = logs.filter(l => l.username === user);
            if (type) logs = logs.filter(l => l.actionType === type);
            if (from) logs = logs.filter(l => l.timestamp >= parseInt(from));
            if (to) logs = logs.filter(l => l.timestamp <= parseInt(to));
            if (search) {
                const s = search.toLowerCase();
                logs = logs.filter(l =>
                    (l.fileName && l.fileName.toLowerCase().includes(s)) ||
                    (l.details && l.details.toLowerCase().includes(s)) ||
                    (l.username && l.username.toLowerCase().includes(s))
                );
            }

            // Sort latest first
            logs.sort((a, b) => b.timestamp - a.timestamp);

            const maxItems = Math.min(parseInt(limit || '100'), 500);
            logs = logs.slice(0, maxItems);

            return res.status(200).json({
                logs,
                total: activityLog.length,
                filtered: logs.length,
                serverTime: Date.now()
            });
        }

        // ═══════ TRACK FILE UPLOAD ═══════
        if (action === 'trackUpload' && req.method === 'POST') {
            const { username, fileName, fileType, fileSize, version, status } = req.body;

            const upload = {
                id: Date.now().toString(36) + Math.random().toString(36).substr(2, 6),
                username: username || 'admin',
                fileName: fileName || 'unknown',
                fileType: fileType || 'unknown',
                fileSize: fileSize || 0,
                version: version || 1,
                versionLabel: `v${version || 1}`,
                status: status || 'LIVE',
                uploadCount: 1,
                timestamp: Date.now(),
                date: new Date().toISOString()
            };

            // Check for existing file — increment version
            const existing = uploadHistory.find(u => u.fileName === fileName);
            if (existing) {
                existing.version++;
                existing.versionLabel = `v${existing.version}`;
                existing.uploadCount++;
                existing.lastUpdated = Date.now();
                existing.lastUpdatedBy = username;
                existing.fileSize = fileSize || existing.fileSize;
                existing.status = status || existing.status;

                // Also log the version update
                activityLog.push({
                    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 8),
                    username: username || 'admin',
                    actionType: 'file_update',
                    fileName,
                    fileType,
                    details: `Updated to ${existing.versionLabel} (upload #${existing.uploadCount})`,
                    metadata: { version: existing.version, size: fileSize },
                    timestamp: Date.now(),
                    date: new Date().toISOString()
                });

                return res.status(200).json({ success: true, upload: existing, isUpdate: true });
            }

            uploadHistory.push(upload);
            if (uploadHistory.length > MAX_UPLOADS) uploadHistory.splice(0, uploadHistory.length - (MAX_UPLOADS / 2));

            // Also log the upload event
            activityLog.push({
                id: Date.now().toString(36) + Math.random().toString(36).substr(2, 8),
                username: username || 'admin',
                actionType: 'file_upload',
                fileName,
                fileType,
                details: `Uploaded ${fileName} (${upload.versionLabel})`,
                metadata: { version: 1, size: fileSize },
                timestamp: Date.now(),
                date: new Date().toISOString()
            });

            return res.status(200).json({ success: true, upload, isUpdate: false });
        }

        // ═══════ GET UPLOAD HISTORY ═══════
        if (action === 'uploads' && req.method === 'GET') {
            let uploads = [...uploadHistory];
            const { user, fileType, status, sort } = req.query;

            if (user) uploads = uploads.filter(u => u.username === user);
            if (fileType) uploads = uploads.filter(u => u.fileType === fileType);
            if (status) uploads = uploads.filter(u => u.status === status);

            // Sort
            if (sort === 'name') {
                uploads.sort((a, b) => a.fileName.localeCompare(b.fileName));
            } else if (sort === 'version') {
                uploads.sort((a, b) => b.version - a.version);
            } else {
                uploads.sort((a, b) => b.timestamp - a.timestamp);
            }

            return res.status(200).json({
                uploads,
                total: uploadHistory.length,
                serverTime: Date.now()
            });
        }

        // ═══════ GET STATS ═══════
        if (action === 'stats') {
            const now = Date.now();
            const today = activityLog.filter(l => now - l.timestamp < 86400000);
            const loginCount = activityLog.filter(l => l.actionType === 'login').length;
            const uploadCount = activityLog.filter(l => l.actionType === 'file_upload').length;
            const updateCount = activityLog.filter(l => l.actionType === 'file_update').length;
            const deleteCount = activityLog.filter(l => l.actionType === 'file_delete').length;

            const users = [...new Set(activityLog.map(l => l.username))];

            return res.status(200).json({
                total: activityLog.length,
                today: today.length,
                loginCount,
                uploadCount,
                updateCount,
                deleteCount,
                activeUsers: users,
                totalUploads: uploadHistory.length,
                serverTime: Date.now()
            });
        }

        return res.status(400).json({ error: 'Invalid action. Use: log, list, trackUpload, uploads, stats' });

    } catch (err) {
        console.error('Activity log error:', err);
        return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
};
