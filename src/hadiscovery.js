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
        this.imageTopic = config.image ? `${mqtt.config.prefix}/HA Image` : null;

        this.sources = [];
        this.soundModes = [];
        this.state = {};
        this.lastConfig = '';
        this.lastState = '';
        this.lastImageKey = undefined;
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
            ...(this.imageTopic ? { image_topic: this.imageTopic } : {}),
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

    // Publish the image of the current source (app icon, channel picon) once per source.
    // key identifies the image, fetchImage returns a Buffer or null, null clears the image
    async updateImage(key, fetchImage) {
        if (!this.imageTopic || key === this.lastImageKey) return false;
        this.lastImageKey = key;

        let image = null;
        try {
            image = key ? await fetchImage() : null;
        } catch {
            // Network or device error, allow a retry on the next state update
            image = null;
            if (key === this.lastImageKey) this.lastImageKey = undefined;
            return false;
        }

        // The source changed again while fetching, a newer call publishes its own image
        if (key !== this.lastImageKey) return false;
        await this.mqtt.publishRetained(this.imageTopic, image ?? '');
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
