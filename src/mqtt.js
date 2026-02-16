import { connect } from 'mqtt';
import EventEmitter from 'events';

class Mqtt extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;

        const url = `mqtt://${config.host}:${config.port}`;
        const subscribeTopic = `${config.prefix}/Set`;

        const options = {
            clientId: config.clientId,
            username: config.user,
            password: config.passwd,
            protocolVersion: 5,
            clean: false,
            properties: {
                sessionExpiryInterval: 60 * 60,
                userProperties: {
                    source: 'node-client'
                }
            }
        };

        this.mqttClient = connect(url, options)
            .on('connect', async () => {
                this.emit('connected', 'MQTT v5 connected.');

                try {
                    await new Promise((resolve, reject) => {
                        this.mqttClient.subscribe(subscribeTopic,
                            {
                                qos: 1,
                                properties: {
                                    userProperties: {
                                        type: 'subscription'
                                    }
                                }
                            },
                            (error) => {
                                if (error) return reject(error);
                                resolve();
                            }
                        );
                    });

                    this.emit('connected', `MQTT Subscribe topic: ${subscribeTopic}`);
                } catch (error) {
                    if (config.logWarn) this.emit('warn', `MQTT Subscribe error: ${error.message}`);
                }
            })
            .on('message', (topic, payload, packet) => {
                try {
                    const parsedMessage = JSON.parse(payload.toString());
                    if (config.logDebug) this.emit('debug', `MQTT Received Topic: ${topic}, Payload: ${JSON.stringify(parsedMessage, null, 2)}`);

                    for (const [key, value] of Object.entries(parsedMessage)) {
                        this.emit('set', key, value);
                    }
                } catch (error) {
                    if (config.logWarn) this.emit('warn', `MQTT Parse error: ${error.message}`);
                }
            })
            .on('error', (error) => {
                this.emit('warn', `MQTT Error: ${error.message}`);
            })
            .on('reconnect', () => {
                if (config.logDebug) this.emit('debug', 'MQTT Reconnecting...');
            })
            .on('close', () => {
                if (config.logDebug) this.emit('debug', 'MQTT Connection closed.');
            });
    }

    publish(topic, message) {
        return new Promise((resolve, reject) => {
            const fullTopic = `${this.config.prefix}/${topic}`;
            const publishMessage = JSON.stringify(message);

            this.mqttClient.publish(fullTopic, publishMessage,
                {
                    qos: 1,
                    properties: {
                        contentType: 'application/json',
                        userProperties: {
                            source: 'node',
                            action: 'set'
                        }
                    }
                },
                (error) => {
                    if (error) {
                        if (this.config.logWarn) this.emit('warn', `MQTT Publish error: ${error.message}`);
                        return reject(error);
                    }

                    if (this.config.logDebug) this.emit('debug', `MQTT Publish Topic: ${fullTopic}, Payload: ${publishMessage}`);
                    resolve();
                }
            );
        });
    }
}

export default Mqtt;