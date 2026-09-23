// Home Assistant discovery for the MQTT Universal Media Player integration
// https://github.com/grzegorz914/homeassistant-mqtt-media-player
const PLATFORM = 'mqtt_universal_media_player';

class HaDiscovery {
    constructor(mqtt, config) {
        // + and # are MQTT wildcards, Home Assistant would subscribe to a pattern instead of the device topic
        if (/[+#]/.test(mqtt.config.prefix)) {
            throw new Error(`MQTT prefix ${mqtt.config.prefix} must not contain + or #, rename the device or set a prefix`);
        }

        this.mqtt = mqtt;
        this.objectId = String(config.objectId).replace(/[^a-zA-Z0-9_-]/g, '_');
        this.uniqueId = this.objectId;
        this.name = config.name;
        this.deviceClass = config.deviceClass;
        this.device = config.device ?? {};
        this.commands = config.commands ?? {};

        this.configTopic = `${mqtt.haPrefix}/media_player/${this.objectId}/config`;
        this.stateTopic = `${mqtt.config.prefix}/HA State`;
        this.commandTopic = `${mqtt.config.prefix}/Set`;

        this.sources = [];
        this.soundModes = [];
        this.state = {};
        this.lastConfig = '';
        this.lastState = '';
    }

    // Publish (or republish when changed) the retained discovery message
    async publishConfig({ sources = this.sources, soundModes = this.soundModes } = {}) {
        this.sources = uniqueByName(sources);
        this.soundModes = uniqueByName(soundModes);

        const device = { identifiers: [this.uniqueId], name: this.name };
        for (const [key, value] of Object.entries(this.device)) {
            if (value !== undefined && value !== null && value !== '') device[key] = String(value);
        }

        const config = {
            platform: PLATFORM,
            unique_id: this.uniqueId,
            device_class: this.deviceClass,
            state_topic: this.stateTopic,
            command_topic: this.commandTopic,
            availability_topic: this.mqtt.availabilityTopic,
            device,
            commands: this.commands,
            sources: this.sources,
            sound_modes: this.soundModes
        };

        const payload = JSON.stringify(config);
        if (payload === this.lastConfig) return false;
        this.lastConfig = payload;
        await this.mqtt.publishRetained(this.configTopic, payload);
        return true;
    }

    // Merge a partial state and publish it retained when something changed
    async updateState(partial) {
        for (const [key, value] of Object.entries(partial)) {
            if (value === undefined) continue;
            this.state[key] = value;
        }

        const payload = JSON.stringify(this.state);
        if (payload === this.lastState) return false;
        this.lastState = payload;
        await this.mqtt.publishRetained(this.stateTopic, payload);
        return true;
    }
}

// Home Assistant needs unique names, keep the first item for a duplicated name
function uniqueByName(items) {
    const seen = new Set();
    const result = [];
    for (const item of items) {
        const name = String(item.name ?? '').trim();
        if (!name || item.id === undefined || item.id === null || seen.has(name)) continue;
        seen.add(name);
        result.push({ ...item, name });
    }
    return result;
}

export default HaDiscovery;
