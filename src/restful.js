"use strict";
const express = require('express');
const EventEmitter = require('events');

class RestFul extends EventEmitter {
    constructor(config) {
        super();
        this.restFulPort = config.port;
        this.restFulDebug = config.debug;

        this.restFulData = {
            info: 'This data is not available in your system.',
            state: 'This data is not available in your system.',
            consoleslist: 'This data is not available in your system.',
            profile: 'This data is not available in your system.',
            apps: 'This data is not available in your system.',
            storages: 'This data is not available in your system.',
            status: 'This data is not available in your system.'
        };
        this.connect();
    };

    connect() {
        try {
            const restFul = express();
            restFul.set('json spaces', 2);
            restFul.get('/info', (req, res) => { res.json(this.restFulData.info) });
            restFul.get('/state', (req, res) => { res.json(this.restFulData.state) });
            restFul.get('/consoleslist', (req, res) => { res.json(this.restFulData.consoleslist) });
            restFul.get('/profile', (req, res) => { res.json(this.restFulData.profile) });
            restFul.get('/apps', (req, res) => { res.json(this.restFulData.apps) });
            restFul.get('/storages', (req, res) => { res.json(this.restFulData.storages) });
            restFul.get('/status', (req, res) => { res.json(this.restFulData.status) });

            restFul.listen(this.restFulPort, () => {
                this.emit('connected', `RESTful started on port: ${this.restFulPort}`)
            });

        } catch (error) {
            this.emit('error', `RESTful error: ${error}`)
        }
    };

    update(path, data) {
        switch (path) {
            case 'info':
                this.restFulData.info = data;
                break;
            case 'state':
                this.restFulData.state = data;
                break;
            case 'consoleslist':
                this.restFulData.consoleslist = data;
                break;
            case 'profile':
                this.restFulData.profile = data;
                break;
            case 'apps':
                this.restFulData.apps = data;
                break;
            case 'storages':
                this.restFulData.storages = data;
                break;
            case 'status':
                this.restFulData.status = data;
                break;
            default:
                this.emit('debug', `RESTFul update unknown path: ${path}, data: ${data}`)
                break;
        };
        const emitDebug = this.restFulDebug ? this.emit('debug', `RESTFul update path: ${path}, data: ${JSON.stringify(data, null, 2)}`) : false;
    };
};
module.exports = RestFul;