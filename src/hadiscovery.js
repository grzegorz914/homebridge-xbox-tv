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
        // Media browser icons requested by Home Assistant with the BrowseImage key, answered by answerBrowseImage
        this.browseImageTopic = config.browseImages ? `${mqtt.config.prefix}/HA Browse Image` : null;

        this.sources = [];
        this.soundModes = [];
        this.browse = [];
        this.state = {};
        this.lastConfig = '';
        this.lastState = '';
        this.lastImageKey = undefined;
    }

    // Publish (or republish when changed) the retained discovery message
    // browse: media browser folders [{ name, type, items: [{ id, name }] }], at most MaxBrowseItems items in total
    async publishConfig({ sources = this.sources, soundModes = this.soundModes, browse = this.browse } = {}) {
        this.sources = uniqueByName(sources);
        this.soundModes = uniqueByName(soundModes);
        this.browse = limitBrowse(browse);

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
            ...(this.browseImageTopic ? { browse_image_topic: this.browseImageTopic } : {}),
            device,
            commands: this.commands,
            sources: this.sources,
            sound_modes: this.soundModes,
            ...(this.browse.length > 0 ? { browse: this.browse } : {})
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

    // Answer a media browser icon request, not retained, an empty payload when the item has no icon
    async answerBrowseImage(key, fetchImage) {
        // The key becomes a topic level, only the md5 hex key of the integration is accepted
        if (!this.browseImageTopic || !/^[a-f0-9]{32}$/.test(String(key))) return false;

        let image = null;
        try {
            image = await fetchImage();
        } catch {
            image = null;
        }
        await new Promise(resolve => this.mqtt.mqttClient.publish(`${this.browseImageTopic}/${key}`, image ?? '', { qos: 0 }, () => resolve()));
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

// The discovery message stays small enough for the broker and Home Assistant, big bouquets are cut
const MaxBrowseItems = 2000;
function limitBrowse(folders) {
    let left = MaxBrowseItems;
    const result = [];
    for (const folder of folders ?? []) {
        const name = String(folder.name ?? '').trim();
        const items = (folder.items ?? [])
            .filter(item => item.id !== undefined && item.id !== null && String(item.name ?? '').trim())
            .slice(0, Math.max(left, 0))
            .map(item => ({ id: item.id, name: String(item.name).trim() }));
        if (!name || items.length === 0) continue;
        left -= items.length;
        result.push({ name, ...(folder.type ? { type: folder.type } : {}), items });
    }
    return result;
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
