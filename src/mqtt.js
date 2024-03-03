"use strict";
const MQTT = require("async-mqtt");
const EventEmitter = require('events');

class MQTTCLIENT extends EventEmitter {
    constructor(config) {
        super();
        this.mqttHost = config.host;
        this.mqttPort = config.port;
        this.mqttClientId = config.clientId;
        this.mqttPrefix = config.prefix;
        this.mqttUser = config.user;
        this.mqttPasswd = config.passwd;
        this.mqttDebug = config.debug;
        this.isConnected = false;

        this.connect();
    };

    async connect() {
        try {
            const options = {
                clientId: this.mqttClientId,
                username: this.mqttUser,
                password: this.mqttPasswd
            }
            const url = `mqtt://${this.mqttHost}:${this.mqttPort}`;
            this.mqttClient = await MQTT.connectAsync(url, options);
            this.emit('connected', 'MQTT Connected.');
            this.isConnected = true;

            this.subscribe();
        } catch (error) {
            this.isConnected = false;
            this.emit('error', `MQTT Connect error: ${error}`);
        };
    };

    async subscribe() {
        try {
            this.mqttClient.on('message', (topic, message) => {
                const subscribehMessage = JSON.parse(message.toString());
                const emitDebug = this.mqttDebug ? this.emit('debug', `MQTT Received topic: ${topic}, message: ${JSON.stringify(subscribehMessage, null, 2)}`) : false;
                this.emit('changeState', subscribehMessage);
            });

            const topic = `${this.mqttPrefix}/Set`;
            await this.mqttClient.subscribe(topic);
            this.emit('connected', `MQTT Subscribe topic: ${topic}.`);
        } catch (error) {
            this.emit('error', `MQTT Subscribe error: ${error}`);
        };
    };

    async send(topic, message) {
        if (!this.isConnected) {
            const debug = this.mqttDebug ? this.emit('debug', `MQTT client not connected.`) : false;
            return
        };

        try {
            const fullTopic = `${this.mqttPrefix}/${topic}`;
            const publishMessage = JSON.stringify(message, null, 2);
            await this.mqttClient.publish(fullTopic, publishMessage);
            const debug = this.mqttDebug ? this.emit('debug', `MQTT publish: ${fullTopic}: ${publishMessage}`) : false;
        } catch (error) {
            this.emit('error', `MQTT Publish error: ${error}`);
        };
    };
};
module.exports = MQTTCLIENT;