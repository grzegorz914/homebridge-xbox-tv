import express, { json } from 'express';
import EventEmitter from 'events';

const DEFAULT_MESSAGE = 'This data is not available at this time.';

class RestFul extends EventEmitter {
    constructor(config) {
        super();
        this.restFulPort = config.port;
        this.restFulDebug = config.debug;

        this.restFulData = {
            info: DEFAULT_MESSAGE,
            state: DEFAULT_MESSAGE,
            operation: DEFAULT_MESSAGE,
            consoleslist: DEFAULT_MESSAGE,
            profile: DEFAULT_MESSAGE,
            apps: DEFAULT_MESSAGE,
            storages: DEFAULT_MESSAGE,
            status: DEFAULT_MESSAGE
        }
        this.connect();
    }

    connect() {
        try {
            const app = express();
            app.set('json spaces', 2);
            app.use(json());

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
                        this.emit('warn', 'RESTFul Invalid JSON payload');
                        return res.status(400).json({ error: 'RESTFul Invalid JSON payload' });
                    }

                    const key = Object.keys(obj)[0];
                    const value = obj[key];
                    this.emit('set', key, value);
                    this.update(key, value);

                    if (this.restFulDebug) {
                        this.emit('debug', `RESTFul post data: ${JSON.stringify(obj, null, 2)}`);
                    }

                    res.json({ success: true, received: obj });
                } catch (error) {
                    this.emit('warn', `RESTFul Parse error: ${error}`);
                    res.status(500).json({ error: 'RESTFul Internal Server Error' });
                }
            });

            // Start the server
            app.listen(this.restFulPort, () => {
                this.emit('connected', `RESTful started on port: ${this.restFulPort}`);
            });
        } catch (error) {
            this.emit('warn', `RESTful Connect error: ${error}`);
        }
    }

    update(path, data) {
        if (this.restFulData.hasOwnProperty(path)) {
            this.restFulData[path] = data;
        } else {
            this.emit('warn', `Unknown RESTFul update path: ${path}, data: ${JSON.stringify(data)}`);
            return;
        }

        if (this.restFulDebug) this.emit('debug', `RESTFul update path: ${path}, data: ${JSON.stringify(data)}`);
    }
}
export default RestFul;