const SimplePacket = require('./simple');
const MessagePacket = require('./message');

const Types = {
    d00d: 'message',
    cc00: 'simple.connectRequest',
    cc01: 'simple.connectResponse',
    dd00: 'simple.discoveryRequest',
    dd01: 'simple.discoveryResponse',
    dd02: 'simple.powerOn',
};

class PACKER {
    constructor(type) {
        const packetType = type.slice(0, 2).toString('hex');
        this.packetStructure = '';
        if (packetType in Types) {
            const packetValue = type;
            type = Types[packetType];
            this.packetStructure = this.loadPacketStructure(type, packetValue);
        } else {
            this.packetStructure = this.loadPacketStructure(type);
        };
        this.structure = this.packetStructure;
        this.type = type;
    };

    loadPacketStructure(type, value = false) {
        if (type.slice(0, 6) == 'simple') {
            return new SimplePacket(type.slice(7), value);
        } else if (type.slice(0, 7) == 'message') {
            return new MessagePacket(type.slice(8), value);
        } else {
            return false;
        };
    };

    set(key, value, protectedPayload = false) {
        this.structure.set(key, value, protectedPayload);
    };

    pack(smartglass = undefined) {
        return this.packetStructure.pack(smartglass);
    };

    unpack(smartglass = undefined) {
        return this.packetStructure.unpack(smartglass);
    };

    setChannel(channelId) {
        this.structure.setChannel(channelId);
    };
};
module.exports = PACKER;