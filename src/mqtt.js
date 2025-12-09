import { connect } from 'mqtt';
import EventEmitter from 'events';

class Mqtt extends EventEmitter {
    constructor(config) {
        super();

        const url = `mqtt://${config.host}:${config.port}`;
        const subscribeTopic = `${config.prefix}/Set`;

        const options = {
            clientId: config.clientId,
            username: config.user,
            password: config.passwd,
            protocolVersion: 5,
            clean: false,
            properties: {
                sessionExpiryInterval: 60 * 60, // 1 hour
                userProperties: {
                    source: 'node-client'
                }
            }
        };

        this.mqttClient = connect(url, options);

        // === CONNECTED ===
        this.mqttClient.on('connect', async (packet) => {
            this.emit('connected', 'MQTT v5 connected.');

            try {
                const result = await this.mqttClient.subscribeAsync(subscribeTopic, {
                    qos: 1,
                    properties: {
                        userProperties: {
                            type: 'subscription'
                        }
                    }
                });

                // MQTT v5 subscription results contain reason codes
                if (config.logDebug) this.emit('debug', `Subscribed to ${subscribeTopic}, reason codes: ${JSON.stringify(result)}`);
                this.emit('subscribed', `MQTT Subscribe topic: ${subscribeTopic}`);

            } catch (error) {
                if (config.logWarn) this.emit('warn', `MQTT Subscribe error: ${error}`);
            }
        });

        // === MESSAGE ===
        this.mqttClient.on('message', (topic, payload, packet) => {
            try {
                const obj = JSON.parse(payload.toString());
                if (config.logDebug) this.emit('debug', `MQTT Received:\nTopic: ${topic}\nPayload: ${JSON.stringify(obj, null, 2)}\nProperties: ${JSON.stringify(packet.properties, null, 2)}`);

                const key = Object.keys(obj)[0];
                const value = Object.values(obj)[0];
                this.emit('set', key, value);

            } catch (error) {
                if (config.logWarn) this.emit('warn', `MQTT Parse error: ${error}`);
            }
        });

        // === PUBLISH EVENT ===
        this.on('publish', async (topic, message) => {
            try {
                const fullTopic = `${config.prefix}/${topic}`;
                const publishMessage = JSON.stringify(message);

                await this.mqttClient.publishAsync(fullTopic, publishMessage, {
                    qos: 1,
                    properties: {
                        contentType: 'application/json',
                        userProperties: {
                            source: 'node',
                            action: 'set'
                        }
                    }
                });

                if (config.logDebug) this.emit('debug', `MQTT Publish:\nTopic: ${fullTopic}\nPayload: ${publishMessage}`);
            } catch (error) {
                if (config.logWarn) this.emit('warn', `MQTT Publish error: ${error}`);
            }
        });

        // === ERRORS / STATE ===
        this.mqttClient.on('error', (err) => {
            this.emit('warn', `MQTT Error: ${err.message}`);
        });

        this.mqttClient.on('reconnect', () => {
            if (config.logDebug) this.emit('debug', 'MQTT Reconnecting...');
        });

        this.mqttClient.on('close', () => {
            if (config.logDebug) this.emit('debug', 'MQTT Connection closed.');
        });
    }
}

export default Mqtt;