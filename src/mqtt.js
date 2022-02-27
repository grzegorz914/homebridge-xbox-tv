"use strict";
const MQTT = require("async-mqtt");
const EventEmitter = require('events');

class MQTTCLIENT extends EventEmitter {
    constructor(config) {
        super();
        this.mqttEnabled = config.enabled;
        this.mqttHost = config.host;
        this.mqttPort = config.port;
        this.mqttPrefix = config.prefix;
        this.mqttTopic = config.topic;
        this.mqttAuth = config.auth;
        this.mqttUser = config.user;
        this.mqttPasswd = config.passwd;
        this.mqttDebug = config.debug;
        this.isConnected = false;

        const run = this.mqttEnabled ? this.connect() : false;
    };

    async connect() {
        try {
            const options = {
                username: this.mqttUser,
                password: this.mqttPasswd
            }
            const url = `mqtt://${this.mqttHost}:${this.mqttPort}`;
            this.mqttClient = await MQTT.connectAsync(url, options);

            this.isConnected = true;
            this.emit('connected', 'MQTT Connected.');
        } catch (error) {
            this.isConnected = false;
            this.emit('error', error);
        };
    };

    async send(topic, message) {
        if (!this.isConnected) {
            return
        };

        try {
            const fullTopic = `${this.mqttPrefix}/${this.mqttTopic}/${topic}`;
            await this.mqttClient.publish(fullTopic, message);
            const emitDebug = this.mqttDebug ? this.emit('debug', `MQTT publish: ${fullTopic}: ${message}`) : false;
        } catch (error) {
            await this.mqttClient.end();
            this.isConnected = false;
            this.emit('disconnected', 'MQTT Disconnected, trying to reconnect.');

            setTimeout(() => {
                this.connect();
            }, 5000);
        };
    };
};
module.exports = MQTTCLIENT;