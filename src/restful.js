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