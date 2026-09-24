import express, { json } from 'express';
import EventEmitter from 'events';
import { createHash, timingSafeEqual } from 'crypto';

const DEFAULT_MESSAGE = 'This data is not available at this time.';

class RestFul extends EventEmitter {
    constructor(config) {
        super();
        this.port = config.port;
        this.token = typeof config.token === 'string' ? config.token.trim() : '';
        this.logWarn = config.logWarn;
        this.logDebug = config.logDebug;

        this.restFulData = {
            info: DEFAULT_MESSAGE,
            state: DEFAULT_MESSAGE,
            operation: DEFAULT_MESSAGE,
            consoleslist: DEFAULT_MESSAGE,
            profile: DEFAULT_MESSAGE,
            apps: DEFAULT_MESSAGE,
            storages: DEFAULT_MESSAGE
        }
        this.connect();
    }

    connect() {
        try {
            const app = express();
            app.set('json spaces', 2);

            // Request rate limit per client, protects Homebridge from request floods (CWE-770)
            const rateLimitWindow = 60 * 1000;
            const rateLimitMax = 600;
            const rateLimitClients = 1000;
            const clients = new Map();
            let clientsLimitWarned = 0;
            app.use((req, res, next) => {
                const now = Date.now();

                // Drop expired windows so the map cannot grow without limit
                if (clients.size > 100) {
                    for (const [ip, client] of clients) {
                        if (now - client.start >= rateLimitWindow) clients.delete(ip);
                    }
                }

                let client = clients.get(req.ip);
                if (!client || now - client.start >= rateLimitWindow) {
                    // Hard limit of tracked addresses, new addresses wait until older windows expire
                    if (!client && clients.size >= rateLimitClients) {
                        if (now - clientsLimitWarned >= rateLimitWindow) {
                            clientsLimitWarned = now;
                            if (this.logWarn) this.emit('warn', `RESTFul too many clients (${rateLimitClients}) in one minute, new clients are rejected until the window ends`);
                        }
                        res.set('Retry-After', String(Math.ceil(rateLimitWindow / 1000)));
                        return res.status(429).json({ error: 'RESTFul Too Many Requests' });
                    }
                    client = { count: 0, start: now, warned: false };
                    clients.set(req.ip, client);
                }

                if (++client.count > rateLimitMax) {
                    // Warn once per client and window, a flood must not flood the log too
                    if (!client.warned && this.logWarn) this.emit('warn', `RESTFul rate limit ${rateLimitMax} requests per minute exceeded by: ${req.ip}, further requests are rejected until the window ends`);
                    client.warned = true;
                    res.set('Retry-After', String(Math.ceil((client.start + rateLimitWindow - now) / 1000)));
                    return res.status(429).json({ error: 'RESTFul Too Many Requests' });
                }

                next();
            });

            app.use(json());

            // Optional token auth, when a token is configured every route requires "Authorization: Bearer <token>"
            if (this.token) {
                app.use((req, res, next) => {
                    const header = req.headers.authorization ?? '';
                    const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
                    if (!this.tokenValid(provided)) {
                        if (this.logWarn) this.emit('warn', `RESTFul Unauthorized request from: ${req.ip}, ${req.method} ${req.path}`);
                        return res.status(401).json({ error: 'RESTFul Unauthorized' });
                    }
                    next();
                });
            }

            // Register GET routes for all keys
            for (const key of Object.keys(this.restFulData)) {
                app.get(`/${key}`, (req, res) => {
                    res.json(this.restFulData[key]);
                });
            }

            // Health check route
            app.get('/status', (req, res) => {
                res.json({
                    status: 'online',
                    uptime: process.uptime(),
                    available_paths: Object.keys(this.restFulData).map(k => `/${k}`)
                });
            });

            // POST route to update values
            app.post('/', (req, res) => {
                try {
                    const obj = req.body;
                    if (!obj || typeof obj !== 'object' || Object.keys(obj).length === 0) {
                        if (this.logWarn) this.emit('warn', 'RESTFul Invalid JSON payload');
                        return res.status(400).json({ error: 'RESTFul Invalid JSON payload' });
                    }

                    const key = Object.keys(obj)[0];
                    const value = obj[key];
                    this.emit('set', key, value);
                    this.update(key, value);

                    if (this.logDebug) this.emit('debug', `RESTFul post data: ${JSON.stringify(obj, null, 2)}`);

                    res.json({ success: true, received: obj });
                } catch (error) {
                    if (this.logWarn) this.emit('warn', `RESTFul Parse error: ${error}`);
                    res.status(500).json({ error: 'RESTFul Internal Server Error' });
                }
            });

            // Start the server
            this.server = app.listen(this.port, () => {
                this.emit('connected', `RESTful started on port: ${this.port}`);
            });
        } catch (error) {
            if (this.logWarn) this.emit('warn', `RESTful Connect error: ${error}`);
        }
    }

    close() {
        if (this.server) {
            this.server.close();
            this.server = null;
        }
    }

    tokenValid(provided) {
        // Compare fixed-length hashes so the check takes the same time regardless of token length or content
        const a = createHash('sha256').update(provided).digest();
        const b = createHash('sha256').update(this.token).digest();
        return timingSafeEqual(a, b);
    }

    update(path, data) {
        if (this.restFulData.hasOwnProperty(path)) {
            this.restFulData[path] = data;
        } else {
            if (this.logWarn) this.emit('warn', `Unknown RESTFul update path: ${path}, data: ${JSON.stringify(data)}`);
            return;
        }

        if (this.logDebug) this.emit('debug', `RESTFul update path: ${path}, data: ${JSON.stringify(data)}`);
    }
}
export default RestFul;