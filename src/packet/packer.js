const SimplePacket = require('./simple');
const MessagePacket = require('./message');

const Types = {
    d00d: 'message',
    cc00: 'simple.connectRequest',
    cc01: 'simple.connectResponse',
    dd00: 'simple.discoveryRequest',
    dd01: 'simple.discovery',
    dd02: 'simple.powerOn',
};

class PACKER {
    constructor(config) {
        this.type = config.type || '';

        const packetType = this.type.slice(0, 2).toString('hex');
        this.structure = '';

        if (packetType in Types) {
            // We got a packet that we need to unpack
            const packetValue = this.type;
            this.type = Types[packetType];
            this.structure = this.loadPacketStructure(this.type, packetValue);
        } else {
            this.structure = this.loadPacketStructure(this.type);
        };

    };

    set(key, value, protectedPayload = false) {
        this.structure.set(key, value, protectedPayload);
    };

    pack(smartglass = undefined) {
        return this.structure.pack(smartglass);
    };

    unpack(smartglass = undefined) {
        return this.structure.unpack(smartglass);
    };

    setChannel(channel) {
        this.structure.setChannel(channel);
    };

    loadPacketStructure(type, value = false) {
        if (type.slice(0, 6) == 'simple') {
            this.simplePacket = new SimplePacket(type.slice(7), value);
            return this.simplePacket;
        } else if (type.slice(0, 7) == 'message') {
            this.messagePacket = new MessagePacket(type.slice(8), value);
            return this.messagePacket;
        } else {
            return false;
        };
    };
};
module.exports = PACKER;