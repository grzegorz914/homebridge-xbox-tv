import { connect } from 'mqtt';
import EventEmitter from 'events';

class Mqtt extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;

        const url = `mqtt://${config.host}:${config.port}`;
        const subscribeTopic = `${config.prefix}/Set`;
        const protocolVersion = config.protocolVersion === 4 ? 4 : 5;
        const isV5 = protocolVersion === 5;
        this.isV5 = isV5;

        const options = {
            clientId: config.clientId,
            username: config.user,
            password: config.passwd,
            protocolVersion,
            clean: !isV5,
            ...(isV5 ? {
                properties: {
                    sessionExpiryInterval: 60 * 60,
                    userProperties: {
                        source: 'node-client'
                    }
                }
            } : {})
        };

        const startTime = Date.now();
        let hasConnected = false;
        let warnedStalled = false;

        this.mqttClient = connect(url, options)
            .on('connect', async () => {
                hasConnected = true;
                this.emit('connected', `MQTT v${protocolVersion} connected.`);

                try {
                    await new Promise((resolve, reject) => {
                        this.mqttClient.subscribe(subscribeTopic,
                            {
                                qos: 1,
                                ...(isV5 ? {
                                    properties: {
                                        userProperties: {
                                            type: 'subscription'
                                        }
                                    }
                                } : {})
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
                if (!hasConnected && !warnedStalled && Date.now() - startTime > 30000) {
                    warnedStalled = true;
                    this.emit('warn', `MQTT has not connected after 30s of retries using protocol v${protocolVersion}. Check broker address, credentials, and whether the broker supports this MQTT protocol version.`);
                }
                if (config.logDebug) this.emit('debug', 'MQTT Connection closed.');
            });
    }

    disconnect() {
        return new Promise((resolve) => {
            this.mqttClient.end(false, {}, resolve);
        });
    }

    publish(topic, message) {
        return new Promise((resolve, reject) => {
            const fullTopic = `${this.config.prefix}/${topic}`;
            const publishMessage = JSON.stringify(message);

            this.mqttClient.publish(fullTopic, publishMessage,
                {
                    qos: 1,
                    ...(this.isV5 ? {
                        properties: {
                            contentType: 'application/json',
                            userProperties: {
                                source: 'node',
                                action: 'set'
                            }
                        }
                    } : {})
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